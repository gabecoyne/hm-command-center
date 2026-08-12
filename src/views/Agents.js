// Agents view — the agent org roster (org tree + agent detail drawer).
// Ported from the monolith's renderAgents/openDrawer/openSkillMD and helpers.
import { html } from '../html.js';
import { useState, useEffect } from 'preact/hooks';
import { useStore, getState } from '../state.js';
import { aGet } from '../data.js';
import { esc, mdToHtml } from '../lib/format.js';
import { avatarSigil, userAv, EMB, AGENT_PERSONA } from '../lib/avatars.js';
import { copyPrompt } from '../components/Toasts.js';
import { isLive, isAlert } from '../lib/attention.js';

/* ---------- Greek-god avatars (agents-view palette), type chips ---------- */
const ATONE = { clay: ['#C2724A', '#0b0f17'], olive: ['#7BA05B', '#0b0f17'], blue: ['#5FA8D3', '#0b0f17'], gold: ['#D9B493', '#0b0f17'], slate: ['#94a3b8', '#0b0f17'] };
const GOD = { Hermes: ['hermes', 'clay'], Nike: ['nike', 'clay'], Apollo: ['apollo', 'clay'], Metis: ['metis', 'clay'], Iris: ['iris', 'clay'], Hera: ['hera', 'olive'], Hestia: ['hestia', 'olive'], Demeter: ['demeter', 'olive'], Athena: ['athena', 'blue'], Argus: ['argus', 'gold'], Prometheus: ['prometheus', 'gold'], Ganymede: ['ganymede', 'slate'] };
function godAv(persona, px) { const g = GOD[persona]; if (!g) return ''; const t = ATONE[g[1]], sig = EMB[g[0]]; px = px || 24; return '<svg viewBox="0 0 40 40" width="' + px + '" height="' + px + '" class="shrink-0 inline-block align-middle" title="' + esc(persona) + '"><circle cx="20" cy="20" r="19" fill="' + t[0] + '"/><g transform="translate(8,8)" stroke="' + t[1] + '" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round">' + sig + '</g></svg>'; }
function typeChip(kind) { const M = { director: ['Director', 'bg-white/10 text-white'], manager: ['Manager', 'bg-fuchsia-500/15 text-fuchsia-300'], orchestrator: ['Orchestrator', 'bg-white/10 text-white'], agent: ['Agent', 'bg-sky-500/15 text-sky-300'], subagent: ['Sub-agent', 'bg-slate-500/25 text-slate-300'], skill: ['Skill', 'bg-violet-500/15 text-violet-300'], analyst: ['Analyst', 'bg-indigo-500/15 text-indigo-300'], collector: ['Collector', 'bg-emerald-500/15 text-emerald-300'], router: ['Router', 'bg-amber-500/15 text-amber-300'] }[kind] || [kind, 'bg-white/5 text-slate-300']; return '<span class="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ' + M[1] + '">' + esc(M[0]) + '</span>'; }

/* ---------- Roster lookups ---------- */
function titleOfId(id) { const a = agById(id); return (a && a.title) || id; }
function agById(id) { return (getState().roster.agents || []).find(a => a.id === id); }
function personaOfId(id) { const m = (typeof AGENT_PERSONA !== 'undefined') && AGENT_PERSONA[id]; if (m && m.key) return m.key.charAt(0).toUpperCase() + m.key.slice(1); const org = getState().roster.org; const a = agById(id); if (a && a.persona) return a.persona; if (!org) return null; for (const f of org.functions || []) { if (f.orchestrator_agent === id) return f.persona; for (const dm of f.domains || []) if ((dm.agents || []).includes(id)) return dm.persona; } return null; }

/* ---------- Build-prompt copy for gaps ---------- */
function buildPromptFor(key) {
  const P = {
    marketing_analyst: "Build the Marketing Analyst agent for Host Modern. ANALYST role: diagnoses, scores, recommends; NEVER acts; structurally separate from the operators it grades. Weekly, reads the shared pool + all Marketing agents' findings + the prediction ledger, answers 'why is marketing up/down', scores the operators' calls, writes recs. May never edit a threshold, scorer, or resolved outcome. Work through HM_Agent_Conformance_Checklist.md (nine questions) + one eval case + one silence control. Start in shadow. See Doc/Engineering/HM_Agent_Org_Design.md.",
    ops_analyst: "Build the Operations Analyst agent for Host Modern. ANALYST role: diagnoses/scores/recommends, never acts, separate from the operators it grades. Weekly: read the pool + inventory (Demeter) + CS (Hestia) findings; why is coverage/SLA/claims moving; score stockout-date & claim-window calls; recs to Demeter + Hestia. Conformance nine questions + one eval + one control. Start shadow. See Doc/Engineering/HM_Agent_Org_Design.md.",
    finance_analyst: "Activate the Finance Analyst (Athena's prediction ledger) for Host Modern — build to Doc/Engineering/HM_Agent_Design_Finance.md. At Step 0 score every prediction due BEFORE reading new data; explain variance; append next predictions to Reports/hm_prediction_ledger.json. Blocker: reconcile each elapsed month to QBO+bank first. Gate: beat MAE $111,191 or switch off. Never edit an outcome/tolerance/resolved row. Start shadow.",
    cash_po: "Build the Cash-vs-PO interlock (Prometheus, cross-functional) for Host Modern. Question: can we afford this PO on this date — spans Finance (cash/runway) × Inventory (PO timing). Reads model+shipbob facts + Athena's cash forecast + CBP duty calendar; writes data/analysis/cash_po.json. NEVER moves money or edits the model — surface into the Approval Queue. One eval case (a PO that would breach the floor) + one silence control. Start shadow.",
    ea: "Build the Executive Assistant (Ganymede) for Host Modern. ROUTER role: reads and links, never acts or re-analyzes. One lean email/person/day linking the Command Center, routing approvals + attention items by owner. Define the CLOSED attention-item schema first {item_id,owner,seat,type,severity,title,link,source,generated_at,resolves_by}; each producing task writes to it. A daily digest is not a pager — support a severity:urgent same-day fast-path. Conformance nine questions + one control. Start shadow. See Doc/Engineering/HM_Agent_Org_Design.md.",
    prometheus: "Build Prometheus — the single cross-functional Analyst in Host Modern's BI layer. Only spans-functions questions no domain analyst owns (blended CAC × contribution margin, cash × PO, LTV × acquisition). Reads the shared pool + every function analyst's output; writes data/analysis/cross_functional.json + attention flags. NEVER acts. Build only after >=2 function analysts exist. Start shadow. See Doc/Engineering/HM_Agent_Org_Design.md.",
    bi_collectors: "Stand up the BI collector layer (Argus) for Host Modern: one DUMB collector per source (start hm-shipbob-collector, then triplewhale, model, shopify, ga4, gorgias, competitive/pricing). No AI, no judgment — fetch -> data/facts/<source>.json with generated_at + source. hm-shipbob-collector verifies account geo ONCE per run so downstream tasks stop authenticating separately. Follow Agent_Operating_System.md Part 1. See Doc/Engineering/HM_Agent_Org_Design.md."
  };
  return P[key] || ("Help me build the proposed Host Modern agent \"" + key + "\", outlined in Doc/Engineering/HM_Agent_Org_Design.md and shown as a gap in the Command Center. Scope it per HM_Agent_Conformance_Checklist.md (nine questions + one eval case + one silence control), start in shadow mode, follow Agent_Operating_System.md.");
}

/* ---------- Seat/source resolution (org tree helper) ---------- */
const SCHED_GROUPS = [
  { key: "paid", title: "Media Buyer", god: "Nike", emb: "nike", tone: "clay", agent: "paid-media", agents: ["paid-media"], tasks: ["hm-partner-commission"], blurb: "Paid acquisition across Meta + Google — budgets, bids, pausing losers, holding the daily spend floor." },
  { key: "social", title: "Community Manager", god: "Apollo", emb: "apollo", tone: "clay", agent: "organic-social", agents: ["organic-social"], tasks: [], blurb: "Organic comment marketing and inbox engagement across IG, TikTok, YouTube & Facebook." },
  { key: "cro", title: "CRO / Experimentation", god: "Metis", emb: "metis", tone: "clay", agent: "cro", agents: ["cro"], tasks: [], blurb: "On-site A/B tests (PDP, cart, checkout) with a weekly results digest." },
  { key: "seo", title: "SEO Specialist", god: "Prometheus", emb: "prometheus", tone: "char", agent: "seo", agents: ["seo"], tasks: ["hm-r-lp-monday-briefing"], blurb: "Technical + on-page SEO audits, PDP optimization, and the weekly performance tracker." },
  { key: "aeo", title: "Answer-Engine (AEO)", god: "Hera", emb: "hera", tone: "olive", agent: "aeo", agents: ["aeo"], tasks: [], blurb: "Structures content + schema for AI answer surfaces — ChatGPT, Perplexity, Google AIO, Claude." },
  { key: "lifecycle", title: "Lifecycle Marketer", god: "Iris", emb: "iris", tone: "clay", agent: "lifecycle-email", agents: ["lifecycle-email"], tasks: [], blurb: "Klaviyo list hygiene and deliverability — suppression checks before tier thresholds." },
  { key: "collectors", title: "BI Collectors", god: "Argus", emb: "argus", tone: "ink", agents: [], tasks: ["hm-shipbob-collector", "hm-triplewhale-collector", "hm-model-collector", "hm-shopify-collector", "hm-ga4-collector", "hm-gorgias-collector", "hm-competitive-collector", "hm-lifecycle-collector", "hm-cash-collector"], blurb: "Dumb, no-AI collectors — each fetches one source into the shared data pool (data/facts/*) every analyst reads. Collection centralized, interpretation distributed." },
  { key: "analytics", title: "Marketing Analyst & Intel", god: "Argus", emb: "argus", tone: "char", agents: [], tasks: ["hm-marketing-analysis", "hm-competitive-analysis", "hm-competitor-watch", "hm-lifecycle-analyst"], blurb: "Marketing performance vs forecast, competitive intel, competitor/market watch, and the Email/SMS % of revenue read." },
  { key: "brand", title: "Creator & Brand", god: "Ganymede", emb: "ganymede", tone: "ink", agents: ["trybe-manager"], tasks: ["hm-review-mining", "hm-creator-discovery"], blurb: "UGC creator program, creator discovery, and product review mining." },
  { key: "finance", title: "Finance", god: "Athena", emb: "athena", tone: "blue", agent: "athena-finance", agents: ["athena-finance"], tasks: [], blurb: "Daily cash, weekly actuals vs model, monthly close, and CBP duty tracking." },
  { key: "cs", title: "Customer Service", god: "Hestia", emb: "hestia", tone: "olive", agent: "hestia-cs", agents: ["hestia-cs"], tasks: [], blurb: "Gorgias reply drafting, send-readiness grading, and the CS learning loop." },
  { key: "inventory", title: "Inventory & Ops", god: "Demeter", emb: "demeter", tone: "olive", agent: "demeter-inventory", agents: ["demeter-inventory"], tasks: [], blurb: "Demand/coverage watch, inbound container pipeline, and stuck-shipment detection." },
  { key: "ceo", title: "CEO Office & Systems", god: "Hermes", emb: "hermes", tone: "clay", agents: [], tasks: ["hm-ea-ganymede", "hm-partner-agenda-monday", "hm-partner-agenda-thursday", "hm-task-monitor"], blurb: "Ganymede's daily EA router (shadow), the Monday/Thursday partner agendas, and the nightly task-monitor watchdog." }
];
function _agentIdForSource(src) { if (!src) return null; if ((getState().roster.agents || []).some(a => a.id === src)) return src; const S = getState().sched; const tk = (S && S.tasks) ? S.tasks.find(x => x.task_id === src) : null; return (tk && tk.agent) || null; }
function seatForSource(src) {
  const org = getState().roster.org, aid = _agentIdForSource(src);
  if (org && aid) {
    for (const f of org.functions || []) {
      if (f.orchestrator_agent === aid) { const a = agById(aid); return { name: (a && a.title) || aid, persona: f.persona, director: f.persona, func: f.name, level: 'director', src }; }
      for (const dm of f.domains || []) { if ((dm.agents || []).includes(aid)) { const a = agById(aid); return { name: (a && a.title) || aid, persona: dm.persona, manager: dm.persona, domain: dm.name, director: f.persona, func: f.name, level: 'agent', src }; } }
    }
  }
  if (typeof SCHED_GROUPS !== 'undefined') {
    const g = SCHED_GROUPS.find(x => (x.tasks || []).includes(src)) || (aid && SCHED_GROUPS.find(x => (x.agents || []).includes(aid))) || SCHED_GROUPS.find(x => x.god && String(src || '').toLowerCase().includes(String(x.god).toLowerCase()));
    if (g) return { name: g.title, persona: g.god, manager: g.god, level: 'agent', src };
  }
  return { name: src || 'agent', persona: null, level: 'unknown', src };
}

/* ---------- Health / activity / skill helpers ---------- */
function skillBase(p) { if (!p) return ""; const m = String(p).match(/([^/]+)\/SKILL/i); return (m ? m[1] : String(p).split("/").pop()).toLowerCase(); }
function agentKeys(a) { const ks = new Set(); if (a.id) ks.add(String(a.id).toLowerCase()); const sb = skillBase(a.skill); if (sb) ks.add(sb); (a.skills || []).forEach(s => { ks.add(String(s).toLowerCase()); const b = skillBase(s); if (b) ks.add(b); }); (a.match || []).forEach(m => ks.add(String(m).toLowerCase())); return [...ks].filter(Boolean); }
function agentActivity(a, limit) { const keys = agentKeys(a); const hits = (getState().elog.items || []).filter(e => { const hay = `${e.who || ""} ${e.source || ""} ${e.summary || ""} ${e.entity || ""} ${e.platform || ""}`.toLowerCase(); return keys.some(k => hay.includes(k)); }); hits.sort((x, y) => String(y.date || "").localeCompare(String(x.date || ""))); return limit ? hits.slice(0, limit) : hits; }
function lastActive(a) { const h = agentActivity(a, 1); return h.length ? (h[0].date || (h[0].ts || "").slice(0, 10)) : null; }
function health(a, last) { if (String(a.status || "").includes("pending") || String(a.status || "").includes("planned")) return ["grey", "not rolled in"]; if (String(a.tier || "").includes("read-only")) return last ? ["green", "reporting"] : ["grey", "monitor"]; if (!last) return ["grey", "no logged changes"]; const days = Math.floor((Date.now() - Date.parse(last + "T12:00:00")) / 864e5); return days <= 2 ? ["green", `active ${days}d ago`] : days <= 7 ? ["amber", `quiet ${days}d`] : ["red", `stale ${days}d`]; }
const DC = { green: "bg-accent", amber: "bg-amber-400", red: "bg-rose-500", grey: "bg-slate-600" };
const skillsOf = a => (a.skills && a.skills.length ? a.skills : (a.skill ? [a.skill] : []));
const childrenOf = id => (getState().roster.agents || []).filter(a => a.parent === id);
const GRID = 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3';
function tile(a) {
  const last = lastActive(a), [d, l] = health(a, last), ns = skillsOf(a).length, tier = (a.tier || "").split(/[ (]/)[0];
  return `<div class="agtile leaf rounded-xl border border-edge bg-panel glow p-4 cursor-pointer hover:border-slate-500 transition flex flex-col gap-2" data-agent="${esc(a.id)}">
    <div class="flex items-center gap-2"><span class="h-2.5 w-2.5 rounded-full ${DC[d]}" title="${esc(l)}"></span>${avatarSigil(a.id, 22)}<span class="font-mono text-sm text-white truncate flex-1">${esc(a.id)}</span><span class="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-slate-400">${esc(tier)}</span></div>
    <p class="text-[12px] text-slate-400 clamp2">${esc(a.desc || a.role || "")}</p>
    <div class="flex items-center gap-2 text-[10px] font-mono text-slate-400 mt-auto pt-1"><span class="px-1.5 py-0.5 rounded bg-white/5">${ns} skill${ns === 1 ? "" : "s"}</span><span>${last ? "active " + esc(last) : "—"}</span><span class="ml-auto text-emerald-400/80 det">Details ›</span></div>
  </div>`;
}
function groupBar(a) {
  const last = lastActive(a), [d, l] = health(a, last), n = childrenOf(a.id).length; const isO = String(a.role || "").includes("orchestrator");
  return `<div class="agtile group rounded-xl border ${isO ? 'border-accent/25 bg-gradient-to-br from-panel2 to-panel' : 'border-sky-500/20 bg-panel2/40'} glow p-4 cursor-pointer hover:border-accent/40" data-agent="${esc(a.id)}" data-group="${esc(a.id)}">
    <div class="flex items-center gap-3"><span class="h-2.5 w-2.5 rounded-full ${DC[d]}" title="${esc(l)}"></span>${avatarSigil(a.id, 24)}
      <div class="flex-1 min-w-0"><div class="font-mono text-sm text-white">${esc(a.id)} <span class="text-[10px] uppercase tracking-wider ${isO ? 'text-emerald-300/70' : 'text-sky-300/70'} ml-1">${isO ? 'orchestrator' : 'manager'}</span></div><div class="text-[12px] text-slate-400 truncate">${esc(a.desc || "")}</div></div>
      <span class="det text-[11px] px-2 py-1 rounded-lg border border-edge text-slate-300 hover:text-white shrink-0">Details</span>
      <span class="caret text-xs text-slate-300 font-mono shrink-0">${n} agents ▾</span>
    </div>
  </div>`;
}
function agentGroup(a, depth, done) {
  done.add(a.id);
  return `<div class="${depth > 0 ? 'mt-3' : ''}">${groupBar(a)}<div class="subs mt-3 ${depth > 0 ? 'ml-3 sm:ml-5 border-l-2 border-edge/40 pl-3 sm:pl-4' : ''}" data-subs="${esc(a.id)}">${renderChildren(a.id, depth + 1, done)}</div></div>`;
}
function renderChildren(parentId, depth, done) {
  const kids = childrenOf(parentId); let html = "", batch = [];
  const flush = () => { if (batch.length) { html += `<div class="${GRID}">${batch.map(k => { done.add(k.id); return tile(k); }).join("")}</div>`; batch = []; } };
  for (const k of kids) { if (childrenOf(k.id).length) { flush(); html += agentGroup(k, depth, done); } else batch.push(k); }
  flush(); return html;
}

/* ---------- Full skill docs cache + prompt builders ---------- */
let _skillsMD = null;
async function getSkillsMD() { if (_skillsMD === null) { try { _skillsMD = await aGet("skills_md.json"); } catch { _skillsMD = {}; } } return _skillsMD; }
let _contractsMD = null;
async function getContractsMD() { if (_contractsMD === null) { try { _contractsMD = await aGet("contracts_md.json"); } catch { _contractsMD = {}; } } return _contractsMD; }

/* ---------- Feedback (attention queue) items for one agent ---------- */
const FB_TL = { approval: 'Approval', risk: 'Risk', failure: 'Failure', performance: 'Performance' };
const FB_TC = { approval: 'bg-indigo-500/15 text-indigo-300', risk: 'bg-amber-500/15 text-amber-300', failure: 'bg-rose-500/15 text-rose-300', performance: 'bg-sky-500/15 text-sky-300' };
const FB_SEV = { urgent: 'bg-rose-500 ring-2 ring-rose-400/40', high: 'bg-rose-500', normal: 'bg-slate-600', med: 'bg-amber-400', low: 'bg-slate-600' };
// An item belongs to this agent if its source resolves to the agent id; an orchestrator
// also owns everything across its function. Directors/managers thus see their whole team's asks.
function itemsForAgent(a) {
  const items = (getState().attn.items || []);
  const isOrch = String(a.role || '').includes('orchestrator');
  return items.filter(it => {
    const aid = _agentIdForSource(it.source);
    if (aid && aid === a.id) return true;
    if (isOrch && a.function) { const m = seatForSource(it.source); if (m && m.func && String(m.func).toLowerCase() === String(a.function).toLowerCase()) return true; }
    return false;
  });
}
function fbItemRow(it) {
  const t = it.type || 'approval', ap = it.approval || {}, live = isLive(it), alert = isAlert(it);
  const dec = alert ? (it.ack_at ? 'acknowledged' : '') : (ap.decision || '');
  const status = live ? (alert ? 'awaiting acknowledgement' : 'awaiting your decision') : (dec ? dec.replace(/_/g, ' ') : (it.status || 'resolved'));
  const stTone = live ? 'text-amber-300' : (dec === 'rejected' ? 'text-rose-300' : dec === 'changes_requested' ? 'text-orange-300' : 'text-emerald-300/80');
  const preview = alert ? (ap.detail || '') : (ap.proposal || ap.what_i_found || ap.question || '');
  return `<div class="rounded-lg border ${live ? 'border-amber-500/30 bg-amber-400/[0.03]' : 'border-edge/60 bg-panel2/30'} p-2.5 mb-1.5">
    <div class="flex items-center gap-2">
      <span class="h-2 w-2 rounded-full shrink-0 ${FB_SEV[it.severity] || 'bg-slate-600'}" title="${esc(it.severity || '')}"></span>
      <span class="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${FB_TC[t] || 'bg-slate-700 text-slate-300'} shrink-0">${esc(FB_TL[t] || t)}</span>
      <span class="text-[12px] text-white truncate flex-1">${esc(it.title || '')}</span>
      <span class="text-[10px] font-mono ${stTone} shrink-0 capitalize">${esc(status)}</span>
    </div>
    ${preview ? `<div class="text-[11px] text-slate-400 mt-1 clamp2">${esc(preview)}</div>` : ''}
    ${(!alert && ap.feedback) ? `<div class="text-[11px] text-slate-500 mt-1"><span class="text-slate-400">your note:</span> ${esc(ap.feedback)}</div>` : ''}
  </div>`;
}
function feedbackHTML(a) {
  const all = itemsForAgent(a); if (!all.length) return '';
  const live = all.filter(isLive), done = all.filter(it => !isLive(it));
  const openBlock = live.length ? live.sort((x, y) => String(x.generated_at || '').localeCompare(String(y.generated_at || ''))).map(fbItemRow).join('') : `<div class="text-xs text-slate-400 mb-1.5">Nothing open. ✓</div>`;
  const recent = done.sort((x, y) => String(y.generated_at || '').localeCompare(String(x.generated_at || ''))).slice(0, 3);
  const doneBlock = recent.length ? `<details class="mt-1"><summary class="text-[11px] text-slate-400 cursor-pointer hover:text-white select-none">${done.length} resolved — show recent</summary><div class="mt-2">${recent.map(fbItemRow).join('')}</div></details>` : '';
  return `<div class="flex items-center gap-2 mb-1.5 mt-5"><div class="text-[10px] uppercase tracking-widest text-slate-400">Feedback loop</div>${live.length ? `<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300">${live.length} open</span>` : ''}<span class="text-[10px] text-slate-500 ml-auto">act in the Feedback tab</span></div>${openBlock}${doneBlock}`;
}

/* ---------- Hypotheses (prediction ledger → calibration snapshot) for one agent ---------- */
function calibForAgent(a) {
  const seats = (getState().calib && getState().calib.seats) || [];
  const keys = new Set([a.id, a.persona, a.function, a.domain].filter(Boolean).map(x => String(x).toLowerCase()));
  agentKeys(a).forEach(k => keys.add(k));
  return seats.find(s => keys.has(String(s.seat || '').toLowerCase())) || null;
}
function hypothesesHTML(a) {
  const c = calibForAgent(a);
  const head = `<div class="text-[10px] uppercase tracking-widest text-slate-400 mb-1.5 mt-5">Hypotheses <span class="text-slate-500 normal-case tracking-normal">· dated, falsifiable predictions it must score itself against</span></div>`;
  if (!c) return head + `<div class="rounded-lg border border-dashed border-edge/70 p-2.5 text-[11px] text-slate-400">No hypotheses logged yet — this seat hasn't adopted the prediction ledger (<code>Scripts/prediction_ledger.py</code>). A finding can't be wrong; a prediction can. This fills in as the agent starts recording predictions at Step 0.</div>`;
  const hr = c.hit_rate == null ? '—' : Math.round(c.hit_rate * 100) + '%';
  const stat = (label, val, tone) => `<span class="text-[11px] px-2 py-1 rounded-lg border border-edge ${tone || 'text-slate-300'}"><b class="text-white">${val}</b> ${label}</span>`;
  const bar = `<div class="flex flex-wrap gap-1.5 mb-2">${stat('hit rate', hr)}${stat('open', c.open || 0)}${stat('resolved', c.resolved || 0)}${c.due_now ? stat('due now', c.due_now, 'text-amber-300 border-amber-500/40') : ''}</div>`;
  const rows = (c.open_predictions || []).slice(0, 6).map(p => `<div class="flex items-start gap-2 py-1.5 border-t border-edge/40 first:border-0">
      <span class="text-[10px] font-mono ${p.overdue ? 'text-amber-300' : 'text-slate-400'} mt-0.5 w-16 shrink-0">${esc(String(p.resolves_on || '').slice(0, 10) || '—')}</span>
      <span class="text-[12px] text-slate-300 flex-1">${esc(p.subject || p.claim || '')}${p.claim != null && p.subject ? ` <span class="text-slate-500">→ ${esc(String(p.claim))}${p.unit ? ' ' + esc(p.unit) : ''}</span>` : ''}${p.overdue ? ' <span class="text-[9px] font-mono px-1 rounded bg-amber-400/15 text-amber-300">overdue</span>' : ''}</span>
    </div>`).join('');
  return head + bar + (rows || `<div class="text-xs text-slate-400">No open predictions.</div>`) + (c.due_now ? `<div class="text-[11px] text-amber-300/90 mt-2">${c.due_now} prediction${c.due_now === 1 ? '' : 's'} ripe but unscored — read-back debt (Step 0 owes a resolution).</div>` : '');
}

/* ---------- Contracts that govern this agent ---------- */
const GLOBAL_CONTRACTS = [['Agent_Operating_Contract', 'Operating Contract'], ['Attention_Item_Contract', 'Feedback-loop contract'], ['Agent_Rollout_Guide', 'Rollout guide']];
function contractsFor(a) {
  const list = GLOBAL_CONTRACTS.slice();
  const k = `${a.id} ${a.domain || ''} ${a.function || ''} ${a.persona || ''}`.toLowerCase();
  if (/paid|media|nike/.test(k)) list.push(['Paid_Media_Allocation_Contract', 'Paid-media allocation']);
  return list;
}
function contractsHTML(a) {
  const rows = contractsFor(a).map(([stem, label]) => `<button data-contractmd="${esc(stem)}" class="text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-edge/60 hover:bg-panel2/40"><span class="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-slate-400">MD</span><span class="text-[12px] text-slate-200">${esc(label)}</span><span class="text-slate-500 ml-auto text-[11px]">read ›</span></button>`).join('');
  return `<div class="text-[10px] uppercase tracking-widest text-slate-400 mb-1.5 mt-5">Contracts — the rules it operates under</div><div class="grid sm:grid-cols-2 gap-1.5">${rows}</div>`;
}

/* ---------- Runs (run log) for one agent — did it run, succeed, what did it output ---------- */
const RUN_TONE = { completed: 'bg-emerald-500/15 text-emerald-300', ok: 'bg-emerald-500/15 text-emerald-300', success: 'bg-emerald-500/15 text-emerald-300', failed: 'bg-rose-500/15 text-rose-300', error: 'bg-rose-500/15 text-rose-300', running: 'bg-sky-500/15 text-sky-300' };
function runsForAgent(a) {
  const keys = new Set(agentKeys(a));
  return ((getState().runs && getState().runs.items) || []).filter(r => {
    const sk = String(r.skill || r.task_id || '').toLowerCase();
    if (sk && (keys.has(sk) || (skillBase(sk) && keys.has(skillBase(sk))))) return true;
    const aid = _agentIdForSource(r.skill || r.task_id);
    return aid && aid === a.id;
  }).sort((x, y) => String(y.started_at || y.finished_at || '').localeCompare(String(x.started_at || x.finished_at || '')));
}
function runRow(r) {
  const st = String(r.status || '').toLowerCase(), tone = RUN_TONE[st] || 'bg-slate-500/20 text-slate-300';
  const when = String(r.started_at || r.finished_at || '').slice(0, 10);
  return `<div class="py-1.5 border-t border-edge/40 first:border-0">
    <div class="flex items-center gap-2">
      <span class="text-[10px] font-mono text-slate-400 w-16 shrink-0">${esc(when)}</span>
      <span class="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${tone} shrink-0">${esc(r.status || '—')}</span>
      <span class="text-[12px] text-slate-300 truncate flex-1">${esc(r.task_name || r.skill || '')}</span>
    </div>
    ${r.key_outputs ? `<div class="text-[11px] text-slate-400 mt-0.5 clamp2 pl-[74px]">${esc(r.key_outputs)}</div>` : ''}
    ${r.issues_flagged ? `<div class="text-[11px] text-amber-300/90 mt-0.5 clamp2 pl-[74px]">⚠ ${esc(r.issues_flagged)}</div>` : ''}
  </div>`;
}
function runsHTML(a) {
  const runs = runsForAgent(a);
  const head = `<div class="text-[10px] uppercase tracking-widest text-slate-400 mb-1.5 mt-5">Runs — execution log</div>`;
  const lr = a.last_run ? `<div class="text-[11px] text-slate-400 mb-1.5">Last run <span class="font-mono text-slate-300">${esc(String(a.last_run).slice(0, 16).replace('T', ' '))}</span>${a.last_run_result ? ` · <span class="text-slate-300">${esc(String(a.last_run_result))}</span>` : ''}</div>` : '';
  if (!runs.length) return head + lr + (a.last_run ? '' : `<div class="text-xs text-slate-400">No runs logged for this agent yet.</div>`);
  return head + lr + runs.slice(0, 5).map(runRow).join('');
}
function agentPrompt(a) { return `Let's review the ${a.id} agent. Its config is at ${a.skill || "(skill path)"} and it operates under Scheduled/_shared/Agent_Operating_Contract.md. Responsibility: ${a.desc || a.role || ""}. Read its skill + recent entries in Wiki/data/event_log.json and Logs/, tell me how it's performing, and whether anything should change.`; }
function logPrompt(e, a) { return `On ${e.date || ""}, ${a ? a.id + " (" + (e.source || "") + ")" : (e.source || "an agent")} did: "${e.summary || ""}"${e.entity ? " on " + e.entity : ""}. ${e.details ? "Details: " + e.details + ". " : ""}Pull the current metrics for that entity and tell me whether this change is working and what to do next.`; }

/* ---------- Org roster HTML (renderAgents) ---------- */
function buildAgentsHTML() {
  const org = getState().roster.org;
  if (!org || !org.functions) {
    return (getState().roster.agents || []).length ? `<div class="${GRID} mb-6">${(getState().roster.agents || []).map(tile).join("")}</div>` : `<div class="rounded-xl border border-edge bg-panel p-10 text-center text-slate-400">No agents / org in ecomm_state.json.</div>`;
  }
  const liveNode = id => {
    const a = agById(id); if (!a) return `<div class="rounded-lg border border-dashed border-slate-600 p-2 text-[11px] text-slate-500">${esc(id)} · not in roster</div>`; const hl = health(a, lastActive(a)); const n = (a.skills || []).length; const nSub = (a.children || []).length;
    return `<button data-agent="${esc(id)}" class="agnode w-full text-left rounded-lg border border-edge bg-panel2/40 hover:bg-panel2 hover:border-slate-500 p-2 transition"><div class="flex items-center gap-2">${avatarSigil(id, 22)}<div class="min-w-0 flex-1"><div class="flex items-center gap-1.5"><span class="text-[13px] font-semibold text-white truncate leading-tight">${esc(a.title || id)}</span><span class="h-1.5 w-1.5 rounded-full ${DC[hl[0]]} shrink-0" title="${esc(hl[1])}"></span></div><div class="flex items-center gap-1.5 mt-1">${typeChip(a.tier_kind === 'orchestrator' ? 'director' : 'agent')}<span class="font-mono text-[10px] text-slate-500 truncate">${esc(id)}</span><span class="text-[10px] text-slate-500">· ${n} skill${n === 1 ? '' : 's'}${nSub ? ` · ${nSub} sub` : ''}</span></div></div></div></button>`;
  };
  const gapNode = g => `<div class="rounded-lg border border-dashed border-amber-500/60 bg-amber-400/5 p-2.5"><div class="flex items-center gap-2 mb-1">${g.persona ? godAv(g.persona, 22) : '<span class="h-2 w-2 rounded-full bg-amber-400 shrink-0"></span>'}<div class="min-w-0 flex-1"><span class="text-[12px] text-white truncate block leading-tight">${esc(g.name)}</span>${g.persona ? `<span class="text-[10px] text-slate-400">${esc(g.persona)}</span>` : ''}</div>${typeChip(g.role || 'agent')}</div><div class="text-[10px] text-slate-400 mb-2">${g.note ? esc(g.note) : 'proposed — not built yet'}</div><button data-build="${esc(g.key || g.name)}" class="text-[10px] font-mono px-2 py-1 rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/15">⧉ Build this agent</button></div>`;
  const domainCard = dm => `<div class="rounded-lg border border-edge bg-panel/60 p-2.5"><div class="flex items-center gap-2 mb-2">${godAv(dm.persona, 26)}<div class="min-w-0 flex-1"><div class="flex items-center gap-1.5"><span class="text-[13px] font-semibold text-white leading-tight truncate">${esc(dm.manager_title || dm.name + ' Manager')}</span>${typeChip('manager')}</div><div class="text-[10px] text-slate-400">${esc(dm.persona || '')}${dm.persona ? ' · ' : ''}${esc(dm.name)}</div></div></div><div class="space-y-1.5">${(dm.agents || []).map(liveNode).join('') || '<div class="text-[11px] text-slate-500">—</div>'}</div></div>`;
  const analystNode = id => {
    const a = agById(id); if (!a) return `<div class="rounded-lg border border-dashed border-slate-600 p-2 text-[11px] text-slate-500">${esc(id)} · not in roster</div>`; const hl = health(a, lastActive(a)); const n = (a.skills || []).length; const sh = /shadow/i.test(a.tier || ''); const av = (a.persona && typeof GOD !== 'undefined' && GOD[a.persona]) ? godAv(a.persona, 22) : avatarSigil(id, 22); return `<button data-agent="${esc(id)}" class="agnode w-full text-left rounded-lg border border-indigo-500/40 bg-indigo-500/5 hover:bg-indigo-500/10 hover:border-indigo-400 p-2 transition"><div class="flex items-center gap-2">${av}<div class="min-w-0 flex-1"><div class="flex items-center gap-1.5"><span class="text-[13px] font-semibold text-white truncate leading-tight">${esc(a.title || id)}</span><span class="h-1.5 w-1.5 rounded-full ${DC[hl[0]]} shrink-0" title="${esc(hl[1])}"></span></div><div class="flex items-center gap-1.5 mt-1">${typeChip('analyst')}<span class="font-mono text-[10px] text-slate-500 truncate">${esc(id)}</span>${sh ? '<span class="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300">shadow</span>' : ''}<span class="text-[10px] text-slate-500">· ${n} skill${n === 1 ? '' : 's'}</span></div></div></div></button>`;
  };
  const fnCol = f => { const oa = f.orchestrator_agent; return `<div class="rounded-xl border border-edge bg-panel glow overflow-hidden flex flex-col"><button class="agnode w-full text-left px-4 py-3 border-b border-edge ${oa ? 'cursor-pointer hover:bg-panel2/40' : ''}" ${oa ? `data-agent="${esc(oa)}"` : ''}><div class="flex items-center gap-2.5">${godAv(f.persona, 34)}<div class="min-w-0 flex-1"><div class="flex items-center gap-2"><span class="text-white font-semibold text-[16px]">${esc(f.director_title || f.name + ' Director')}</span>${typeChip('director')}${f.persona_status === 'proposed' ? '<span class="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300">proposed</span>' : ''}</div><div class="text-[10px] font-mono uppercase tracking-widest text-slate-400 mt-0.5">${esc(f.persona || '')} · ${esc(f.name)}</div></div>${oa ? '<span class="text-slate-500 text-sm">›</span>' : ''}</div></button><div class="p-3 space-y-2 flex-1">${(f.domains || []).map(domainCard).join('')}${(f.analysts || []).map(analystNode).join('')}${(f.gaps || []).map(gapNode).join('')}</div></div>`; };
  const intro = `<div class="rounded-xl border border-edge bg-panel/60 p-4 mb-4"><p class="text-sm text-slate-300 mb-2.5">Host Modern runs as an <b class="text-white">agent org</b>. Every seat gets a <b class="text-white">job title</b>; its Greek god is the subtitle. A <b class="text-white">Director</b> orchestrates a function and reads its team's files; a <b class="text-white">Manager</b> owns a domain and the agents in it; an <b class="text-white">Agent</b> runs on a schedule and does the work; each agent runs one or more <b class="text-white">skills</b> (its SKILL.md); <b class="text-white">sub-agents</b> spin up inside a single run. Gods sit on the seats (Directors + Managers); agents inherit their seat's god. Click any card for the full detail — including the entire skill doc.</p><div class="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-400 items-center">${typeChip('director')}<span class="-ml-2">orchestrates a function</span>${typeChip('manager')}<span class="-ml-2">owns a domain</span>${typeChip('agent')}<span class="-ml-2">runs on a schedule</span>${typeChip('subagent')}<span class="-ml-2">spun up inside one run</span>${typeChip('skill')}<span class="-ml-2">the SKILL.md it runs</span><span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-amber-400"></span>proposed / gap</span></div></div>`;
  const C = org.office_ceo, ceo = C ? `<div class="rounded-xl border border-edge bg-gradient-to-r from-panel to-panel2 glow p-4 flex flex-wrap items-center gap-4 mb-4"><div class="flex items-center gap-3"><div class="flex -space-x-1.5">${userAv('gabe', 40)}${userAv('collin', 40)}</div><div><div class="text-white font-semibold">${esc(C.name || 'Office of the CEO')}</div><div class="text-[10px] font-mono uppercase tracking-widest text-slate-400">${esc(C.visionary || 'Gabe')} · Visionary — ${esc(C.integrator || 'Collin')} · Integrator/COO</div></div></div>${C.ea ? `<div class="ml-auto w-full sm:w-[360px]">${(C.ea.status === 'built' || C.ea.agent) ? `<div class="rounded-lg border border-edge bg-panel2/40 p-2.5"><div class="flex items-center gap-2 mb-1">${godAv('Ganymede', 22)}<div class="min-w-0 flex-1"><span class="text-[12px] text-white truncate block leading-tight">${esc(C.ea.title || 'Executive Assistant')}</span><span class="text-[10px] text-slate-400">Ganymede · Office of the CEO</span></div>${typeChip('router')}<span class="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" title="built · shadow"></span></div><div class="text-[10px] text-slate-400 mb-2">${esc(C.ea.note || 'live in shadow — one lean email/person/day, routes approvals + attention by owner')}</div><button data-agent="${esc(C.ea.agent || 'ea-ganymede')}" class="agnode text-[10px] font-mono px-2 py-1 rounded border border-edge text-slate-300 hover:text-white hover:bg-panel2">open ›</button></div>` : gapNode({ name: C.ea.title || C.ea.name, role: C.ea.role || 'router', note: C.ea.note, persona: 'Ganymede', key: 'ea' })}</div>` : ''}</div>` : '';
  const B = org.business_intelligence, bi = B ? `<div class="rounded-xl border border-edge bg-panel glow p-4 mt-4"><div class="flex items-center gap-2.5 mb-2">${godAv('Argus', 30)}<div><div class="flex items-center gap-1.5"><span class="text-white font-semibold">${esc(B.manager_title || 'BI Manager')}</span>${typeChip('manager')}${B.status === 'proposed' ? '<span class="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300">proposed</span>' : ''}</div><div class="text-[10px] font-mono uppercase tracking-widest text-slate-400">Argus · ${esc(B.name || 'Business Intelligence')} · shared services</div></div></div><div class="text-[11px] text-slate-400 mb-2">Dumb collectors → shared pool every analyst reads. Collection centralized, interpretation distributed.</div><div class="grid md:grid-cols-2 gap-3"><div><div class="text-[10px] uppercase tracking-widest text-slate-400 mb-1.5">Collectors</div><div class="flex flex-wrap gap-1.5">${(((B.collectors || {}).built) || []).map(x => `<span class="font-mono text-[10px] px-2 py-0.5 rounded bg-accent/15 text-emerald-300">${esc(x)} ✓</span>`).join(' ')} ${(((B.collectors || {}).pending) || []).map(x => `<span class="font-mono text-[10px] px-2 py-0.5 rounded bg-white/5 text-slate-400 border border-edge">${esc(x)}</span>`).join(' ')}</div><div class="mt-2">${(((B.collectors || {}).pending) || []).length ? `<button data-build="bi_collectors" class="text-[10px] font-mono px-2 py-1 rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/15">⧉ Build the collector layer</button>` : `<span class="text-[10px] text-emerald-300">${(((B.collectors || {}).built) || []).length} of ${(((B.collectors || {}).built) || []).length} built ✓ <span class="text-slate-500">· pending on-machine registration + first-run verify</span></span>`}</div></div>${B.cross_functional_analyst ? `<div>${(B.cross_functional_analyst.status === 'built' && B.cross_functional_analyst.agent && agById(B.cross_functional_analyst.agent)) ? analystNode(B.cross_functional_analyst.agent) : gapNode({ name: B.cross_functional_analyst.title || B.cross_functional_analyst.name, role: 'analyst', persona: 'Prometheus', key: 'prometheus', note: 'CAC×margin · cash×PO · LTV×acquisition' })}</div>` : ''}</div></div>` : '';
  return intro + ceo + `<div class="grid lg:grid-cols-3 gap-4">` + org.functions.map(fnCol).join('') + `</div>` + bi;
}

/* ---------- Agent detail drawer (agdrawer) content ---------- */
function openDrawerContent(id) {
  const a = agById(id); if (!a) return null;
  const sch = getState().roster.schedules || {}, sk = skillsOf(a); const per = personaOfId(a.id); const isOrch = String(a.role || "").includes("orchestrator");
  const sched = getState().sched;
  const taskInfo = {}; ((sched && sched.tasks) || []).forEach(t => { taskInfo[t.task_id] = { cron: t.cron, human: t.schedule_human }; });
  const skRows = sk.length ? sk.map(s => { const base = skillBase(s) || s; const info = (typeof SKILLS !== 'undefined' && SKILLS[base]) || {}; const ti = taskInfo[base] || {}; const when = info.s || ti.human || sch[base] || sch[s] || a.schedule || "—"; return `<button data-skillmd="${esc(base)}" class="w-full text-left flex items-center gap-3 px-2.5 py-1.5 rounded-lg border border-edge/60 mb-1.5 hover:bg-panel2/40"><span class="flex items-center gap-2 min-w-0 flex-1">${typeChip('skill')}<code class="font-mono text-[11px] text-slate-200 truncate">${esc(base)}</code></span><span class="text-[10px] text-slate-400 shrink-0 text-right">${esc(when)}${ti.cron ? ` · <code class="text-slate-500">${esc(ti.cron)}</code>` : ""} ›</span></button>`; }).join("") : `<div class="text-xs text-slate-400">—</div>`;
  const acts = agentActivity(a, 8);
  const actRows = acts.length ? acts.map((e, i) => `<div class="flex items-start gap-2 py-1.5 border-t border-edge/40 first:border-0"><span class="text-[10px] font-mono text-slate-400 mt-0.5 w-14 shrink-0">${esc(e.date || "")}</span><span class="text-[12px] text-slate-300 flex-1">${esc(e.summary || "")}${e.who ? ` <span class="text-slate-400">· ${esc(e.who)}</span>` : ""}</span><button data-chat-log="${i}" class="text-[10px] px-1.5 py-0.5 rounded border border-edge text-slate-400 hover:text-white shrink-0">Chat</button></div>`).join("") : `<div class="text-xs text-slate-400 py-1">No logged activity matched yet.</div>`;
  const subs = childrenOf(a.id); const chld = (a.children && a.children.length) ? a.children : subs.map(s => s.id);
  const chldRow = chld.length ? `<div class="mt-3"><div class="text-[10px] uppercase tracking-widest text-slate-400 mb-1.5">Sub-agents</div>${chld.map(c => `<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-500/25 text-slate-300 mr-1 mb-1 inline-block">${esc(c)}</span>`).join("")}</div>` : "";
  const rep = a.reports_to ? `<div class="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">reports to ${/collin/i.test(a.reports_to) ? userAv('collin', 18) + ' <span class="text-slate-300">Collin</span>' : /gabe/i.test(a.reports_to) ? userAv('gabe', 18) + ' <span class="text-slate-300">Gabe</span>' : `<span class="text-slate-300">${esc(a.reports_to)}</span>`}</div>` : "";
  const titleHTML = avatarSigil(a.id, 22) + ' <span class="align-middle font-semibold">' + esc(a.title || a.id) + '</span> ' + typeChip(a.tier_kind === 'orchestrator' ? 'director' : 'agent') + (per ? ' <span class="text-slate-400 font-normal text-sm align-middle">' + esc(per) + '</span>' : '') + ' <span class="text-slate-500 font-mono text-[11px] align-middle">' + esc(a.id) + '</span>';
  const bodyHTML = `
    <div class="flex flex-wrap items-center gap-2 mb-3"><span class="h-2.5 w-2.5 rounded-full ${DC[health(a, lastActive(a))[0]]}"></span>${typeChip(isOrch ? 'orchestrator' : 'agent')}<span class="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-white/5 text-slate-300">${esc(a.tier || "")}</span><span class="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded ${String(a.status || "").includes("built") ? "bg-accent/15 text-emerald-300" : "bg-white/5 text-slate-400"}">${esc(a.status || "")}</span></div>
    <div class="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Responsibility</div>
    <p class="text-sm text-slate-300 leading-relaxed">${esc(a.desc || "—")}</p>${chldRow}${rep}
    ${feedbackHTML(a)}
    ${hypothesesHTML(a)}
    <div class="text-[10px] uppercase tracking-widest text-slate-400 mb-1.5 mt-5">Skills — click to read the full SKILL.md</div>${skRows}
    ${contractsHTML(a)}
    ${runsHTML(a)}
    <div class="flex items-center justify-between mb-1 mt-5"><div class="text-[10px] uppercase tracking-widest text-slate-400">Recent activity <span class="text-slate-500 normal-case tracking-normal">· business changes</span></div><button id="ag-chat" class="text-[11px] px-2 py-1 rounded-lg bg-accent/15 border border-accent/30 text-emerald-300 hover:bg-accent/25">💬 Chat about this agent</button></div>${actRows}`;
  return { titleHTML, bodyHTML };
}

/* ---------- Skill SKILL.md drawer content (openSkillMD) ---------- */
function openSkillContent(skill, backAgent, skillMd) {
  const titleHTML = typeChip('skill') + ' <span class="font-mono">' + esc(skill) + '</span>';
  const info = (typeof SKILLS !== 'undefined' && SKILLS[skill]) || {};
  let bodyHTML;
  if (skillMd === null) {
    bodyHTML = '<p class="text-sm text-slate-400">Loading…</p>';
  } else {
    const md = skillMd.md;
    const rendered = md ? mdToHtml(md) : '<p class="text-sm text-slate-400">Full SKILL.md not bundled yet — run <code>python3 CommandCenter/build_skills_md.py</code>.</p>';
    bodyHTML = '<div class="flex flex-wrap items-center gap-2 mb-3">' + (backAgent ? '<button id="sk-back" class="text-[11px] px-2 py-1 rounded-lg border border-edge text-slate-300 hover:text-white">← ' + esc(backAgent) + '</button>' : '') + '<button data-skill-modify="' + esc(skill) + '" class="text-[11px] px-2 py-1 rounded-lg border border-edge text-slate-300 hover:text-white">⧉ Prompt to modify this skill</button>' + (info.s ? '<span class="text-[11px] text-slate-400 ml-1">' + esc(info.s) + '</span>' : '') + '</div><div class="text-[10px] font-mono text-slate-500 mb-3">Scheduled/' + esc(skill) + '/SKILL.md</div>' + (md ? '<div class="md-body">' + rendered + '</div>' : rendered);
  }
  return { titleHTML, bodyHTML };
}

/* ---------- Contract SKILL.md-style drawer content (openContractContent) ---------- */
function openContractContent(stem, backAgent, contractMd) {
  const nice = String(stem || '').replace(/_/g, ' ');
  const titleHTML = '<span class="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-slate-400">CONTRACT</span> <span class="font-mono align-middle">' + esc(nice) + '</span>';
  let bodyHTML;
  if (contractMd === null) {
    bodyHTML = '<p class="text-sm text-slate-400">Loading…</p>';
  } else {
    const md = contractMd.md;
    const rendered = md ? mdToHtml(md) : '<p class="text-sm text-slate-400">Contract not bundled yet — run <code>python3 CommandCenter/build_contracts_md.py</code>.</p>';
    bodyHTML = '<div class="flex flex-wrap items-center gap-2 mb-3">' + (backAgent ? '<button id="sk-back" class="text-[11px] px-2 py-1 rounded-lg border border-edge text-slate-300 hover:text-white">← ' + esc(backAgent) + '</button>' : '') + '</div><div class="text-[10px] font-mono text-slate-500 mb-3">Scheduled/_shared/' + esc(stem) + '.md</div>' + (md ? '<div class="md-body">' + rendered + '</div>' : rendered);
  }
  return { titleHTML, bodyHTML };
}

function Drawer({ drawer, setDrawer, onClose }) {
  const [skillMd, setSkillMd] = useState(null);
  const [contractMd, setContractMd] = useState(null);
  const skillKey = drawer && drawer.mode === 'skill' ? drawer.skill : null;
  const contractKey = drawer && drawer.mode === 'contract' ? drawer.contract : null;
  useEffect(() => {
    if (!skillKey) return;
    let live = true; setSkillMd(null);
    getSkillsMD().then(all => { if (live) setSkillMd({ md: all[skillKey] }); });
    return () => { live = false; };
  }, [skillKey]);
  useEffect(() => {
    if (!contractKey) return;
    let live = true; setContractMd(null);
    getContractsMD().then(all => { if (live) setContractMd({ md: all[contractKey] }); });
    return () => { live = false; };
  }, [contractKey]);

  if (!drawer) return null;
  const content = drawer.mode === 'skill' ? openSkillContent(drawer.skill, drawer.backAgent, skillMd)
    : drawer.mode === 'contract' ? openContractContent(drawer.contract, drawer.backAgent, contractMd)
    : openDrawerContent(drawer.id);
  if (!content) return null;

  function onBodyClick(e) {
    const back = e.target.closest('#sk-back'); if (back) { setDrawer({ mode: 'agent', id: drawer.backAgent }); return; }
    const sm = e.target.closest('[data-skillmd]'); if (sm) { setDrawer({ mode: 'skill', skill: sm.dataset.skillmd, backAgent: drawer.id }); return; }
    const cm = e.target.closest('[data-contractmd]'); if (cm) { setDrawer({ mode: 'contract', contract: cm.dataset.contractmd, backAgent: drawer.id }); return; }
    const skm = e.target.closest('[data-skill-modify]'); if (skm) { copyPrompt(typeof skillModifyPrompt !== 'undefined' ? skillModifyPrompt(skm.dataset.skillModify) : ("Open Host Modern's skill " + skm.dataset.skillModify + " (Scheduled/" + skm.dataset.skillModify + "/SKILL.md) and help me modify it. What I want to change: ")); return; }
    if (e.target.closest('#ag-chat')) { const a = agById(drawer.id); if (a) copyPrompt(agentPrompt(a)); return; }
    const cl = e.target.closest('[data-chat-log]'); if (cl) { const a = agById(drawer.id); const ev = agentActivity(a, 8)[+cl.dataset.chatLog]; if (ev) copyPrompt(logPrompt(ev, a)); return; }
  }

  return html`
    <div class="fixed inset-0 z-30">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick=${onClose}></div>
      <aside class="absolute right-0 top-0 h-full w-full sm:max-w-[540px] bg-panel border-l border-edge overflow-y-auto slidein">
        <div class="sticky top-0 flex items-center justify-between px-5 h-14 border-b border-edge bg-panel/95 backdrop-blur z-10">
          <span class="font-mono text-white font-semibold" dangerouslySetInnerHTML=${{ __html: content.titleHTML }}></span>
          <button class="text-slate-400 hover:text-white text-lg leading-none" onClick=${onClose}>✕</button>
        </div>
        <div class="p-5" onClick=${onBodyClick} dangerouslySetInnerHTML=${{ __html: content.bodyHTML }}></div>
      </aside>
    </div>`;
}

export function Agents(props) {
  const s = useStore();
  const [drawer, setDrawer] = useState(null);
  const inner = buildAgentsHTML();

  function onWrapClick(e) {
    const build = e.target.closest('[data-build]');
    if (build) { e.stopPropagation(); copyPrompt(buildPromptFor(build.dataset.build)); return; }
    const node = e.target.closest('[data-agent]');
    if (node && node.dataset.agent) setDrawer({ mode: 'agent', id: node.dataset.agent });
  }

  return html`
    <div>
      <div onClick=${onWrapClick} dangerouslySetInnerHTML=${{ __html: inner }}></div>
      <${Drawer} drawer=${drawer} setDrawer=${setDrawer} onClose=${() => setDrawer(null)}/>
    </div>`;
}
