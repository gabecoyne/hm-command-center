// Top header: view title + the Gabe/Collin/All "who" filter (Attention only).
import { html } from '../html.js';

function WhoBtn({ id, label, who, setWho }) {
  const active = who === id;
  return html`<button onClick=${() => setWho(id)} class="who px-2.5 py-1 rounded-lg ${active ? 'bg-panel2 text-white' : 'text-slate-400 hover:text-white'}">${label}</button>`;
}

export function Header({ title, showWho, who, setWho, onMenu }) {
  return html`
    <header class="sticky top-0 z-10 h-14 border-b border-edge bg-ink/85 backdrop-blur flex items-center gap-3 px-4 md:px-6">
      <button onClick=${onMenu} aria-label="Open menu" class="md:hidden -ml-1 p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-panel2 text-xl leading-none">☰</button>
      <h1 class="text-white font-semibold">${title}</h1>
      <div class="ml-auto flex items-center gap-2">
        <div class="hidden sm:flex items-center gap-1 text-xs mr-1" style=${{ visibility: showWho ? 'visible' : 'hidden' }}>
          <${WhoBtn} id="all" label="All" who=${who} setWho=${setWho}/>
          <${WhoBtn} id="gabe" label="Gabe" who=${who} setWho=${setWho}/>
          <${WhoBtn} id="collin" label="Collin" who=${who} setWho=${setWho}/>
        </div>
      </div>
    </header>`;
}
