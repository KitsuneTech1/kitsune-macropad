import agent


class FakeDevice:
    def __init__(self, response=None):
        self.response = response if response is not None else [2, 0, 0]
        self.writes = []
        self.closed = False

    def write(self, packet):
        self.writes.append(packet)

    def read(self, _size, timeout_ms=None):
        return self.response

    def close(self):
        self.closed = True

    def set_nonblocking(self, _value):
        pass

    def open_path(self, _path):
        pass


def test_send_builds_report_packet_and_strips_report_id():
    sayo = agent.Sayo()
    sayo.dev = FakeDevice([2, 0xAA, 0xBB])

    result = sayo._send(0x10, [1, 2])

    packet = sayo.dev.writes[0]
    assert len(packet) == agent.PACKET_LEN + 1
    assert packet[:4] == [2, 0x10, 2, 1]
    assert packet[4] == 2
    assert packet[5] == (2 + 0x10 + 2 + 1 + 2) & 0xFF
    assert result == [0xAA, 0xBB]


def test_send_rejects_payloads_that_cannot_fit_the_wire_packet():
    sayo = agent.Sayo()
    sayo.dev = FakeDevice()

    import pytest

    with pytest.raises(ValueError, match="payload exceeds"):
        sayo._send(0x10, [0] * (agent.MAX_PAYLOAD + 1))
    with pytest.raises(ValueError, match="unsigned bytes"):
        sayo._send(0x10, [256])


def test_read_and_write_preserve_the_unchanged_config_bytes():
    sayo = agent.Sayo()
    body = list(range(44))
    sent = []

    def fake_send(_cmd, payload):
        sent.append(list(payload))
        if payload[0] == 0:
            return [0, 48, 0, 0] + body
        return [0]

    sayo._send = fake_send

    assert sayo.read_key(0) == {"keycode": 17}
    assert sayo.write_key(0, 0xAB) is True
    assert sent[1][:2] == [1, 0]
    assert sent[1][2 + 17] == 0xAB
    assert sent[1][2 + 23] == 0xAB
    assert sent[1][2:2 + 17] == body[:17]
    assert sent[1][2 + 18:2 + 23] == body[18:23]
    assert sent[1][2 + 24:] == body[24:]


def test_malformed_key_response_is_rejected_without_indexing_missing_bytes():
    sayo = agent.Sayo()
    sayo._send = lambda _cmd, _payload: [0, 48, 0]

    assert sayo.read_key(0) is None


def test_key_inputs_are_bounded_before_reaching_the_device():
    import pytest

    with pytest.raises(ValueError):
        agent.validate_key_index(-1)
    with pytest.raises(ValueError):
        agent.validate_key_index(True)
    with pytest.raises(ValueError):
        agent.validate_keycode(256)
    with pytest.raises(ValueError):
        agent.validate_keycode("17")
    assert agent.validate_key_request({"index": 2, "keycode": 0x73}) == (2, 0x73)


def test_json_body_parser_rejects_non_objects_and_oversized_bodies():
    import pytest

    with pytest.raises(ValueError, match="JSON object"):
        agent.parse_json_body(b"[]")
    with pytest.raises(ValueError, match="too large"):
        agent.parse_json_body(b"x" * (agent.MAX_JSON_BODY + 1))


def test_save_uses_report_id_two_and_restores_the_active_report_id():
    sayo = agent.Sayo()
    sayo.report_id = 33
    seen = []

    def fake_send(cmd, payload):
        seen.append((cmd, list(payload), sayo.report_id))
        return [0]

    sayo._send = fake_send

    assert sayo.save() is True
    assert seen == [(0x04, [0x72, 0x96], 2)]
    assert sayo.report_id == 33


def test_detect_resets_device_specific_state_before_probing():
    sayo = agent.Sayo()
    sayo.key_cmd = 0x06
    sayo.model = 123
    sayo.version = 456
    sayo._send = lambda _cmd, _payload: [0, 7, 1, 2, 3, 4, 5, 6]

    sayo._detect()

    assert sayo.key_cmd == 0x16
    assert sayo.model == 0x0403
    assert sayo.version == 0x0201


def test_reopening_closes_old_device_and_drops_cached_key_bodies(monkeypatch):
    sayo = agent.Sayo()
    old = FakeDevice()
    new = FakeDevice()
    sayo.dev = old
    sayo.bodies[0] = [1, 2, 3]
    sayo._detect = lambda: None

    class Hid:
        @staticmethod
        def enumerate(_vendor, _product):
            return [{"usage_page": 0xFF00, "path": "new", "product_string": "Test Pad"}]

        @staticmethod
        def device():
            return new

    monkeypatch.setattr(agent, "hid", Hid)

    sayo.open()

    assert old.closed is True
    assert sayo.dev is new
    assert sayo.bodies == {}


def test_open_cleans_up_when_detection_fails(monkeypatch):
    sayo = agent.Sayo()
    device = FakeDevice()
    sayo._detect = lambda: (_ for _ in ()).throw(RuntimeError("bad response"))

    class Hid:
        @staticmethod
        def enumerate(_vendor, _product):
            return [{"usage_page": 0xFF00, "path": "device-path", "product_string": "Test Pad"}]

        @staticmethod
        def device():
            return device

    monkeypatch.setattr(agent, "hid", Hid)

    import pytest

    with pytest.raises(RuntimeError, match="bad response"):
        sayo.open()
    assert device.closed is True
    assert sayo.dev is None


def test_device_path_is_not_written_to_the_log(monkeypatch):
    sayo = agent.Sayo()
    device_path = "private-device-path"

    class Hid:
        @staticmethod
        def enumerate(_vendor, _product):
            return [{"usage_page": 0xFF00, "path": device_path, "product_string": "Test Pad"}]

        @staticmethod
        def device():
            return FakeDevice()

    monkeypatch.setattr(agent, "hid", Hid)
    sayo._detect = lambda: None
    sayo.open()

    assert device_path not in "\n".join(sayo.get_log())


def test_static_paths_cannot_escape_the_application_root(monkeypatch):
    root = agent.os.path.abspath("application-root")
    safe = agent.os.path.join(root, "index.html")
    diagnostic = agent.os.path.join(root, "diagnostic.js")
    monkeypatch.setattr(agent, "ROOT", root)
    monkeypatch.setattr(agent.os.path, "isfile", lambda path: path in {safe, diagnostic})

    assert agent.resolve_static_path("/index.html") == safe
    assert agent.resolve_static_path("/../application-root-sibling/secret.txt") is None
    assert agent.resolve_static_path("/README.md") is None
    assert agent.resolve_static_path("/.git/config") is None
    assert agent.resolve_static_path("/diagnostic.js") == diagnostic


def test_cross_origin_requests_are_not_allowed_to_use_the_local_api():
    assert agent.is_allowed_origin(None) is True
    assert agent.is_allowed_origin(f"http://localhost:{agent.PORT}") is True
    assert agent.is_allowed_origin("cross-origin") is False
