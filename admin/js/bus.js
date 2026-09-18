// Tiny pub/sub so admin panels can tell each other "my data changed" without
// a page reload. E.g. adding a commander in the Commanders tab should
// immediately refresh the commander <select> used when creating an entry.

const target = new EventTarget();

export function emit(name, detail) {
  target.dispatchEvent(new CustomEvent(name, { detail }));
}

export function on(name, handler) {
  target.addEventListener(name, (e) => handler(e.detail));
}
