// Small DOM helpers: element builder, toasts, modal, context menu.
type Attrs = Record<string, unknown>;
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string | null | false | undefined)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k in el && k !== 'list' && typeof v !== 'string') (el as unknown as Attrs)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}
export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function toast(msg: string, kind: '' | 'ok' | 'err' = '', action?: { label: string; run: () => void }, ms = 3200) {
  const t = h('div', { class: 'toast ' + kind }, msg);
  if (action) t.append(h('button', { onclick: () => { action.run(); t.remove(); } }, action.label));
  $('toasts').append(t); setTimeout(() => t.remove(), action ? ms * 2 : ms);
}

export function modal(build: (close: () => void) => HTMLElement, onClose?: () => void) {
  const m = $('modal'); m.innerHTML = ''; m.hidden = false;
  const close = () => { m.hidden = true; m.innerHTML = ''; document.removeEventListener('keydown', esc); onClose?.(); };
  const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', esc);
  const box = build(close); box.classList.add('box');
  box.prepend(h('button', { class: 'x', onclick: close, 'aria-label': 'ปิด' }, '×'));
  m.append(box); m.onclick = e => { if (e.target === m) close(); };
  return close;
}
export const modalOpen = () => !$('modal').hidden;

export type MenuItem = { label: string; kbd?: string; run: () => void } | '-';
export function menu(x: number, y: number, items: MenuItem[]) {
  const m = $('menu'); m.innerHTML = ''; m.hidden = false;
  for (const it of items) m.append(it === '-' ? h('hr') : h('button', { onclick: () => { m.hidden = true; it.run(); } }, it.label, it.kbd ? h('kbd', {}, it.kbd) : null));
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px'; m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  const off = (e: Event) => { if (!m.contains(e.target as Node)) { m.hidden = true; document.removeEventListener('pointerdown', off, true); } };
  setTimeout(() => document.addEventListener('pointerdown', off, true));
}
export function download(name: string, data: string | Blob, type = 'application/json') {
  const b = typeof data === 'string' ? new Blob([data], { type }) : data, a = h('a', { href: URL.createObjectURL(b), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
