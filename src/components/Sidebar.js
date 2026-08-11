// Left sidebar: brand, nav (with badges), "reviewing as" user switch, conn dot.
import { html } from '../html.js';

const TOP = [
  { id: 'dashboard', glyph: '▚', label: 'Dashboard' },
  { id: 'tasks', glyph: '▦', label: 'Priorities' },
  { id: 'roadmap', glyph: '▬', label: 'Product Roadmap' },
];
const AGENTIC = [
  { id: 'feedback', glyph: '◎', label: 'Feedback', badge: 'q', badgeCls: 'bg-amber-400/15 text-amber-300' },
  { id: 'reports', glyph: '▤', label: 'Reports', badge: 'r', badgeCls: 'bg-white/5 text-slate-400' },
  { id: 'agents', glyph: '⬡', label: 'Agents', badge: 'a', badgeCls: 'bg-white/5 text-slate-400' },
  { id: 'schedule', glyph: '◔', label: 'Schedule', badge: 's', badgeCls: 'bg-white/5 text-slate-400' },
  { id: 'activity', glyph: '≋', label: 'Activity' },
];

function NavBtn({ item, view, setView, badges }) {
  const active = view === item.id;
  const cls = 'nav w-full flex items-center gap-2.5 px-3 py-2 rounded-lg ' + (active ? 'text-white bg-panel2' : 'text-slate-400 hover:text-white hover:bg-panel2');
  const n = item.badge != null ? (badges[item.badge] || 0) : null;
  return html`
    <button class=${cls} onClick=${() => setView(item.id)}>
      <span>${item.glyph}</span> ${item.label}
      ${item.badge != null ? html`<span class="ml-auto text-[11px] font-mono px-1.5 rounded ${item.badgeCls} ${n ? '' : 'opacity-60'}">${n}</span>` : null}
    </button>`;
}

function UserBtn({ id, label, user, setUser }) {
  const active = user === id;
  return html`
    <button onClick=${() => setUser(id)} class="usr flex-1 text-xs py-1.5 rounded-lg ${active ? 'bg-panel2 text-white' : 'text-slate-400 hover:text-white'}">
      <img src="assets/${id}.jpg" alt=${label} class="rounded-full object-cover mr-1.5 align-middle inline-block border border-edge" style="width:18px;height:18px"/>${label}
    </button>`;
}

export function Sidebar({ view, setView, user, setUser, connected, badges }) {
  return html`
    <aside class="fixed inset-y-0 left-0 w-[220px] border-r border-edge bg-panel/60 backdrop-blur flex flex-col z-20">
      <div class="h-16 flex items-center gap-3 px-4 border-b border-edge">
        <div class="h-9 w-9 rounded-xl bg-gradient-to-br from-accent to-indigo-500 flex items-center justify-center text-ink">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>
        </div>
        <div class="leading-tight"><div class="text-white text-[15px] font-semibold">Host Modern</div><div class="text-[11px] font-mono uppercase tracking-widest text-slate-400">Command Center</div></div>
      </div>
      <nav class="p-2 space-y-0.5 text-sm flex-1">
        ${TOP.map(item => html`<${NavBtn} item=${item} view=${view} setView=${setView} badges=${badges}/>`)}
        <div class="px-3 pt-4 pb-1 text-[10px] uppercase tracking-widest text-slate-500">Agentic Layer</div>
        ${AGENTIC.map(item => html`<${NavBtn} item=${item} view=${view} setView=${setView} badges=${badges}/>`)}
      </nav>
      <div class="p-3 border-t border-edge">
        <div class="text-[10px] uppercase tracking-widest text-slate-400 mb-1.5">Reviewing as</div>
        <div class="flex gap-1">
          <${UserBtn} id="gabe" label="Gabe" user=${user} setUser=${setUser}/>
          <${UserBtn} id="collin" label="Collin" user=${user} setUser=${setUser}/>
        </div>
        <div class="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
          <span class="h-1.5 w-1.5 rounded-full ${connected ? 'bg-accent' : 'bg-slate-600'}"></span>${connected ? 'live' : 'offline · read-only'}
        </div>
      </div>
    </aside>`;
}
