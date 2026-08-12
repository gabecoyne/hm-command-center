// Toast notifications + clipboard prompt copy. banner()/copyPrompt() are
// module-level so any view can fire a toast without prop drilling.
import { html } from '../html.js';
import { useState, useEffect } from 'preact/hooks';

let seq = 0;
let toasts = [];
const listeners = new Set();
const emit = () => listeners.forEach(l => l());

function dismiss(id) { toasts = toasts.filter(t => t.id !== id); emit(); }

export function banner(kind, msg) {
  const id = ++seq;
  toasts = [...toasts, { id, kind, msg }];
  emit();
  setTimeout(() => dismiss(id), kind === 'err' ? 6000 : 4000);
}

export async function copyPrompt(text) {
  try { await navigator.clipboard.writeText(text); banner('ok', 'Prompt copied — open a new Claude chat and paste it to start with the right context.'); }
  catch { banner('err', 'Copy failed — select the prompt text and copy it manually.'); }
}

export function Toasts() {
  const [, force] = useState(0);
  useEffect(() => { const l = () => force(n => n + 1); listeners.add(l); return () => listeners.delete(l); }, []);
  return html`
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[340px] max-w-[calc(100vw-2rem)] pointer-events-none">
      ${toasts.map(t => html`
        <div key=${t.id} class="toast pointer-events-auto flex items-start gap-2 text-sm rounded-lg px-3.5 py-2.5 shadow-xl border ${t.kind === 'err' ? 'bg-rose-500/15 text-rose-200 border-rose-500/30' : 'bg-panel text-emerald-200 border-accent/30'}">
          <div class="flex-1 min-w-0" dangerouslySetInnerHTML=${{ __html: t.msg }}></div>
          <button class="text-slate-400 hover:text-white leading-none shrink-0" onClick=${() => dismiss(t.id)}>✕</button>
        </div>`)}
    </div>`;
}
