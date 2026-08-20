// Section — a collapsible panel with a header that stays informative when closed.
//
// The point of collapsing is that a closed section should still tell you whether
// you need to open it. So `meta` (right-hand summary line) is not decoration:
// put the count, the state, and the one number that would make someone expand it
// there. A closed section with a blank header is just a hidden section.
//
// Open/closed state persists per `id` in localStorage, so the page you set up is
// the page you come back to. Storage is wrapped — Safari private mode throws on
// access rather than returning null.
import { html } from '../html.js';
import { useState } from 'preact/hooks';

const KEY = id => 'hm_cc_section_' + id;

function readOpen(id, fallback) {
  try {
    const v = localStorage.getItem(KEY(id));
    return v === null ? fallback : v === '1';
  } catch { return fallback; }
}

export function Section({ id, title, subtitle, meta, count, tone, defaultOpen = true, children }) {
  const [open, setOpen] = useState(() => readOpen(id, defaultOpen));

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(KEY(id), next ? '1' : '0'); } catch {}
  };

  return html`
    <div class="rounded-xl border border-edge bg-panel">
      <button onClick=${toggle}
        class="w-full text-left px-4 py-3 flex items-center gap-3 flex-wrap hover:bg-white/[0.02] rounded-xl">
        <span class="text-slate-500 text-xs w-3 shrink-0">${open ? '▾' : '▸'}</span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-white text-[15px] font-medium">${title}</span>
            ${count != null ? html`
              <span class="text-[11px] px-1.5 py-0.5 rounded-full border border-edge ${tone || 'text-slate-400'}">${count}</span>` : null}
          </div>
          ${subtitle ? html`<div class="text-[12px] text-slate-400 mt-0.5">${subtitle}</div>` : null}
        </div>
        ${meta ? html`<div class="text-[11px] font-mono text-slate-500 text-right shrink-0">${meta}</div>` : null}
      </button>
      ${open ? html`<div class="border-t border-edge">${children}</div>` : null}
    </div>`;
}

// Disclosure — the smaller sibling, for a pile of finished things inside a
// section. Not persisted: concluded lists should default shut on every visit.
export function Disclosure({ label, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return html`
    <div>
      <button onClick=${() => setOpen(!open)}
        class="text-[12px] text-slate-400 hover:text-white">
        ${open ? '▾' : '▸'} ${label}
      </button>
      ${open ? html`<div class="mt-2.5 space-y-2.5">${children}</div>` : null}
    </div>`;
}
