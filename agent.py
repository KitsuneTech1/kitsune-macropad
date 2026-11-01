#!/usr/bin/env python3
"""MacroPad Local HID agent.

Does the actual USB HID talking (which browsers can't do in Firefox) and serves
the web UI + a small JSON API on http://localhost:17890. Any browser works.

Protocol (SayoDevice O3C family, VID 0x8089):
  packet = [cmd, len, *payload, checksum, ...0]  (63 data bytes after the report id)
  checksum = (report_id + cmd + len + sum(payload)) & 0xFF, at offset 2+len
  cmd 0x00 init · cmd 0x16 key (read pat=0 / write pat=1) · cmd 0x04 save ([0x72,0x96])
"""
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import hid  # pip install hidapi
except ImportError:
    print("Missing dependency. Run:  python -m pip install hidapi", file=sys.stderr)
    sys.exit(1)

VENDOR_ID = 0x8089
PACKET_LEN = 63
PORT = 17890  # 8770 is inside a Windows OS-reserved port range; avoid it
ROOT = os.path.dirname(os.path.abspath(__file__))
KEY_COUNT = 3
MAX_JSON_BODY = 16 * 1024
MAX_PAYLOAD = PACKET_LEN - 3

KEY_CMD_CANDIDATES = [0x16, 0x06, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d,
                      0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23]


class Sayo:
    # Within the 0x16 key-config response (after the 2-byte cmd/len header), the
    # tap keycode sits at data offset 21 and is mirrored at 27 (key-down / key-up).
    # Relative to the 44-byte config body (data[4:48]) those are indices 17 and 23.
    KC_OFF = (17, 23)

    def __init__(self):
        self._lock = threading.RLock()
        self.dev = None
        self.report_id = 2
        self.key_cmd = 0x16
        self.model = None
        self.version = None
        self.name = None
        self.log = []
        self.bodies = {}  # cached per-key config body, to preserve analog settings on write

    def _log(self, tag, msg):
        with self._lock:
            line = f"[{tag}] {msg}"
            self.log.append(line)
            if len(self.log) > 200:
                self.log = self.log[-200:]

    def get_log(self):
        with self._lock:
            return list(self.log)

    def _find_path(self):
        cands = [d for d in hid.enumerate(VENDOR_ID, 0)]
        if not cands:
            return None
        vendor = [d for d in cands if d.get("usage_page", 0) >= 0xff00]
        chosen = (vendor or cands)[0]
        self.name = chosen.get("product_string") or "SayoDevice"
        return chosen["path"]

    def open(self):
        with self._lock:
            path = self._find_path()
            if not path:
                raise RuntimeError("No SayoDevice found (VID 0x8089). Is it plugged in?")
            if self.dev:
                self.close()
            device = hid.device()
            self.dev = device
            try:
                device.open_path(path)
                device.set_nonblocking(0)
                self.bodies.clear()
                self._log("open", f"{self.name or 'SayoDevice'} connected")
                self._detect()
            except Exception:
                try:
                    device.close()
                finally:
                    self.dev = None
                    self.bodies.clear()
                raise

    def close(self):
        with self._lock:
            try:
                if self.dev:
                    self.dev.close()
            finally:
                self.dev = None
                self.bodies.clear()

    def _checksum(self, cmd, ln, payload):
        s = (self.report_id + cmd + ln + sum(payload)) & 0xff
        return s

    def _send(self, cmd, payload=()):
        with self._lock:
            payload = list(payload)
            if not isinstance(cmd, int) or not 0 <= cmd <= 0xff:
                raise ValueError("command must be an unsigned byte")
            if not all(isinstance(b, int) and 0 <= b <= 0xff for b in payload):
                raise ValueError("payload must contain unsigned bytes")
            if len(payload) > MAX_PAYLOAD:
                raise ValueError(f"payload exceeds {MAX_PAYLOAD} bytes")
            buf = [0] * PACKET_LEN
            buf[0] = cmd
            buf[1] = len(payload)
            for i, b in enumerate(payload):
                buf[2 + i] = b
            buf[2 + len(payload)] = self._checksum(cmd, len(payload), payload)
            self._log("tx", f"rid {self.report_id} cmd 0x{cmd:02x}: " +
                      " ".join(f"{x:02x}" for x in buf[:12]))
            self.dev.write([self.report_id] + buf)
            deadline = time.time() + 1.5
            while time.time() < deadline:
                r = self.dev.read(65, timeout_ms=400)
                if r:
                    data = r[1:] if r[0] == self.report_id else r
                    self._log("rx", " ".join(f"{x:02x}" for x in data[:12]))
                    return data
            raise RuntimeError("Device did not respond (timeout).")

    def _detect(self):
        with self._lock:
            self.model = None
            self.version = None
            self.key_cmd = 0x16
            now = time.localtime()
            payload = [now.tm_mday, now.tm_hour, now.tm_min, now.tm_sec]
            # Try report id 2, then 33 if no response.
            for rid in (2, 33):
                self.report_id = rid
                try:
                    data = self._send(0x00, payload)
                except RuntimeError:
                    continue
                if not data or len(data) < 6 or not isinstance(data[1], int) or data[1] < 6:
                    continue
                self.version = (data[3] << 8) | data[2]
                self.model = (data[5] << 8) | data[4]
                support_end = min(len(data), 2 + data[1])
                support = list(data[8:support_end]) if data[1] > 6 else []
                for c in KEY_CMD_CANDIDATES:
                    if c in support:
                        self.key_cmd = c
                        break
                self._log("init", f"model 0x{(self.model or 0):x} ver 0x{(self.version or 0):x} "
                                  f"rid {rid} keyCmd 0x{self.key_cmd:02x} support {support}")
                return
            self.report_id = 2
            self._log("init", "no valid INIT response; defaults rid 2 keyCmd 0x16")

    def read_key(self, index):
        with self._lock:
            validate_key_index(index)
            data = self._send(self.key_cmd, [0, index])
            if (not data or len(data) < 48 or data[0] != 0x00 or
                    not isinstance(data[1], int) or data[1] < 8):
                return None
            body = list(data[4:48])          # 44-byte config body; cached for write-back
            self.bodies[index] = body
            return {"keycode": body[self.KC_OFF[0]]}

    def write_key(self, index, keycode=0, **_ignore):
        with self._lock:
            validate_key_index(index)
            validate_keycode(keycode)
            # Preserve the analog/actuation bytes: edit only the keycode in the cached body.
            body = self.bodies.get(index)
            if body is None:
                self.read_key(index)
                body = self.bodies.get(index)
                if body is None:
                    raise RuntimeError(f"Could not read key {index + 1} before writing")
            body = list(body)
            for off in self.KC_OFF:
                body[off] = keycode
            data = self._send(self.key_cmd, [1, index] + body)
            ok = bool(data) and data[0] == 0x00
            if ok:
                self.bodies[index] = body
            return ok

    def save(self):
        with self._lock:
            saved = self.report_id
            self.report_id = 2  # flash save lives on report id 2
            try:
                data = self._send(0x04, [0x72, 0x96])
                return bool(data) and data[0] == 0x00
            finally:
                self.report_id = saved


SAYO = Sayo()


def validate_key_index(index):
    if isinstance(index, bool) or not isinstance(index, int) or not 0 <= index < KEY_COUNT:
        raise ValueError(f"index must be an integer from 0 to {KEY_COUNT - 1}")
    return index


def validate_keycode(keycode):
    if isinstance(keycode, bool) or not isinstance(keycode, int) or not 0 <= keycode <= 0xff:
        raise ValueError("keycode must be an integer from 0 to 255")
    return keycode


def validate_key_request(body):
    if not isinstance(body, dict):
        raise ValueError("request body must be a JSON object")
    return validate_key_index(body.get("index")), validate_keycode(body.get("keycode", 0))


def parse_json_body(raw):
    if len(raw) > MAX_JSON_BODY:
        raise ValueError("request body is too large")
    try:
        body = json.loads(raw or b"{}")
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("request body must be valid JSON") from exc
    if not isinstance(body, dict):
        raise ValueError("request body must be a JSON object")
    return body


def is_allowed_origin(origin):
    return not origin or origin in {f"http://localhost:{PORT}", f"http://127.0.0.1:{PORT}"}

STATIC = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8", ".json": "application/json"}
PUBLIC_STATIC_FILES = {
    "index.html", "styles.css", "ui.js", "client.js", "keymap.js",
    "ui-utils.js", "save-logic.js", "diagnostic.js",
}


def resolve_static_path(path):
    """Return a requested public static file below ROOT."""
    if path == "/":
        path = "/index.html"
    relative = path.lstrip("/")
    if relative not in PUBLIC_STATIC_FILES:
        return None
    root = os.path.realpath(ROOT)
    fp = os.path.realpath(os.path.join(root, relative))
    try:
        inside_root = os.path.commonpath((root, fp)) == root
    except ValueError:
        inside_root = False
    return fp if inside_root and os.path.isfile(fp) else None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        try:
            n = int(self.headers.get("Content-Length", 0))
        except (TypeError, ValueError) as exc:
            raise ValueError("invalid Content-Length") from exc
        if n < 0 or n > MAX_JSON_BODY:
            raise ValueError("request body is too large")
        raw = self.rfile.read(n) if n else b"{}"
        if n and len(raw) != n:
            raise ValueError("incomplete request body")
        return parse_json_body(raw)

    def do_GET(self):
        path = self.path.split("?")[0]
        try:
            if not is_allowed_origin(self.headers.get("Origin")):
                return self._json(403, {"ok": False, "error": "cross-origin request denied"})
            if path == "/api/connect":
                return self._json(405, {"ok": False, "error": "connect must use POST"})
            if path == "/api/keys":
                return self._json(200, {"ok": True, "keys": [SAYO.read_key(i) for i in range(KEY_COUNT)]})
            if path == "/api/log":
                return self._json(200, {"log": SAYO.get_log()})
            return self._static(path)
        except ValueError as e:
            return self._json(400, {"ok": False, "error": str(e)})
        except Exception as e:  # noqa: BLE001 - surface device errors to the UI
            return self._json(500, {"ok": False, "error": str(e)})

    def do_POST(self):
        try:
            if not is_allowed_origin(self.headers.get("Origin")):
                return self._json(403, {"ok": False, "error": "cross-origin request denied"})
            body = self._read_body()
            if self.path == "/api/connect":
                SAYO.open()
                return self._json(200, {"ok": True, "name": SAYO.name, "model": SAYO.model,
                                        "version": SAYO.version, "keyCmd": SAYO.key_cmd,
                                        "reportId": SAYO.report_id})
            if self.path == "/api/key":
                index, keycode = validate_key_request(body)
                ok = SAYO.write_key(index, keycode)
                return self._json(200, {"ok": ok})
            if self.path == "/api/save":
                return self._json(200, {"ok": SAYO.save()})
            if self.path == "/api/reconnect":
                SAYO.close()
                # poll for the device to reappear after a replug
                deadline = time.time() + 20
                last = None
                while time.time() < deadline:
                    try:
                        SAYO.open()
                        return self._json(200, {"ok": True})
                    except Exception as e:  # noqa: BLE001
                        last = str(e)
                        time.sleep(0.5)
                return self._json(500, {"ok": False, "error": last or "device did not reappear"})
            return self._json(404, {"ok": False, "error": "unknown endpoint"})
        except ValueError as e:
            return self._json(400, {"ok": False, "error": str(e)})
        except Exception as e:  # noqa: BLE001
            return self._json(500, {"ok": False, "error": str(e)})

    def _static(self, path):
        fp = resolve_static_path(path)
        if fp is None:
            self.send_response(404)
            self.end_headers()
            return
        with open(fp, "rb") as f:
            data = f.read()
        ext = os.path.splitext(fp)[1].lower()
        self.send_response(200)
        self.send_header("Content-Type", STATIC.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://localhost:{PORT}/"
    print(f"MacroPad Local on {url}  (Ctrl+C to stop)")
    try:
        import webbrowser
        webbrowser.open(url)
    except Exception:  # noqa: BLE001 - opening a browser tab is optional, ignore if it fails
        pass
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
