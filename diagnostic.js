export async function runPersistenceDiagnostic(dev, onMessage = () => {}, sentinel = 0x73) {
  let original = null;
  let restoreAttempted = false;

  const restoreOriginal = async () => {
    if (!original || restoreAttempted) return;
    restoreAttempted = true;
    try {
      await dev.writeKey(0, original);
      await dev.save();
      onMessage('Original Key 1 binding restored.', 'info');
    } catch (e) {
      onMessage('Could not restore Key 1: ' + e.message, 'err');
    }
  };

  try {
    onMessage('Diagnostic: reading current Key 1…', 'info');
    original = await dev.readKey(0);
    if (!original) throw new Error('cannot read Key 1');

    onMessage('Writing sentinel F24 + flash save…');
    const wrote = await dev.writeKey(0, { keycode: sentinel });
    if (!wrote) {
      onMessage('Key 1 write returned NAK ✗', 'err');
      return { persisted: false, wrote: false };
    }
    const saved = await dev.save();
    if (!saved) {
      onMessage('Flash commit NAK, firmware likely rejects writes ✗', 'err');
      return { persisted: false, wrote: true };
    }

    const immediate = await dev.readKey(0);
    const immediateOk = immediate && immediate.keycode === sentinel;
    onMessage(`Immediate read-back: ${immediateOk ? 'F24 present ✓' : 'sentinel NOT present ✗'}`, immediateOk ? 'ok' : 'err');
    if (!immediateOk) return { persisted: false, wrote: true };

    onMessage('Now UNPLUG the pad, wait 2s, and PLUG IT BACK IN. Waiting…', 'info');
    await dev.reconnect();
    onMessage('Reconnected. Re-reading Key 1…', 'info');
    const after = await dev.readKey(0);
    const persisted = after && after.keycode === sentinel;
    onMessage(
      persisted
        ? 'VERDICT: firmware accepts persistent writes ✓. On-device remap is reliable.'
        : 'VERDICT: firmware silently rejects flash writes ✗. Bindings will not survive reboot on this unit.',
      persisted ? 'ok' : 'err',
    );
    return { persisted, wrote: true };
  } finally {
    await restoreOriginal();
  }
}
