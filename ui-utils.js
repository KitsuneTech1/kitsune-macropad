const STATUS_CLASSES = new Set(['info', 'ok', 'err']);

function makeStatusSpan(documentRef, message, cls) {
  const span = documentRef.createElement('span');
  span.className = STATUS_CLASSES.has(cls) ? cls : 'info';
  span.textContent = String(message);
  return span;
}

export function setStatusText(element, message, cls = 'info', documentRef = globalThis.document) {
  element.replaceChildren(makeStatusSpan(documentRef, message, cls));
}

export function appendStatusText(element, message, cls = 'info', documentRef = globalThis.document) {
  if (element.childNodes.length) element.appendChild(documentRef.createTextNode('\n'));
  element.appendChild(makeStatusSpan(documentRef, message, cls));
}
