// Feedback view — the human ⇄ AI feedback loop: the approval + alert queue and the response log.
// Agents file what they need from us (approvals to decide, alerts to acknowledge); we respond here.
// (Formerly the "Attention" view; renamed 2026-08-10. Underlying item schema unchanged.)
import { html } from '../html.js';
import { useState, useEffect, useMemo } from 'preact/hooks';
import { useStore, getState, currentUser } from '../state.js';
import { postDecision, postBulkDecision } from '../data.js';
import { esc, mdToHtml, nowCT, schWhen } from '../lib/format.js';
import { userAv, EMB, TONE } from '../lib/avatars.js';
import { isLive, isAlert, isDismissed } from '../lib/attention.js';
import { banner } from '../components/Toasts.js';

/* ---------- view-specific constants + helpers copied verbatim from the monolith ---------- */
const PRI = { urgent: 'bg-rose-500 ring-2 ring-rose-400/40', high: 'bg-rose-500', normal: 'bg-slate-600', med: 'bg-amber-400', low: 'bg-slate-600' };
/* the four attention types (Attention_Item_Contract.md §1). approval = decision controls; the rest are Acknowledge-only alerts. */
const TL = { approval: 'Approval', risk: 'Risk', failure: 'Failure', performance: 'Performance' };
const TC = { approval: 'bg-indigo-500/15 text-indigo-300', risk: 'bg-amber-500/15 text-amber-300', failure: 'bg-rose-500/15 text-rose-300', performance: 'bg-sky-500/15 text-sky-300' };
const TYPE_RANK = { approval: 0, risk: 1, failure: 2, performance: 3 }, SEV_RANK = { urgent: 0, high: 1, normal: 2 };
const qSort = (a, b) => ((TYPE_RANK[a.type] ?? 9) - (TYPE_RANK[b.type] ?? 9)) || ((SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9)) || String(a.generated_at || '').localeCompare(String(b.generated_at || ''));
const QGRID = 'grid grid-cols-[20px_12px_2fr_0.9fr_3.4fr_1.3fr_auto] gap-3 items-center';

const ATONE = { clay: ['#C2724A', '#0b0f17'], olive: ['#7BA05B', '#0b0f17'], blue: ['#5FA8D3', '#0b0f17'], gold: ['#D9B493', '#0b0f17'], slate: ['#94a3b8', '#0b0f17'] };
const GOD = { Hermes: ['hermes', 'clay'], Nike: ['nike', 'clay'], Apollo: ['apollo', 'clay'], Metis: ['metis', 'clay'], Iris: ['iris', 'clay'], Hera: ['hera', 'olive'], Hestia: ['hestia', 'olive'], Demeter: ['demeter', 'olive'], Athena: ['athena', 'blue'], Argus: ['argus', 'gold'], Prometheus: ['prometheus', 'gold'], Ganymede: ['ganymede', 'slate'] };
const SCHED_GROUPS = [
 { key: 'paid', title: 'Media Buyer', god: 'Nike', emb: 'nike', tone: 'clay', agent: 'paid-media', agents: ['paid-media'], tasks: ['hm-partner-commission'], blurb: 'Paid acquisition across Meta + Google — budgets, bids, pausing losers, holding the daily spend floor.' },
 { key: 'social', title: 'Community Manager', god: 'Apollo', emb: 'apollo', tone: 'clay', agent: 'organic-social', agents: ['organic-social'], tasks: [], blurb: 'Organic comment marketing and inbox engagement across IG, TikTok, YouTube & Facebook.' },
 { key: 'cro', title: 'CRO / Experimentation', god: 'Metis', emb: 'metis', tone: 'clay', agent: 'cro', agents: ['cro'], tasks: [], blurb: 'On-site A/B tests (PDP, cart, checkout) with a weekly results digest.' },
 { key: 'seo', title: 'SEO Specialist', god: 'Prometheus', emb: 'prometheus', tone: 'char', agent: 'seo', agents: ['seo'], tasks: ['hm-r-lp-monday-briefing'], blurb: 'Technical + on-page SEO audits, PDP optimization, and the weekly performance tracker.' },
 { key: 'aeo', title: 'Answer-Engine (AEO)', god: 'Hera', emb: 'hera', tone: 'olive', agent: 'aeo', agents: ['aeo'], tasks: [], blurb: 'Structures content + schema for AI answer surfaces — ChatGPT, Perplexity, Google AIO, Claude.' },
 { key: 'lifecycle', title: 'Lifecycle Marketer', god: 'Iris', emb: 'iris', tone: 'clay', agent: 'lifecycle-email', agents: ['lifecycle-email'], tasks: [], blurb: 'Klaviyo list hygiene and deliverability — suppression checks before tier thresholds.' },
 { key: 'collectors', title: 'BI Collectors', god: 'Argus', emb: 'argus', tone: 'ink', agents: [], tasks: ['hm-shipbob-collector', 'hm-triplewhale-collector', 'hm-model-collector', 'hm-shopify-collector', 'hm-ga4-collector', 'hm-gorgias-collector', 'hm-competitive-collector', 'hm-lifecycle-collector', 'hm-cash-collector'], blurb: 'Dumb, no-AI collectors — each fetches one source into the shared data pool (data/facts/*) every analyst reads. Collection centralized, interpretation distributed.' },
 { key: 'analytics', title: 'Marketing Analyst & Intel', god: 'Argus', emb: 'argus', tone: 'char', agents: [], tasks: ['hm-marketing-analysis', 'hm-competitive-analysis', 'hm-competitor-watch', 'hm-lifecycle-analyst'], blurb: 'Marketing performance vs forecast, competitive intel, competitor/market watch, and the Email/SMS % of revenue read.' },
 { key: 'brand', title: 'Creator & Brand', god: 'Ganymede', emb: 'ganymede', tone: 'ink', agents: ['trybe-manager'], tasks: ['hm-review-mining', 'hm-creator-discovery'], blurb: 'UGC creator program, creator discovery, and product review mining.' },
 { key: 'finance', title: 'Finance', god: 'Athena', emb: 'athena', tone: 'blue', agent: 'athena-finance', agents: ['athena-finance'], tasks: [], blurb: 'Daily cash, weekly actuals vs model, monthly close, and CBP duty tracking.' },
 { key: 'cs', title: 'Customer Service', god: 'Hestia', emb: 'hestia', tone: 'olive', agent: 'hestia-cs', agents: ['hestia-cs'], tasks: [], blurb: 'Gorgias reply drafting, send-readiness grading, and the CS learning loop.' },
 { key: 'inventory', title: 'Inventory & Ops', god: 'Demeter', emb: 'demeter', tone: 'olive', agent: 'demeter-inventory', agents: ['demeter-inventory'], tasks: [], blurb: 'Demand/coverage watch, inbound container pipeline, and stuck-shipment detection.' },
 { key: 'ceo', title: 'CEO Office & Systems', god: 'Hermes', emb: 'hermes', tone: 'clay', agents: [], tasks: ['hm-ea-ganymede', 'hm-partner-agenda-monday', 'hm-partner-agenda-thursday', 'hm-task-monitor'], blurb: "Ganymede's daily EA router (shadow), the Monday/Thursday partner agendas, and the nightly task-monitor watchdog." },
];

function agById(id) { return (getState().roster.agents || []).find(a => a.id === id); }
function _agentIdForSource(src) { if (!src) return null; const agents = getState().roster.agents || []; if (agents.some(a => a.id === src)) return src; const S = getState().sched; const tk = (S && S.tasks) ? S.tasks.find(x => x.task_id === src) : null; return (tk && tk.agent) || null; }
function seatForSource(src) { const org = getState().roster.org, aid = _agentIdForSource(src);
  if (org && aid) { for (const f of org.functions || []) {
    if (f.orchestrator_agent === aid) { const a = agById(aid); return { name: (a && a.title) || aid, persona: f.persona, director: f.persona, func: f.name, level: 'director', src }; }
    for (const dm of f.domains || []) { if ((dm.agents || []).includes(aid)) { const a = agById(aid); return { name: (a && a.title) || aid, persona: dm.persona, manager: dm.persona, domain: dm.name, director: f.persona, func: f.name, level: 'agent', src }; } }
  } }
  const g = SCHED_GROUPS.find(x => (x.tasks || []).includes(src)) || (aid && SCHED_GROUPS.find(x => (x.agents || []).includes(aid))) || SCHED_GROUPS.find(x => x.god && String(src || '').toLowerCase().includes(String(x.god).toLowerCase()));
  if (g) return { name: g.title, persona: g.god, manager: g.god, level: 'agent', src };
  return { name: src || 'agent', persona: null, level: 'unknown', src }; }
function miniAv(label, px) { px = px || 24; const t = (typeof TONE !== 'undefined' && TONE.char) || ['#3A3D3C', '#D9B493']; return '<span class="inline-grid place-items-center rounded-full shrink-0 align-middle border border-edge" style="width:' + px + 'px;height:' + px + 'px;background:' + t[0] + ';color:' + t[1] + ';font:600 ' + Math.round(px * 0.42) + 'px ui-monospace,monospace">' + esc((label || '?').slice(0, 1).toUpperCase()) + '</span>'; }
function godAv(persona, px) { const g = GOD[persona]; if (!g) return ''; const t = ATONE[g[1]], sig = EMB[g[0]]; px = px || 24; return '<svg viewBox="0 0 40 40" width="' + px + '" height="' + px + '" class="shrink-0 inline-block align-middle" title="' + esc(persona) + '"><circle cx="20" cy="20" r="19" fill="' + t[0] + '"/><g transform="translate(8,8)" stroke="' + t[1] + '" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round">' + sig + '</g></svg>'; }
function agentAv(m, px) { return (m.persona && typeof GOD !== 'undefined' && GOD[m.persona]) ? godAv(m.persona, px) : miniAv(m.name, px); }
function agentCell(m) { let crumb;
  if (m.director && m.manager) crumb = esc(m.director) + ' <span class="text-slate-600">▸</span> ' + esc(m.manager);
  else if (m.director) crumb = esc(m.director) + ' <span class="text-slate-600">·</span> Director';
  else if (m.manager) crumb = esc(m.manager) + (m.func ? ' <span class="text-slate-600">·</span> ' + esc(m.func) : '');
  else crumb = '<span class="font-mono">' + esc(m.src || '') + '</span>';
  const tip = [m.func && ('Function: ' + m.func), m.director && ('Director: ' + m.director), m.manager && ('Manager: ' + m.manager), 'Agent: ' + m.name, m.src && ('Source: ' + m.src)].filter(Boolean).join(' · ');
  return '<div class="flex items-center gap-2 min-w-0" title="' + esc(tip) + '">' + agentAv(m, 26) + '<div class="min-w-0 leading-tight"><div class="text-[12px] text-white truncate">' + esc(m.name) + '</div><div class="text-[10px] text-slate-400 truncate">' + crumb + '</div></div></div>'; }
function assigneeCell(who) { if (!who) return '<span class="text-[11px] text-slate-500">—</span>'; const w = String(who).toLowerCase(); const av = (w === 'gabe' || w === 'collin') ? userAv(w, 22) : miniAv(who, 22); return '<span class="flex items-center gap-1.5 min-w-0" title="assigned to ' + esc(who) + '">' + av + '<span class="text-[11px] text-slate-300 truncate capitalize">' + esc(who) + '</span></span>'; }

/* ---------- Decision log (decided approvals + acknowledged alerts) ---------- */
const DEC_LABELS = { approved: 'Approved', rejected: 'Rejected', answered: 'Answered', changes_requested: 'Changes requested', acknowledged: 'Acknowledged', revised: 'Revised', dismissed: 'Dismissed' };
const DEC_TONE = { approved: 'bg-emerald-500/15 text-emerald-300', rejected: 'bg-rose-500/15 text-rose-300', answered: 'bg-sky-500/15 text-sky-300', changes_requested: 'bg-orange-500/15 text-orange-300', acknowledged: 'bg-slate-500/20 text-slate-300', dismissed: 'bg-slate-700/40 text-slate-400 line-through decoration-slate-600' };
/* what a human did to this item: approvals carry approval.decision; alerts are acknowledged. */
/* A dismissal deliberately reads as its own outcome. It is NOT folded into approved/rejected:
   the whole point of the state is that nobody decided anything — the item was cleared. */
const decisionOf = i => isDismissed(i) ? 'dismissed'
  : (isAlert(i) ? (i.ack_at ? 'acknowledged' : '') : ((i.approval || {}).decision || ''));
const LOG_PAGE = 15;
const LGRID = 'grid grid-cols-[120px_1.7fr_0.8fr_2.8fr_0.9fr_130px] gap-3 items-center';
function logDecidedAt(it) { const ap = it.approval || {}; return it.dismissed_at || ap.decided_at || it.ack_at || it.resolved_at || (it.history && it.history.length ? it.history[it.history.length - 1].ts : '') || ''; }

/* ---------- raw-HTML inner fragments for the rows (rendered via dangerouslySetInnerHTML) ---------- */
function cardInner(it) { const type = it.type || 'approval'; const tl = TL[type] || type; const tc = TC[type] || 'bg-slate-700 text-slate-300'; const ap = it.approval || {};
  const title = it.title || ''; let preview = isAlert(it) ? '' : (ap.question || ap.proposal || ap.what_i_found || ''); if (preview === title) preview = ap.proposal || ap.what_i_found || '';
  const m = seatForSource(it.source);
  return `<span class="h-2 w-2 rounded-full shrink-0 ${PRI[it.severity] || 'bg-slate-600'}" title="${esc(it.severity || '')}"></span>
    ${agentCell(m)}
    <span class="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${tc} justify-self-start whitespace-nowrap">${esc(tl)}</span>
    <div class="min-w-0"><div class="text-[13px] text-white truncate">${esc(title)}</div>${preview ? `<div class="text-[11px] text-slate-400 truncate">${esc(preview)}</div>` : ''}</div>
    ${assigneeCell(it.owner)}
    <span class="text-[11px] text-emerald-400/80 shrink-0 justify-self-end whitespace-nowrap">${isAlert(it) ? 'Acknowledge ›' : 'Review ›'}</span>`; }
function logRowInner(it) { const m = seatForSource(it.source); const type = it.type || 'approval'; const tl = TL[type] || type; const tc = TC[type] || 'bg-slate-700 text-slate-300'; const ap = it.approval || {};
  const st = decisionOf(it); const dl = DEC_LABELS[st] || st; const dt = DEC_TONE[st] || 'bg-slate-600/30 text-slate-300';
  const title = it.title || ''; const sub = ap.feedback || ''; const by = ap.decided_by || it.ack_by || ''; const when = logDecidedAt(it);
  return `<span class="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${dt} justify-self-start whitespace-nowrap">${esc(dl)}</span>
    ${agentCell(m)}
    <span class="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${tc} justify-self-start whitespace-nowrap">${esc(tl)}</span>
    <div class="min-w-0"><div class="text-[13px] text-white truncate">${esc(title)}</div>${sub ? `<div class="text-[11px] text-slate-400 truncate">${esc(sub)}</div>` : ''}</div>
    ${by ? assigneeCell(by) : '<span class="text-[11px] text-slate-500">—</span>'}
    <span class="text-[11px] font-mono text-slate-400 justify-self-end whitespace-nowrap" title="${esc(when)}">${esc(when ? String(when).slice(0, 10) : '—')}</span>`; }
function historyHTML(it) { const h = (it.history || []); if (!h.length) return ''; return `<div class="text-[10px] uppercase tracking-widest text-slate-400 mb-2 mt-6">History</div><div class="space-y-2.5">${h.slice().reverse().map(e => `<div class="flex gap-2.5 text-[12px]"><span class="text-slate-500 font-mono shrink-0 w-[88px]">${esc(String(e.ts || '').slice(0, 10))}</span><div class="min-w-0"><span class="text-slate-200">${esc(e.by || '?')}</span> <span class="text-slate-400 lowercase">${esc(DEC_LABELS[e.action] || e.action || '')}</span>${e.note ? `<div class="text-slate-400 mt-0.5 whitespace-pre-wrap">${esc(e.note)}</div>` : ''}</div></div>`).join('')}</div>`; }
function drawerBodyTop(it) { const type = it.type || 'approval'; const m = seatForSource(it.source); const ap = it.approval || {}; const bd = 'font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-white/5 text-slate-400';
  const sec = (label, val) => val ? `<div class="text-[10px] uppercase tracking-widest text-slate-400 mb-1 mt-4">${label}</div><div class="md-body">${mdToHtml(val)}</div>` : '';
  const anyBody = ap.what_i_found || ap.proposal || ap.detail || ap.expected_outcome || ap.question;
  return `<div class="flex flex-wrap items-center gap-2 mb-1">${agentAv(m, 20)}<span class="text-[12px] text-white">${esc(m.name)}</span>${(m.director || m.manager) ? `<span class="text-[10px] text-slate-400">${[m.director, m.manager].filter(Boolean).map(esc).join(' ▸ ')}</span>` : ''}<span class="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${TC[type] || 'bg-slate-700 text-slate-300'}">${esc(TL[type] || type)}</span>${it.owner ? `<span class="${bd} inline-flex items-center gap-1">→ ${(String(it.owner).toLowerCase() === 'gabe' || String(it.owner).toLowerCase() === 'collin') ? userAv(String(it.owner).toLowerCase(), 16) : ''}${esc(it.owner)}</span>` : ''}${it.severity ? `<span class="${bd}">${esc(it.severity)}</span>` : ''}${it.seat ? `<span class="${bd}">${esc(String(it.seat).replace(/_/g, ' '))}</span>` : ''}<span class="text-[10px] font-mono text-slate-500">${esc(it.source || '')}</span>${it.generated_at ? `<span class="text-[11px] font-mono text-slate-400 ml-auto" title="${esc(it.generated_at)}">${esc(String(it.generated_at).slice(0, 10))}</span>` : ''}</div>
    ${it.resolves_by ? `<p class="text-[11px] font-mono text-amber-300 mt-2">Resolves by ${esc(String(it.resolves_by).slice(0, 10))}</p>` : ''}
    ${ap.question ? `<p class="text-sm text-white mt-3">${esc(ap.question)}</p>` : ''}
    ${sec('What the agent found', ap.what_i_found)}
    ${sec('Proposal', ap.proposal)}
    ${sec('Detail', ap.detail)}
    ${sec('Expected outcome', ap.expected_outcome)}
    ${anyBody ? '' : `<p class="text-sm text-slate-400 mt-3">${isAlert(it) ? 'Heads-up only — the title is the whole item. Acknowledge to clear it.' : 'No extra detail was attached to this item.'}</p>`}`; }

/* ---------- components ---------- */
function QueueRow({ it, onOpen, selected, onToggle }) {
  /* The checkbox is a real Preact node (it needs an onChange), while the rest of the row stays a
     single innerHTML fragment. `display:contents` on the wrapper lets those raw cells keep
     participating in this row's grid instead of collapsing into one column. */
  return html`<div class="qrow ${QGRID} px-4 py-3 hover:bg-panel2/40 cursor-pointer fade ${selected ? 'bg-accent/5' : ''}" onClick=${() => onOpen(it)}>
    <input type="checkbox" class="accent-accent h-3.5 w-3.5 cursor-pointer" checked=${selected}
           aria-label=${'Select ' + (it.title || it.item_id)}
           onClick=${e => e.stopPropagation()} onChange=${() => onToggle(it.item_id)}/>
    <span style="display:contents" dangerouslySetInnerHTML=${{ __html: cardInner(it) }}></span>
  </div>`;
}
function LogRow({ it, onOpen }) {
  return html`<div class="lrow ${LGRID} px-4 py-3 hover:bg-panel2/40 cursor-pointer fade" onClick=${() => onOpen(it)} dangerouslySetInnerHTML=${{ __html: logRowInner(it) }}></div>`;
}

/* Decision controls — declarative replacement for controlsHTML/wireControls. */
function Controls({ it, onAck, onSave }) {
  const [note, setNote] = useState('');
  const [noteErr, setNoteErr] = useState(false);
  const [anote, setANote] = useState('');
  const [choice, setChoice] = useState('');
  const rn = `mc-${it.item_id}-d`;
  const inp = 'flex-1 min-w-[160px] bg-ink border border-edge rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-400 focus:border-accent/60 focus:outline-none';
  const pb = 'px-3.5 py-2 rounded-lg bg-accent text-ink text-sm font-semibold hover:brightness-110';
  /* Alerts (risk/failure/performance) are heads-up only — one Acknowledge, no decision control. */
  if (isAlert(it)) {
    return html`<div class="flex flex-wrap gap-2 items-center"><button class=${pb} onClick=${() => onAck(it)}>Acknowledge</button><span class="text-[11px] text-slate-400 max-w-[380px]">Heads-up only — nothing to decide. If this needs action, the producing agent should have filed an approval.</span></div>`;
  }
  const ap = it.approval || {}; const opts = (ap.options || []);
  /* The note is a pre-fill field and these buttons save immediately, so an empty-note click used to write
     a decision with feedback:'' — a dead end for the producing agent's read-back (Attention_Item_Contract.md
     §6: changes_requested means fold the feedback into a revised proposal, rejected means record the
     learning). Reject and Request changes require the note; Approve does not. */
  function decide(decision, msg) {
    const n = note.trim();
    if (!n) { setNoteErr(true); return banner('err', msg); }
    onSave(it, { decision, feedback: n });
  }
  function answer() {
    if (!choice) return banner('err', 'Pick an option.');
    const n = anote.trim();
    onSave(it, { decision: 'answered', feedback: n ? choice + ' — ' + n : choice });
  }
  return html`
    ${opts.length ? html`
      <div class="grid gap-1.5 mb-2.5">
        ${opts.map(o => html`<label class="flex items-center gap-2.5 text-sm text-slate-200 px-3 py-2 rounded-lg border border-edge hover:border-slate-600 cursor-pointer"><input type="radio" name=${rn} value=${o} class="accent-accent" checked=${choice === o} onChange=${() => setChoice(o)}/> ${o}</label>`)}
      </div>
      <div class="flex gap-2 mb-3"><input value=${anote} onInput=${e => setANote(e.target.value)} class=${inp} placeholder="Optional note…"/><button class=${pb} onClick=${answer}>Save answer</button></div>` : null}
    <div class="flex flex-wrap gap-2 items-center">
      <button class=${pb} onClick=${() => onSave(it, { decision: 'approved', feedback: note.trim() })}>Approve</button>
      <button class="px-3.5 py-2 rounded-lg border border-edge text-slate-300 text-sm hover:border-rose-500/60 hover:text-rose-300" onClick=${() => decide('rejected', "Add a note first — say why you're rejecting. The agent reads it back and won't re-propose.")}>Reject</button>
      <input value=${note} onInput=${e => { setNote(e.target.value); if (noteErr) setNoteErr(false); }} class=${inp} style=${noteErr ? 'border-color:#f43f5e' : ''} placeholder="Note — required to reject or request changes…"/>
      <button class="px-3.5 py-2 rounded-lg border border-edge text-slate-400 text-sm hover:text-white" onClick=${() => decide('changes_requested', "Add a note first — say what's wrong or what to change. The agent re-files from that note.")}>Request changes</button>
    </div>`;
}

function DecisionBlock({ it, onAck, onSave, onDismiss }) {
  const d = decisionOf(it), al = isAlert(it);
  /* Dismiss sits under the real controls, deliberately quiet: it is the escape hatch for an item
     you are not going to act on, not a shortcut past deciding one you are. */
  const dismissRow = onDismiss ? html`<div class="mt-4 pt-3 border-t border-edge/50 flex items-center gap-2 flex-wrap">
      <button class="text-[12px] text-slate-400 hover:text-slate-200 underline decoration-dotted underline-offset-2"
              onClick=${() => { const r = prompt('Dismiss this item without deciding it?\n\nOptional — why (recorded in the log):', ''); if (r !== null) onDismiss([it.item_id], r); }}>Dismiss without deciding</button>
      <span class="text-[11px] text-slate-500">Clears it from the queue. Logged as dismissed, never as approved.</span>
    </div>` : null;
  if (!d) return html`<div class="border-t border-edge pt-4 mt-6"><div class="text-[10px] uppercase tracking-widest text-slate-400 mb-2">${al ? 'Acknowledge' : 'Your decision'}</div><${Controls} it=${it} onAck=${onAck} onSave=${onSave}/>${dismissRow}</div>`;
  const ap = it.approval || {}; const by = ap.decided_by || it.ack_by || ''; const bl = String(by).toLowerCase(); const when = logDecidedAt(it); const resolved = ap.feedback || '';
  return html`<div class="border-t border-edge pt-4 mt-6">
    <div class="text-[10px] uppercase tracking-widest text-slate-400 mb-2">${al ? 'Acknowledged' : 'Decision'}</div>
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded ${DEC_TONE[d] || 'bg-slate-600/30 text-slate-300'}">${DEC_LABELS[d] || d}</span>
      ${by ? html`<span class="inline-flex items-center gap-1 text-[12px] text-slate-300">by <span dangerouslySetInnerHTML=${{ __html: (bl === 'gabe' || bl === 'collin') ? userAv(bl, 18) : '' }}></span> ${by}</span>` : null}
      ${when ? html`<span class="text-[11px] font-mono text-slate-400">${schWhen(when)}</span>` : null}
      ${(!al && ap.ack_at) ? html`<span class="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300" title="the producing agent read this back and acted on it">agent acted</span>` : null}
    </div>
    ${resolved ? html`<div class="md-body mt-2.5" dangerouslySetInnerHTML=${{ __html: mdToHtml(resolved) }}></div>` : null}
    ${it.dismiss_reason ? html`<div class="text-[12px] text-slate-400 mt-2.5 whitespace-pre-wrap">${it.dismiss_reason}</div>` : null}
    <div dangerouslySetInnerHTML=${{ __html: historyHTML(it) }}></div>
    ${al ? null : html`<details class="mt-5"><summary class="text-[11px] text-slate-400 cursor-pointer hover:text-white select-none">Override this decision</summary><div class="mt-3"><${Controls} it=${it} onAck=${onAck} onSave=${onSave}/></div></details>`}
  </div>`;
}

function Drawer({ it, onClose, onAck, onSave, onDismiss }) {
  if (!it) return null;
  return html`
    <div class="fixed inset-0 z-30">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick=${onClose}></div>
      <aside class="absolute right-0 top-0 h-full w-full sm:max-w-[580px] bg-panel border-l border-edge overflow-y-auto slidein">
        <div class="sticky top-0 flex items-center justify-between px-5 h-14 border-b border-edge bg-panel/95 backdrop-blur z-10"><span class="text-white font-semibold">${it.title || 'Item'}</span><button class="text-slate-400 hover:text-white text-lg leading-none" onClick=${onClose}>✕</button></div>
        <div class="p-5">
          <div dangerouslySetInnerHTML=${{ __html: drawerBodyTop(it) }}></div>
          <${DecisionBlock} it=${it} onAck=${onAck} onSave=${onSave} onDismiss=${onDismiss}/>
        </div>
      </aside>
    </div>`;
}

/* ---------- queue filter model ----------
   113 open items is past the point where a flat list is usable, so the queue gets the same three
   axes people actually think in — WHO is it for, WHICH agent filed it, and WHAT does it want from
   me — plus free text over everything else. Filters are AND-ed; empty means "no constraint". */
const TYPE_FILTERS = [
  ['all', 'All types'],
  ['decide', 'Needs a decision'],
  ['alert', 'Alerts (FYI)'],
  ['approval', '· Approval'],
  ['risk', '· Risk'],
  ['failure', '· Failure'],
  ['performance', '· Performance'],
];
function typeMatches(it, f) {
  if (f === 'all') return true;
  if (f === 'decide') return !isAlert(it);
  if (f === 'alert') return isAlert(it);
  return (it.type || '') === f;
}
const SEL = 'bg-ink border border-edge rounded-lg px-2.5 py-1.5 text-[13px] text-slate-200 focus:border-accent/60 focus:outline-none';

export function Feedback(props) {
  const s = useStore();
  const who = props.who || 'all';
  const [open, setOpen] = useState(null);
  const [logSearch, setLogSearch] = useState('');
  const [logFilter, setLogFilter] = useState('all');
  const [logPage, setLogPage] = useState(1);

  /* Queue filters. Person seeds from the header's "reviewing as" control and stays in sync with
     it, so the two never silently disagree about who you're looking at. */
  const [qSearch, setQSearch] = useState('');
  const [fPerson, setFPerson] = useState(who);
  const [fAgent, setFAgent] = useState('all');
  const [fType, setFType] = useState('all');
  const [sel, setSel] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => { setFPerson(who); }, [who]);

  /* Approvals: the human writes the DECISION into approval.*; top-level status stays "open" until the
     producing agent reads it back (Attention_Item_Contract.md §6) and sets approval.ack_at. */
  async function save(it, patch) {
    const before = (getState().attn.items || []).find(i => i.item_id === it.item_id) || it;
    if (isAlert(before)) return banner('err', "That's an alert — alerts are acknowledged, not decided.");
    try {
      await postDecision({ item_id: before.item_id, kind: 'decision', by: currentUser(),
                           decision: patch.decision, feedback: patch.feedback || '' });
      setOpen(null);
      banner('ok', `Saved — <b>${esc(before.title || it.item_id)}</b>. ${esc(before.source || 'The agent')} picks it up next run.`);
    } catch (e) { banner('err', 'Write failed (server running?). ' + esc(e.message)); }
  }
  /* Alerts: one Acknowledge is the entire lifecycle — ack_at/ack_by at the top level, status -> resolved. */
  async function ack(it) {
    const before = (getState().attn.items || []).find(i => i.item_id === it.item_id) || it;
    if (!isAlert(before)) return banner('err', "That's an approval — it needs a decision, not an acknowledgement.");
    try {
      await postDecision({ item_id: before.item_id, kind: 'ack', by: currentUser() });
      setOpen(null);
      banner('ok', `Acknowledged — <b>${esc(before.title || it.item_id)}</b>.`);
    } catch (e) { banner('err', 'Write failed (server running?). ' + esc(e.message)); }
  }
  /* Dismiss: clear WITHOUT pretending a decision was made. Works on approvals and alerts alike,
     one item or many, and is recorded as its own outcome so the decision log stays truthful. */
  async function dismiss(ids, reason) {
    const list = Array.isArray(ids) ? ids : [ids];
    if (!list.length) return;
    setBusy(true);
    try {
      await postBulkDecision({ item_ids: list, kind: 'status', status: 'dismissed',
                               by: currentUser(), feedback: reason || '' });
      setSel(new Set()); setOpen(null);
      banner('ok', `Dismissed ${list.length} item${list.length === 1 ? '' : 's'} — cleared without a decision. Still in the log.`);
    } catch (e) { banner('err', 'Dismiss failed. ' + esc(e.message)); }
    finally { setBusy(false); }
  }
  async function ackMany(ids) {
    if (!ids.length) return;
    setBusy(true);
    try {
      await postBulkDecision({ item_ids: ids, kind: 'ack', by: currentUser() });
      setSel(new Set());
      banner('ok', `Acknowledged ${ids.length} alert${ids.length === 1 ? '' : 's'}.`);
    } catch (e) { banner('err', 'Acknowledge failed. ' + esc(e.message)); }
    finally { setBusy(false); }
  }

  const live = (s.attn.items || []).filter(isLive);
  /* Agent options come from the items actually in the queue, not a hardcoded roster — a filter
     listing agents with nothing to show is noise, and one missing an agent hides work. */
  const agentOpts = useMemo(() => {
    const m = new Map();
    for (const it of live) { const n = seatForSource(it.source).name; if (n) m.set(n, (m.get(n) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [live.length, live.map(i => i.item_id).join(',')]);

  const qMatch = it => {
    if (fPerson !== 'all' && String(it.owner || '').toLowerCase() !== fPerson) return false;
    if (fAgent !== 'all' && seatForSource(it.source).name !== fAgent) return false;
    if (!typeMatches(it, fType)) return false;
    if (qSearch) {
      const ap = it.approval || {};
      const hay = [it.title, it.detail, ap.question, ap.proposal, ap.what_i_found, ap.expected_outcome,
                   it.source, it.seat, it.owner, it.severity, seatForSource(it.source).name]
                  .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(qSearch)) return false;
    }
    return true;
  };
  const items = live.filter(qMatch).sort(qSort);
  const filtered = items.length !== live.length;
  const visibleIds = items.map(i => i.item_id);
  const selIds = visibleIds.filter(id => sel.has(id));           // never act on a hidden selection
  const selItems = items.filter(i => sel.has(i.item_id));
  const selAlerts = selItems.filter(isAlert).map(i => i.item_id);
  const allSel = visibleIds.length > 0 && selIds.length === visibleIds.length;

  const toggle = id => setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel(prev => {
    const n = new Set(prev);
    if (allSel) visibleIds.forEach(id => n.delete(id)); else visibleIds.forEach(id => n.add(id));
    return n;
  });
  const resetFilters = () => { setQSearch(''); setFPerson('all'); setFAgent('all'); setFType('all'); };

  const allDecided = (s.attn.items || []).filter(i => !!decisionOf(i)).slice().sort((a, b) => String(logDecidedAt(b)).localeCompare(String(logDecidedAt(a))));
  const matches = it => { const ap = it.approval || {}, d = decisionOf(it);
    if (logFilter !== 'all' && d !== logFilter) return false;
    if (who !== 'all') { const w = String(ap.decided_by || it.ack_by || it.dismissed_by || it.owner || '').toLowerCase(); if (w !== who) return false; }
    if (logSearch) { const hay = [it.title, ap.question, ap.proposal, ap.what_i_found, ap.feedback, it.source, it.seat, ap.decided_by, it.ack_by, it.dismissed_by, it.owner, DEC_LABELS[d] || d].filter(Boolean).join(' ').toLowerCase(); if (!hay.includes(logSearch)) return false; }
    return true; };
  const rows = allDecided.filter(matches);
  const total = rows.length, pages = Math.max(1, Math.ceil(total / LOG_PAGE));
  const page = Math.min(Math.max(1, logPage), pages);
  const start = (page - 1) * LOG_PAGE, pageRows = rows.slice(start, start + LOG_PAGE);
  const countText = allDecided.length ? `${total}${total !== allDecided.length ? ' of ' + allDecided.length : ''} decision${allDecided.length !== 1 ? 's' : ''}` : 'none yet';

  const btn = 'px-3 py-1.5 rounded-lg text-[12px] border border-edge text-slate-300 hover:text-white hover:bg-panel2 disabled:opacity-40 disabled:pointer-events-none';

  return html`
    <div>
      <div class="rounded-xl border border-edge bg-panel/60 p-4 mb-4 max-w-[1000px]">
        <p class="text-sm text-slate-300">The <b class="text-white">human ⇄ AI feedback loop</b>. The agents file what they need from you here — <b class="text-white">approvals</b> that need a decision and <b class="text-white">alerts</b> (risk / failure / performance) that are heads-up only. You answer in the same place: decide or comment on an approval, acknowledge an alert, or <b class="text-white">dismiss</b> anything you're not going to act on — dismissing clears it without recording a decision you didn't make.</p>
      </div>

      <div class="max-w-[1000px] mb-3 flex flex-wrap items-center gap-2">
        <input class="bg-ink border border-edge rounded-lg px-3 py-1.5 text-[13px] text-slate-200 placeholder:text-slate-500 focus:border-accent/60 focus:outline-none flex-1 min-w-[200px]"
               placeholder="Search the queue — title, proposal, agent, seat…" value=${qSearch}
               onInput=${e => setQSearch(e.target.value.trim().toLowerCase())}/>
        <select class=${SEL} value=${fPerson} onChange=${e => setFPerson(e.target.value)} title="Who the item is assigned to">
          <option value="all">Anyone</option><option value="gabe">Gabe</option><option value="collin">Collin</option>
        </select>
        <select class=${SEL} value=${fAgent} onChange=${e => setFAgent(e.target.value)} title="Which agent filed it">
          <option value="all">All agents</option>
          ${agentOpts.map(([n, c]) => html`<option key=${n} value=${n}>${n} (${c})</option>`)}
        </select>
        <select class=${SEL} value=${fType} onChange=${e => setFType(e.target.value)} title="What the item wants from you">
          ${TYPE_FILTERS.map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}
        </select>
        <span class="text-[11px] font-mono text-slate-400 whitespace-nowrap">${items.length}${filtered ? ' of ' + live.length : ''}</span>
        ${filtered ? html`<button class=${btn} onClick=${resetFilters}>Clear filters</button>` : null}
      </div>

      ${selIds.length ? html`
        <div class="max-w-[1000px] mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent/5 px-4 py-2.5">
          <span class="text-[13px] text-white font-medium">${selIds.length} selected</span>
          ${selAlerts.length ? html`<button class=${btn} disabled=${busy} onClick=${() => ackMany(selAlerts)}>Acknowledge ${selAlerts.length} alert${selAlerts.length === 1 ? '' : 's'}</button>` : null}
          <button class="px-3 py-1.5 rounded-lg text-[12px] bg-slate-700 text-slate-100 hover:bg-slate-600 disabled:opacity-40 disabled:pointer-events-none" disabled=${busy}
                  onClick=${() => { const r = prompt(`Dismiss ${selIds.length} item(s) without deciding them?\n\nOptional — why (recorded in the log):`, ''); if (r !== null) dismiss(selIds, r); }}>
            Dismiss ${selIds.length}
          </button>
          <button class=${btn} disabled=${busy} onClick=${() => setSel(new Set())}>Clear selection</button>
          <span class="text-[11px] text-slate-400 ml-auto">Dismissing records who cleared it and why — it never counts as an approval.</span>
        </div>` : null}

      <div id="queue" class="grid gap-3 max-w-[1000px]">
        ${items.length ? html`
          <div class="rounded-xl border border-edge bg-panel glow overflow-hidden">
            <div class="${QGRID} px-4 py-2 text-[10px] uppercase tracking-widest text-slate-400 border-b border-edge/60">
              <input type="checkbox" class="accent-accent h-3.5 w-3.5 cursor-pointer" checked=${allSel} aria-label="Select all shown" onChange=${toggleAll}/>
              <span></span><span>Agent</span><span>Type</span><span>Item</span><span>For</span><span></span>
            </div>
            <div class="divide-y divide-edge/60">
              ${items.map(it => html`<${QueueRow} key=${it.item_id} it=${it} onOpen=${setOpen} selected=${sel.has(it.item_id)} onToggle=${toggle}/>`)}
            </div>
          </div>`
        : html`<div class="rounded-xl border border-edge bg-panel p-10 text-center text-slate-400">${live.length ? html`Nothing matches these filters. <button class="text-accent hover:underline" onClick=${resetFilters}>Clear them</button> to see all ${live.length}.` : html`Nothing needs your response${who !== 'all' ? ' for ' + who : ''}. ✓`}</div>`}
      </div>

      <div id="qlog" class="mt-10 max-w-[1000px]">
        <div class="flex items-center gap-2.5 mb-3 flex-wrap">
          <h2 class="text-white font-semibold text-[15px]">Decision log</h2>
          <span class="text-[11px] font-mono text-slate-400">${countText}</span>
          <div class="ml-auto flex items-center gap-2">
            <input class="bg-ink border border-edge rounded-lg px-3 py-1.5 text-[13px] text-slate-200 placeholder:text-slate-500 focus:border-accent/60 focus:outline-none w-[200px]" placeholder="Search decisions…" onInput=${e => { setLogSearch(e.target.value.trim().toLowerCase()); setLogPage(1); }}/>
            <select class=${SEL} value=${logFilter} onChange=${e => { setLogFilter(e.target.value); setLogPage(1); }}>
              <option value="all">All decisions</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="changes_requested">Changes requested</option>
              <option value="answered">Answered</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>
        </div>
        <div id="qlog-table">
          ${pageRows.length ? html`
            <div class="rounded-xl border border-edge bg-panel overflow-hidden">
              <div class="${LGRID} px-4 py-2 text-[10px] uppercase tracking-widest text-slate-400 border-b border-edge/60"><span>Decision</span><span>Agent</span><span>Type</span><span>Request</span><span>By</span><span class="justify-self-end">When</span></div>
              <div class="divide-y divide-edge/60">
                ${pageRows.map(it => html`<${LogRow} key=${it.item_id} it=${it} onOpen=${setOpen}/>`)}
              </div>
            </div>` : html`<div class="rounded-xl border border-edge bg-panel p-8 text-center text-slate-400 text-sm">${allDecided.length ? `No decisions match ${logSearch ? '“' + logSearch + '”' : 'this filter'}.` : 'Nothing has been decided or acknowledged yet.'}</div>`}
        </div>
        <div id="qlog-pager" class="flex items-center justify-between mt-3">
          ${total > LOG_PAGE ? html`
            <span class="text-[11px] text-slate-400">Showing ${start + 1}–${Math.min(start + LOG_PAGE, total)} of ${total}</span>
            <div class="flex items-center gap-1.5">
              <button class="px-2.5 py-1 rounded-lg border border-edge text-[12px] ${page <= 1 ? 'text-slate-600 pointer-events-none' : 'text-slate-300 hover:text-white hover:bg-panel2'}" onClick=${() => { if (page > 1) setLogPage(page - 1); }}>‹ Prev</button>
              <span class="text-[11px] font-mono text-slate-400 px-1">${page} / ${pages}</span>
              <button class="px-2.5 py-1 rounded-lg border border-edge text-[12px] ${page >= pages ? 'text-slate-600 pointer-events-none' : 'text-slate-300 hover:text-white hover:bg-panel2'}" onClick=${() => { if (page < pages) setLogPage(page + 1); }}>Next ›</button>
            </div>` : null}
        </div>
      </div>

      <${Drawer} it=${open} onClose=${() => setOpen(null)} onAck=${ack} onSave=${save} onDismiss=${dismiss}/>
    </div>`;
}
