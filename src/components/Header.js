// Top header: view title + the mobile menu button.
//
// The All/Gabe/Collin filter used to live here, duplicating the sidebar's "Reviewing as" control
// and disagreeing with it — the header defaulted to All while you were reviewing as one person.
// Reviewing-as is now the single source of who you are (2026-08-17); the Feedback view carries its
// own person filter for looking at someone else's queue without changing who you're acting as.
import { html } from '../html.js';

export function Header({ title, onMenu }) {
  return html`
    <header class="sticky top-0 z-10 h-14 border-b border-edge bg-ink/85 backdrop-blur flex items-center gap-3 px-4 md:px-6">
      <button onClick=${onMenu} aria-label="Open menu" class="md:hidden -ml-1 p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-panel2 text-xl leading-none">☰</button>
      <h1 class="text-white font-semibold">${title}</h1>
    </header>`;
}
