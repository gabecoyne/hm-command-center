// Reports view — agent-posted MD/HTML reports (replaces email/Slack).
// Ported from the monolith's renderReports/openReport/markRead/dropNote.
import { html } from '../html.js';
import { useState, useEffect, useMemo } from 'preact/hooks';
import { useStore, getState, currentUser } from '../state.js';
import { aPut, postItem, postDecision } from '../data.js';
import { esc, cap, mdToHtml, nowCT } from '../lib/format.js';
import { avatarSigil, forAvatars } from '../lib/avatars.js';
import { banner, copyPrompt } from '../components/Toasts.js';

const RGC = 'grid grid-cols-[14px_26px_44px_120px_1fr_92px_50px_12px] items-center gap-2.5 px-4 py-2.5';

const isHtmlReport = r => String(r.format || '').toLowerCase() === 'html' || /^\s*<(?:!doctype|html|div|section|body|table|h[1-6]|style)/i.test(r.body || '');

const REPORT_PERSON_FALLBACK = { 'athena-finance': 'collin', 'hestia-cs': 'collin', 'demeter-inventory': 'collin', 'daily-finance': 'collin', 'hm-fin-weekly-actuals': 'collin', 'hm-fin-monthly-close': 'collin', 'hm-cbp-statement-check': 'collin', 'hm-gorgias-responder': 'collin', 'hm-cs-approval-grader': 'collin', 'hm-cs-learning-loop': 'collin', 'hm-inventory-monitor': 'collin', 'hm-inbound-tracker': 'collin', 'hm-stuck-shipments': 'collin' };

export function reportFor(r) {
  const a = (r.assignees || []).map(x => String(x).toLowerCase()).filter(x => x === 'gabe' || x === 'collin');
  if (a.length) return [...new Set(a)];
  const src = String(r.source || '').toLowerCase();
  const ag = (getState().roster.agents || []).find(x => String(x.id).toLowerCase() === src);
  const rt = ag && ag.reports_to && String(ag.reports_to).toLowerCase();
  if (rt === 'gabe' || rt === 'collin') return [rt];
  if (REPORT_PERSON_FALLBACK[src]) return [REPORT_PERSON_FALLBACK[src]];
  if (/fin|cash|\bcs\b|gorgias|invent|ship|duty|cbp|hestia|demeter|athena/.test(src)) return ['collin'];
  return ['gabe'];
}

function reportBodyHtml(r) {
  if (!r.body) return `<div class="text-sm text-slate-400">No inline content on this report${r.path ? ' — source: <code>' + esc(r.path) + '</code>' : ''}.</div>`;
  if (isHtmlReport(r)) return `<iframe class="w-full rounded-lg border border-edge bg-white" style="height:74vh" sandbox="allow-scripts allow-same-origin allow-popups" srcdoc="${esc(r.body)}"></iframe>`;
  return `<div class="md-body">${mdToHtml(r.body)}</div>`;
}

function Row({ r, onOpen }) {
  const unread = !r.read;
  const fmt = (r.format || (isHtmlReport(r) ? 'html' : 'md')).toUpperCase();
  return html`
    <div class="reprow ${RGC} hover:bg-panel2/40 cursor-pointer" title=${'from ' + (r.source || 'agent')} onClick=${() => onOpen(r)}>
      <span class="h-2 w-2 rounded-full ${unread ? 'bg-accent' : 'bg-slate-700'}" title=${unread ? 'unread' : 'read'}></span>
      <span class="justify-self-center" dangerouslySetInnerHTML=${{ __html: avatarSigil(r.source || 'agent', 24) }}></span>
      <span class="justify-self-center" dangerouslySetInnerHTML=${{ __html: forAvatars(reportFor(r), 20) }}></span>
      <span class="min-w-0 font-mono text-[10px] text-slate-400 truncate">${r.source || 'agent'}</span>
      <div class="min-w-0">
        <div class="text-[13px] ${unread ? 'text-white' : 'text-slate-300'} truncate">${r.title || ''}</div>
        ${r.summary ? html`<div class="text-[11px] text-slate-400 truncate">${r.summary}</div>` : null}
      </div>
      <span class="min-w-0 font-mono text-[10px] text-slate-400 truncate">${r.date || ''}</span>
      <span class="justify-self-start font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-slate-400">${fmt}</span>
      <span class="text-[11px] text-emerald-400/80 justify-self-end">›</span>
    </div>`;
}

function Drawer({ r, onClose, onRead }) {
  const [note, setNote] = useState('');
  if (!r) return null;
  const unread = !r.read;
  const fmt = (r.format || (isHtmlReport(r) ? 'html' : 'md')).toUpperCase();
  const forList = reportFor(r);
  const bd = 'font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-white/5 text-slate-400';

  async function saveNote() {
    const v = note.trim(); if (!v) return;
    const now = nowCT(), by = currentUser(), day = now.slice(0, 10);
    const slug = ((String(r.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'note').slice(0, 48).replace(/-+$/, '')) || 'note';
    const iid = `integrator-${day}-note-${slug}`;
    const item = {
      item_id: iid, owner: by, seat: 'integrator', type: 'approval', severity: 'normal',
      title: ('Note on: ' + (r.title || r.id)).slice(0, 160), link: `/?view=feedback&item=${iid}`,
      source: r.source || 'human', generated_at: now, resolves_by: null, status: 'open', resolved_at: null, dedup_key: null, ack_at: null, ack_by: null,
      approval: { question: v, options: [], what_i_found: null, proposal: null, expected_outcome: null, detail: null, decision: 'answered', feedback: v, decided_by: by, decided_at: now, ack_at: null, ack_by: null },
    };
    /* Two creates, never a whole-queue write: the item file, then the answer as its own record. */
    const { decision, feedback, decided_by, decided_at, ...ap } = item.approval;
    try {
      await postItem({ ...item, approval: ap });
      await postDecision({ item_id: iid, kind: 'decision', by, decision: 'answered', feedback: v });
      setNote(''); banner('ok', 'Note filed to the attention queue — the agent picks it up next run.');
    } catch (e) { banner('err', 'Note save failed. ' + esc(e.message)); }
  }

  return html`
    <div class="fixed inset-0 z-30">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick=${onClose}></div>
      <aside class="absolute right-0 top-0 h-full w-full sm:max-w-[720px] bg-panel border-l border-edge overflow-y-auto slidein">
        <div class="sticky top-0 flex items-center justify-between px-5 h-14 border-b border-edge bg-panel/95 backdrop-blur z-10">
          <span class="text-white font-semibold flex items-center gap-2"><span dangerouslySetInnerHTML=${{ __html: avatarSigil(r.source || 'agent', 22) }}></span><span class="align-middle">${r.title || 'Report'}</span></span>
          <button class="text-slate-400 hover:text-white text-lg leading-none" onClick=${onClose}>✕</button>
        </div>
        <div class="p-5">
          <div class="flex flex-wrap items-center gap-2 mb-3">
            <span class="font-mono text-[11px] px-2 py-0.5 rounded bg-white/10 text-white">${r.source || 'agent'}</span>
            <span class=${bd}>${fmt}</span>
            ${r.date ? html`<span class="text-[11px] font-mono text-slate-400">${r.date}</span>` : null}
            ${forList.length ? html`<span class="flex items-center gap-1.5 text-[11px] text-slate-400">for <span dangerouslySetInnerHTML=${{ __html: forAvatars(forList, 18) }}></span> <span class="text-slate-300">${forList.map(cap).join(' & ')}</span></span>` : null}
            <span class="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded ${unread ? 'bg-accent/15 text-emerald-300' : 'bg-white/5 text-slate-400'} ml-auto">${unread ? 'unread' : 'read'}</span>
          </div>
          ${r.summary ? html`<p class="text-sm text-slate-300 leading-relaxed mb-2">${r.summary}</p>` : null}
          ${r.path ? html`<div class="text-[11px] font-mono text-slate-400 mb-3">${r.path}</div>` : null}
          <div class="flex flex-wrap gap-2 items-center border-t border-edge pt-3">
            <button onClick=${() => copyPrompt(r.prompt || ("Let's talk through " + (r.path || r.title || '')))} class="px-3 py-1.5 rounded-lg bg-accent/15 border border-accent/30 text-emerald-300 text-xs font-semibold hover:bg-accent/25">💬 Chat with Claude</button>
            ${unread ? html`<button onClick=${() => onRead(r)} class="px-3 py-1.5 rounded-lg border border-edge text-slate-300 text-xs hover:text-white">✓ Mark read</button>` : null}
            <input value=${note} onInput=${e => setNote(e.target.value)} class="flex-1 min-w-[180px] bg-ink border border-edge rounded-lg px-3 py-1.5 text-sm" placeholder="Drop a note for the agent…"/>
            <button onClick=${saveNote} class="px-3 py-1.5 rounded-lg border border-edge text-slate-300 text-xs hover:text-white">Save note</button>
          </div>
          <div class="mt-4" dangerouslySetInnerHTML=${{ __html: reportBodyHtml(r) }}></div>
        </div>
      </aside>
    </div>`;
}

/* Filters, mirroring the Feedback queue so the two shelves work the same way: who it's for, which
   agent wrote it, and free text over the title/summary. `reportFor` already resolves routing (explicit
   assignees → the agent's reports_to → a source-name fallback), so the person filter reuses it rather
   than inventing a second, disagreeing notion of whose report this is. */
const SEL = 'bg-ink border border-edge rounded-lg px-2.5 py-1.5 text-[13px] text-slate-200 focus:border-accent/60 focus:outline-none';

export function Reports() {
  const s = useStore();
  const [open, setOpen] = useState(null);
  const all = s.reports.items || [];

  /* Same default as Feedback: your shelf, not the whole estate's. The sidebar badge counts the same
     set, so the number you click and the list you land on agree. */
  const [rSearch, setRSearch] = useState('');
  const [fPerson, setFPerson] = useState(s.user);
  const [fAgent, setFAgent] = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  useEffect(() => { setFPerson(s.user); }, [s.user]);

  // agent options come from the reports actually on the shelf, with counts
  const agentOpts = useMemo(() => {
    const m = new Map();
    for (const r of all) { const n = r.source || 'agent'; m.set(n, (m.get(n) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [all]);

  const matches = r => {
    if (fPerson !== 'all' && !reportFor(r).includes(fPerson)) return false;
    if (fAgent !== 'all' && (r.source || 'agent') !== fAgent) return false;
    if (unreadOnly && r.read) return false;
    if (rSearch) {
      const hay = [r.title, r.summary, r.source, r.seat, r.date].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(rSearch)) return false;
    }
    return true;
  };
  const items = all.filter(matches);
  const filtered = fPerson !== s.user || fAgent !== 'all' || unreadOnly || !!rSearch;
  const resetFilters = () => { setRSearch(''); setFPerson(s.user); setFAgent('all'); setUnreadOnly(false); };
  const btn = 'px-3 py-1.5 rounded-lg text-[12px] border border-edge text-slate-300 hover:text-white hover:bg-panel2';

  async function markRead(r) {
    const cur = getState().reports;
    const idx = (cur.items || []).findIndex(x => x.id === r.id);
    if (idx < 0) return;
    const items2 = cur.items.slice();
    items2[idx] = { ...items2[idx], read: true, read_by: currentUser(), read_at: new Date().toISOString() };
    try { await aPut('reports.json', { ...cur, items: items2, updated: new Date().toISOString() }); setOpen(null); }
    catch (e) { banner('err', "Couldn't mark read. " + esc(e.message)); }
  }

  return html`
    <div>
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <input class="bg-ink border border-edge rounded-lg px-3 py-1.5 text-[13px] text-slate-200 placeholder:text-slate-500 focus:border-accent/60 focus:outline-none flex-1 min-w-[200px]"
               placeholder="Search reports — title, summary, agent…" value=${rSearch}
               onInput=${e => setRSearch(e.target.value.trim().toLowerCase())}/>
        <select class=${SEL} value=${fPerson} onChange=${e => setFPerson(e.target.value)} title="Who the report is for">
          <option value="all">Anyone</option><option value="gabe">Gabe</option><option value="collin">Collin</option>
        </select>
        <select class=${SEL} value=${fAgent} onChange=${e => setFAgent(e.target.value)} title="Which agent wrote it">
          <option value="all">All agents</option>
          ${agentOpts.map(([n, c]) => html`<option key=${n} value=${n}>${n} (${c})</option>`)}
        </select>
        <label class="flex items-center gap-1.5 text-[12px] text-slate-300 px-2 py-1.5 rounded-lg border border-edge cursor-pointer hover:text-white" title="Only reports you haven't opened">
          <input type="checkbox" class="accent-accent h-3.5 w-3.5" checked=${unreadOnly} onChange=${e => setUnreadOnly(e.target.checked)}/> Unread
        </label>
        <span class="text-[11px] font-mono text-slate-400 whitespace-nowrap">${items.length}${items.length !== all.length ? ' of ' + all.length : ''}</span>
        ${filtered ? html`<button class=${btn} onClick=${resetFilters}>Clear filters</button>` : null}
      </div>
      ${items.length ? html`
        <div class="rounded-xl border border-edge bg-panel glow overflow-hidden">
          <div class="${RGC} text-[10px] uppercase tracking-widest text-slate-500 border-b border-edge/60">
            <span></span><span class="justify-self-center">Agent</span><span class="justify-self-center">For</span><span>Source</span><span>Report</span><span>Date</span><span>Type</span><span></span>
          </div>
          <div class="divide-y divide-edge/60">
            ${items.map(r => html`<${Row} key=${r.id} r=${r} onOpen=${setOpen}/>`)}
          </div>
        </div>` : html`
        <div class="rounded-xl border border-edge bg-panel p-10 text-center text-slate-400">${all.length
          ? html`Nothing matches these filters. <button class="text-accent hover:underline" onClick=${resetFilters}>Clear them</button> to see all ${all.length}.`
          : html`No reports yet. Agents post MD/HTML reports here (replacing email/Slack).`}</div>`}
      <${Drawer} r=${open} onClose=${() => setOpen(null)} onRead=${markRead}/>
    </div>`;
}
