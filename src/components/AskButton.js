// The little chat icon that copies a context-rich prompt to the clipboard.
// Replaces the monolith's data-ask delegation with a real onClick.
import { html } from '../html.js';
import { copyPrompt } from './Toasts.js';

export const CHAT_SVG = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

export function AskButton(props) {
  const cls = props.class || 'absolute top-2 right-2 z-[2] h-6 w-6 grid place-items-center rounded-md text-slate-400 hover:text-white hover:bg-white/10 opacity-70 hover:opacity-100 transition';
  return html`<button type="button" title="Chat about this" aria-label="Chat" onClick=${e => { e.stopPropagation(); copyPrompt(props.prompt || ''); }} class=${cls}>${CHAT_SVG}</button>`;
}
