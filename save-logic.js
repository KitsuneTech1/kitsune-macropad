export async function writeBindingsAndSave(dev, bindings, count, onResult = () => {}) {
  for (let i = 0; i < count; i++) {
    const binding = bindings[i] || { keycode: 0 };
    const ok = await dev.writeKey(i, binding);
    onResult(i, ok);
    if (!ok) return { written: false, saved: false };
  }
  return { written: true, saved: await dev.save() };
}
