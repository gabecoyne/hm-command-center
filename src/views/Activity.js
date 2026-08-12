// Activity view — the event-log feed with filter, contributor chips, and a
// detail drawer. Ported from the monolith's renderChips/renderActivity/openActivity.
import { html } from '../html.js';
import { useState } from 'preact/hooks';
import { useStore } from '../state.js';
import { esc, mdToHtml } from '../lib/format.js';
import { copyPrompt } from '../components/Toasts.js';

// ---- view-specific helpers (copied verbatim from the monolith) ----
const CONTRIBS = [
  { label: "Gabe", tokens: ["gabe"] }, { label: "Collin", tokens: ["collin"] },
  { label: "Media Buyer", tokens: ["media-buyer", "media buyer"] },
  { label: "Feed / QC", tokens: ["media-qc", "merch"] },
  { label: "SEO", tokens: ["seo"] }, { label: "CRO", tokens: ["cro"] }, { label: "AEO", tokens: ["aeo"] },
  { label: "Social", tokens: ["comment-marketing", "comment-manager"] },
  { label: "Lifecycle", tokens: ["klaviyo"] },
  { label: "Finance", tokens: ["daily-finance", "fin-", "unit-econ"] },
  { label: "CS", tokens: ["gorgias", "cs-approval", "cs-learning", "csat"] },
  { label: "Inventory", tokens: ["inventory", "stuck-ship", "inbound"] },
];
function matchTokens(e, tokens) { const hay = `${e.who || ""} ${e.source || ""} ${e.summary || ""} ${e.entity || ""}`.toLowerCase(); return tokens.some(t => hay.includes(t)); }
function skillBase(p) { if (!p) return ""; const m = String(p).match(/([^/]+)\/SKILL/i); return (m ? m[1] : String(p).split("/").pop()).toLowerCase(); }
function agentKeys(a) { const ks = new Set(); if (a.id) ks.add(String(a.id).toLowerCase()); const sb = skillBase(a.skill); if (sb) ks.add(sb); (a.skills || []).forEach(s => { ks.add(String(s).toLowerCase()); const b = skillBase(s); if (b) ks.add(b); }); (a.match || []).forEach(m => ks.add(String(m).toLowerCase())); return [...ks].filter(Boolean); }
function logPrompt(e, a) { return `On ${e.date || ""}, ${a ? a.id + " (" + (e.source || "") + ")" : (e.source || "an agent")} did: "${e.summary || ""}"${e.entity ? " on " + e.entity : ""}. ${e.details ? "Details: " + e.details + ". " : ""}Pull the current metrics for that entity and tell me whether this change is working and what to do next.`; }

// The activity detail drawer body (everything except the declarative chat button).
function actBodyHtml(e, a) {
  const bd = 'font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-white/5 text-slate-400';
  return `
    <div class="flex flex-wrap items-center gap-2 mb-3"><span class="font-mono text-[11px] px-2 py-0.5 rounded bg-white/10 text-white">${esc(e.source || "agent")}</span>${e.type ? `<span class="${bd}">${esc(e.type)}</span>` : ""}${e.platform ? `<span class="${bd}">${esc(e.platform)}</span>` : ""}${e.client_type ? `<span class="${bd}">${esc(e.client_type)}</span>` : ""}<span class="text-[11px] font-mono text-slate-400 ml-auto">${esc(e.date || "")}</span></div>
    <div class="text-[10px] uppercase tracking-widest text-slate-400 mb-1">What happened</div><p class="text-sm text-white leading-relaxed">${esc(e.summary || "")}</p>
    ${e.details ? `<div class="text-[10px] uppercase tracking-widest text-slate-400 mb-1 mt-4">Detail</div><div class="md-body">${mdToHtml(e.details)}</div>` : `<p class="text-[12px] text-slate-400 mt-3">No extra detail was logged for this event beyond the summary above.</p>`}
    ${e.entity ? `<div class="text-[10px] uppercase tracking-widest text-slate-400 mb-1 mt-4">Entity</div><div class="font-mono text-[12px] text-slate-300 break-words">${esc(e.entity)}</div>` : ""}
    ${(e.who || a) ? `<div class="mt-4 text-[11px] text-slate-400">${e.who ? `by <span class="text-slate-300">${esc(e.who)}</span>` : ""}${a ? `${e.who ? " · " : ""}agent <span class="font-mono text-slate-300">${esc(a.id)}</span>` : ""}</div>` : ""}`;
}

// One activity row (the summary/entity meta line kept as raw HTML for exactness).
function Row({ e, onOpen }) {
  const tc = (e.type || "").includes("ad") ? "text-indigo-300" : ((e.type || "").includes("website") || (e.type || "").includes("seo")) ? "text-sky-300" : "text-slate-300";
  const meta = `${e.who ? esc(e.who) : ""}${e.entity ? ` · <span class="font-mono">${esc(e.entity)}</span>` : ""}${e.client_type ? ` · ${esc(e.client_type)}` : ""}`;
  return html`
    <div class="actrow flex items-start gap-3 px-4 py-2.5 hover:bg-panel2/40 cursor-pointer" onClick=${() => onOpen(e)}>
      <span class="text-[10px] font-mono text-slate-400 mt-0.5 w-16 shrink-0">${e.date || ""}</span>
      <span class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/5 ${tc} shrink-0 max-w-[150px] truncate" title=${e.source || ""}>${e.source || "—"}</span>
      <div class="flex-1 min-w-0">
        <div class="text-[13px] text-slate-200">${e.summary || ""}</div>
        <div class="text-[11px] text-slate-400 mt-0.5" dangerouslySetInnerHTML=${{ __html: meta }}></div>
      </div>
      <span class="text-[10px] text-emerald-400/70 shrink-0 mt-0.5">Details ›</span>
    </div>`;
}

function Drawer({ e, agents, onClose }) {
  if (!e) return null;
  const a = (agents || []).find(x => agentKeys(x).some(k => `${e.source || ""} ${e.summary || ""} ${e.entity || ""}`.toLowerCase().includes(k)));
  return html`
    <div class="fixed inset-0 z-30">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick=${onClose}></div>
      <aside class="absolute right-0 top-0 h-full w-full sm:max-w-[520px] bg-panel border-l border-edge overflow-y-auto slidein">
        <div class="sticky top-0 flex items-center justify-between px-5 h-14 border-b border-edge bg-panel/95 backdrop-blur z-10"><span class="text-white font-semibold">${e.date || "Activity"}</span><button class="text-slate-400 hover:text-white text-lg leading-none" onClick=${onClose}>✕</button></div>
        <div class="p-5">
          <div dangerouslySetInnerHTML=${{ __html: actBodyHtml(e, a) }}></div>
          <div class="mt-5"><button onClick=${() => copyPrompt(logPrompt(e, a))} class="text-[11px] px-3 py-1.5 rounded-lg bg-accent/15 border border-accent/30 text-emerald-300 hover:bg-accent/25">💬 Chat about this change</button></div>
        </div>
      </aside>
    </div>`;
}

export function Activity(props) {
  const s = useStore();
  const [filter, setFilter] = useState("");   // lowercased, mirrors monolith actFilter
  const [chip, setChip] = useState(null);     // active CONTRIB or null (actChip)
  const [open, setOpen] = useState(null);     // open event entry

  const elog = s.elog || { items: [] };
  const items = elog.items || [];

  // chips (renderChips)
  const avail = CONTRIBS.map(c => ({ ...c, n: items.filter(e => matchTokens(e, c.tokens)).length })).filter(c => c.n > 0).sort((a, b) => b.n - a.n).slice(0, 9);
  const cls = on => "chip text-xs px-2.5 py-1 rounded-lg border " + (on ? "bg-panel2 text-white border-edge" : "text-slate-400 hover:text-white border-edge/60");

  // rows (activityRows)
  let fil = items.slice().sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
  if (chip) fil = fil.filter(e => matchTokens(e, chip.tokens));
  if (filter) fil = fil.filter(e => `${e.who || ""} ${e.source || ""} ${e.summary || ""} ${e.entity || ""} ${e.platform || ""} ${e.type || ""}`.toLowerCase().includes(filter));
  const show = fil.slice(0, 150);
  const scope = [chip && chip.label, filter && "“" + filter + "”"].filter(Boolean).join(" · ");

  return html`
    <div>
      <div class="flex gap-2 mb-3 max-w-[520px]"><input id="act-f" class="flex-1 bg-ink border border-edge rounded-lg px-3 py-2 text-sm" placeholder="Filter by agent, entity, or keyword…" onInput=${e => setFilter(e.target.value.toLowerCase())}/></div>
      <div id="act-chips" class="flex flex-wrap gap-1.5 mb-4">
        <button class=${cls(!chip)} onClick=${() => setChip(null)}>All</button>
        ${avail.map(c => html`<button key=${c.label} class=${cls(chip && chip.label === c.label)} onClick=${() => setChip(CONTRIBS.find(x => x.label === c.label) || null)}>${c.label} <span class="text-slate-400">${c.n}</span></button>`)}
      </div>
      <div id="activity">
        ${show.length ? html`
          <div class="rounded-xl border border-edge bg-panel glow divide-y divide-edge/60">
            ${show.map((e, i) => html`<${Row} key=${i} e=${e} onOpen=${setOpen}/>`)}
          </div>
          <p class="text-[11px] text-slate-400 mt-2">Showing ${show.length} of ${fil.length} logged events${scope ? " · " + scope : ""}. Source: Wiki/data/event_log.json.</p>` : html`
          <div class="rounded-xl border border-edge bg-panel p-10 text-center text-slate-400">No activity${scope ? " for " + scope : ""}.</div>`}
      </div>
      <${Drawer} e=${open} agents=${s.roster.agents} onClose=${() => setOpen(null)}/>
    </div>`;
}
