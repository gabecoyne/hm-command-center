// Schedule view — scheduled-task agent tiles + full table.
// Ported from the monolith's renderSchedule/renderScheduleCards + helpers.
import { html } from '../html.js';
import { useState } from 'preact/hooks';
import { useStore } from '../state.js';
import { esc, schWhen } from '../lib/format.js';
import { EMB, TONE } from '../lib/avatars.js';
import { copyPrompt } from '../components/Toasts.js';
import { CHAT_SVG } from '../components/AskButton.js';

// ---------- helpers ported verbatim from the monolith ----------
function schDot(s){s=(s||'').toLowerCase();const c=(s.includes('ok')||s.includes('success')||s.includes('done'))?'bg-accent':((s.includes('err')||s.includes('fail'))?'bg-rose-500':(s.includes('partial')?'bg-amber-400':'bg-slate-600'));return '<span class="h-2 w-2 rounded-full '+c+'" title="'+esc(s||'no run logged')+'"></span>';}
function schVia(t){const b=t.browser?'<span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300">browser</span>':'';const v=t.run_via==='own_schedule'?'<span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-300">self</span>':'<span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-400">dispatcher</span>';return v+' '+b;}
function schTaskPrompt(t){return "Open Host Modern's scheduled task \""+t.task_id+"\" and help me change its schedule or config.\n\nCadence: "+(t.schedule_human||t.cron)+" (cron "+t.cron+"), machine "+t.machine+", via "+t.run_via+(t.browser?" (browser)":"")+", enabled="+t.enabled+".\nCanonical file: "+(t.canonical_drive_path||("Scheduled/"+t.task_id+"/SKILL.md"))+".\n\nEdit Scheduled/_inventory.json + the SKILL.md, follow CLAUDE.md scheduling rules (machine-scheduled on the owning machine, never cloud triggers), then re-run CommandCenter/build_schedule_snapshot.py so this view refreshes.\n\nWhat I want to change: ";}
/* ---------- Schedule: agent tiles ---------- */
const SCHED_SKILL_LABEL={
 "hm-media-buyer":"Paid media optimize","hm-partner-commission":"Melissa commission",
 "hm-comment-marketing":"Comment marketing","hm-comment-manager":"Inbox engagement",
 "hm-cro-test-review":"A/B test review","hm-cro-weekly-digest":"CRO weekly digest",
 "hm-r-seo-audit":"SEO health audit","hm-r-pdp-seo":"PDP SEO audit","refresh-seo-ecomm-tracker":"Perf tracker refresh","hm-r-lp-monday-briefing":"LP Monday briefing",
 "hm-r-aeo-optimize":"AEO loop","klaviyo-suppression-check":"Klaviyo suppression",
 "hm-marketing-analysis":"Marketing analysis","hm-competitive-analysis":"Competitive intel","hm-competitor-watch":"Competitor watch","hm-lifecycle-collector":"Email/SMS % collector","hm-lifecycle-analyst":"Email/SMS % analyst",
 "hm-shipbob-collector":"ShipBob collector","hm-triplewhale-collector":"Triple Whale collector","hm-model-collector":"Model collector","hm-shopify-collector":"Shopify collector","hm-ga4-collector":"GA4 collector","hm-gorgias-collector":"Gorgias collector","hm-competitive-collector":"Competitive collector",
 "hm-review-mining":"Review mining","hm-creator-discovery":"Creator discovery","hm-trybe-manager":"Trybe creator round-trip",
 "daily-finance":"Daily cash snapshot","hm-fin-weekly-actuals":"Weekly actuals vs model","hm-fin-monthly-close":"Monthly close","hm-cbp-statement-check":"CBP statement watch",
 "hm-gorgias-responder":"Gorgias responder","hm-cs-approval-grader":"CS readiness grader","hm-cs-learning-loop":"CS learning loop",
 "hm-inventory-monitor":"Inventory coverage","hm-inbound-tracker":"Inbound pipeline","hm-stuck-shipments":"Stuck shipments",
 "hm-partner-agenda-monday":"Mon partner agenda","hm-partner-agenda-thursday":"Thu partner agenda","hm-task-monitor":"Task watchdog"
};
/* Curated exec grouping: each tile = one agent/persona. `agents` matches the snapshot's task.agent (from ecomm_state roster); `tasks` pins orphan task_ids that have no roster agent yet. New/unknown tasks fall into the dashed "Unassigned" tile so nothing disappears silently. */
const SCHED_GROUPS=[
 {key:"paid",title:"Media Buyer",god:"Nike",emb:"nike",tone:"clay",agent:"paid-media",agents:["paid-media"],tasks:["hm-partner-commission"],blurb:"Paid acquisition across Meta + Google — budgets, bids, pausing losers, holding the daily spend floor."},
 {key:"social",title:"Community Manager",god:"Apollo",emb:"apollo",tone:"clay",agent:"organic-social",agents:["organic-social"],tasks:[],blurb:"Organic comment marketing and inbox engagement across IG, TikTok, YouTube & Facebook."},
 {key:"cro",title:"CRO / Experimentation",god:"Metis",emb:"metis",tone:"clay",agent:"cro",agents:["cro"],tasks:[],blurb:"On-site A/B tests (PDP, cart, checkout) with a weekly results digest."},
 {key:"seo",title:"SEO Specialist",god:"Prometheus",emb:"prometheus",tone:"char",agent:"seo",agents:["seo"],tasks:["hm-r-lp-monday-briefing"],blurb:"Technical + on-page SEO audits, PDP optimization, and the weekly performance tracker."},
 {key:"aeo",title:"Answer-Engine (AEO)",god:"Hera",emb:"hera",tone:"olive",agent:"aeo",agents:["aeo"],tasks:[],blurb:"Structures content + schema for AI answer surfaces — ChatGPT, Perplexity, Google AIO, Claude."},
 {key:"lifecycle",title:"Lifecycle Marketer",god:"Iris",emb:"iris",tone:"clay",agent:"lifecycle-email",agents:["lifecycle-email"],tasks:[],blurb:"Klaviyo list hygiene and deliverability — suppression checks before tier thresholds."},
 {key:"collectors",title:"BI Collectors",god:"Argus",emb:"argus",tone:"ink",agents:[],tasks:["hm-shipbob-collector","hm-triplewhale-collector","hm-model-collector","hm-shopify-collector","hm-ga4-collector","hm-gorgias-collector","hm-competitive-collector","hm-lifecycle-collector","hm-cash-collector"],blurb:"Dumb, no-AI collectors — each fetches one source into the shared data pool (data/facts/*) every analyst reads. Collection centralized, interpretation distributed."},
 {key:"analytics",title:"Marketing Analyst & Intel",god:"Argus",emb:"argus",tone:"char",agents:[],tasks:["hm-marketing-analysis","hm-competitive-analysis","hm-competitor-watch","hm-lifecycle-analyst"],blurb:"Marketing performance vs forecast, competitive intel, competitor/market watch, and the Email/SMS % of revenue read."},
 {key:"brand",title:"Creator & Brand",god:"Ganymede",emb:"ganymede",tone:"ink",agents:["trybe-manager"],tasks:["hm-review-mining","hm-creator-discovery"],blurb:"UGC creator program, creator discovery, and product review mining."},
 {key:"finance",title:"Finance",god:"Athena",emb:"athena",tone:"blue",agent:"athena-finance",agents:["athena-finance"],tasks:[],blurb:"Daily cash, weekly actuals vs model, monthly close, and CBP duty tracking."},
 {key:"cs",title:"Customer Service",god:"Hestia",emb:"hestia",tone:"olive",agent:"hestia-cs",agents:["hestia-cs"],tasks:[],blurb:"Gorgias reply drafting, send-readiness grading, and the CS learning loop."},
 {key:"inventory",title:"Inventory & Ops",god:"Demeter",emb:"demeter",tone:"olive",agent:"demeter-inventory",agents:["demeter-inventory"],tasks:[],blurb:"Demand/coverage watch, inbound container pipeline, and stuck-shipment detection."},
 {key:"ceo",title:"CEO Office & Systems",god:"Hermes",emb:"hermes",tone:"clay",agents:[],tasks:["hm-ea-ganymede","hm-partner-agenda-monday","hm-partner-agenda-thursday","hm-task-monitor"],blurb:"Ganymede's daily EA router (shadow), the Monday/Thursday partner agendas, and the nightly task-monitor watchdog."}
];
function schGroupAvatar(g,px){const s=px||28;const t=TONE[g.tone]||TONE.clay;const emb=EMB[g.emb];if(emb){return '<span class="inline-block shrink-0 align-middle" style="width:'+s+'px;height:'+s+'px"><svg viewBox="0 0 40 40" width="100%" height="100%" role="img" aria-label="'+esc(g.god||g.title)+'"><circle cx="20" cy="20" r="19" fill="'+t[0]+'"/><g transform="translate(8,8)" stroke="'+t[1]+'" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round">'+emb+'</g></svg></span>';}return '<span class="inline-grid place-items-center rounded-full shrink-0 align-middle" style="width:'+s+'px;height:'+s+'px;background:'+t[0]+';color:'+t[1]+';font:600 13px ui-monospace,monospace">'+esc((g.title||"?").slice(0,1))+'</span>';}
function schGroupFor(t){for(const g of SCHED_GROUPS){if(g.agents&&g.agents.length&&t.agent&&g.agents.includes(t.agent))return g;if(g.tasks&&g.tasks.includes(t.task_id))return g;}return null;}
function schGroupPrompt(g,members){return "Let’s review Host Modern’s \""+g.title+"\" agent"+(g.god?" ("+g.god+")":"")+" and its scheduled work.\n\nIt runs: "+members.map(m=>m.task_id+" — "+(m.schedule_human||m.cron)).join("; ")+".\n\nRead the relevant SKILL.md files under Scheduled/, recent runs in Logs/ and Wiki/data/event_log.json, and tell me how it’s performing and whether the cadence or scope should change. What I want to look at: ";}

const GC = "grid grid-cols-[16px_1.7fr_1fr_0.9fr_1.2fr_1.1fr_auto] gap-3";

// Summary tile.
const Tile = (l, v, s) => html`
  <div class="rounded-xl border border-edge bg-panel glow p-3.5">
    <div class="text-[11px] uppercase tracking-widest text-slate-400">${l}</div>
    <div class="mt-1 text-2xl font-semibold font-mono text-white">${v}</div>
    ${s ? html`<div class="text-[11px] text-slate-400 mt-0.5">${s}</div>` : null}
  </div>`;

// One agent card (renderScheduleCards, per group).
function GroupCard({ g, members, agents }) {
  const roster = (g.agent && (agents || []).find(a => a.id === g.agent)) || null;
  const nexts = members.filter(m => m.enabled && m.next_run).map(m => m.next_run).sort();
  const nextRun = nexts[0] || null;
  const runs7 = members.reduce((n, m) => n + (m.runs_next_7d || 0), 0);
  const machs = [...new Set(members.map(m => m.machine).filter(Boolean))];
  const offN = members.filter(m => !m.enabled).length;
  return html`
    <article class="relative rounded-xl border border-edge bg-panel glow p-4 flex flex-col">
      <button title="Chat about this agent" class="absolute top-2.5 right-2.5 z-[2] h-6 w-6 grid place-items-center rounded-md text-slate-400 hover:text-white hover:bg-white/10 opacity-70 hover:opacity-100 transition" onClick=${e => { e.stopPropagation(); copyPrompt(schGroupPrompt(g, members)); }}>${CHAT_SVG}</button>
      <div class="flex items-start gap-2.5 mb-2 pr-6">
        <span class=${roster ? 'cursor-pointer' : ''} dangerouslySetInnerHTML=${{ __html: schGroupAvatar(g) }}></span>
        <div class="min-w-0">
          <div class="text-[15px] font-semibold text-white leading-tight truncate ${roster ? 'cursor-pointer hover:text-accent' : ''}">${g.title}</div>
          <div class="text-[11px] text-slate-400">${g.god ? g.god + ' · ' : ''}${members.length} task${members.length === 1 ? '' : 's'}${offN ? ' · ' + offN + ' off' : ''}</div>
        </div>
      </div>
      <p class="text-[12px] text-slate-400 leading-snug mb-3">${g.blurb}</p>
      <div class="space-y-0 mb-3 border-t border-edge/50 pt-2">
        ${members.map(m => html`
          <button key=${m.task_id} title=${'Modify ' + m.task_id} class="w-full flex items-center gap-2 text-[12px] py-0.5 px-1 -mx-1 rounded hover:bg-panel2/40 text-left ${m.enabled ? '' : 'opacity-55'}" onClick=${e => { e.stopPropagation(); copyPrompt(schTaskPrompt(m)); }}>
            <span dangerouslySetInnerHTML=${{ __html: schDot(m.last_status) }}></span>
            <span class="text-slate-200 truncate">${SCHED_SKILL_LABEL[m.task_id] || m.task_id}</span>
            ${m.browser ? html`<span class="text-[9px] font-mono px-1 rounded bg-indigo-500/15 text-indigo-300 shrink-0">br</span>` : null}
            ${m.enabled ? null : html`<span class="text-[9px] font-mono px-1 rounded bg-rose-500/15 text-rose-300 shrink-0">off</span>`}
            <span class="ml-auto text-[11px] text-slate-400 shrink-0 truncate max-w-[54%] text-right">${m.schedule_human || m.cron || ''}</span>
          </button>`)}
      </div>
      <div class="mt-auto flex items-center gap-2 text-[11px] text-slate-500 border-t border-edge/50 pt-2">
        <span class="font-mono truncate">${machs.join(', ') || '—'}</span>
        <span class="ml-auto shrink-0">${runs7} run${runs7 === 1 ? '' : 's'}/7d${nextRun ? ' · next ' + schWhen(nextRun) : ''}</span>
      </div>
    </article>`;
}

// Agent tiles + orphan "Unassigned" tile.
function ScheduleCards({ tasks, agents }) {
  const used = new Set();
  const cards = SCHED_GROUPS.map(g => {
    const members = tasks.filter(t => schGroupFor(t) === g);
    members.forEach(m => used.add(m.task_id));
    if (!members.length) return null;
    return html`<${GroupCard} key=${g.key} g=${g} members=${members} agents=${agents}/>`;
  });
  const orphan = tasks.filter(t => !used.has(t.task_id));
  const orphanCard = orphan.length ? html`
    <article class="rounded-xl border border-dashed border-edge bg-panel/60 p-4">
      <div class="text-[14px] font-semibold text-white mb-1">Unassigned</div>
      <p class="text-[11px] text-slate-400 mb-2">Not grouped under an agent tile yet — add to SCHED_GROUPS.</p>
      <div class="space-y-0.5">
        ${orphan.map(m => html`
          <div key=${m.task_id} class="flex items-center gap-2 text-[12px]">
            <span dangerouslySetInnerHTML=${{ __html: schDot(m.last_status) }}></span>
            <span class="font-mono text-slate-300 truncate">${m.task_id}</span>
            <span class="ml-auto text-[11px] text-slate-500 shrink-0">${m.schedule_human || m.cron || ''}</span>
          </div>`)}
      </div>
    </article>` : null;
  return html`${cards}${orphanCard}`;
}

export function Schedule() {
  const s = useStore();
  const [filter, setFilter] = useState('');
  const S = s.sched;

  if (!S || !S.tasks) {
    return html`
      <div>
        <div class="rounded-xl border border-edge bg-panel p-10 text-center text-slate-400">No schedule snapshot yet — run <code class="text-slate-300">python3 CommandCenter/build_schedule_snapshot.py</code>.</div>
      </div>`;
  }

  const tasks = S.tasks || [], ms = S.machine_status || {}, disp = S.dispatcher || {};
  const enabled = tasks.filter(t => t.enabled).length, browser = tasks.filter(t => t.browser).length, off = tasks.length - enabled;

  const f = filter.toLowerCase();
  const rows = tasks.filter(t => !f || (`${t.task_id} ${t.description || ''} ${t.agent || ''} ${t.machine || ''} ${t.schedule_human || ''}`.toLowerCase().includes(f)));

  return html`
    <div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        ${Tile("Scheduled tasks", tasks.length, off ? off + " disabled" : "all enabled")}
        ${Tile("Enabled", enabled)}
        ${Tile("Browser · self-run", browser, "run on their own")}
        ${Tile("Dispatcher", disp.cron || "—", "max " + (disp.max_concurrency ?? "—") + " concurrent")}
      </div>
      <div class="grid sm:grid-cols-3 gap-3 mb-6">
        ${Object.keys(ms).map(m => {
          const x = ms[m] || {};
          return html`
            <div key=${m} class="rounded-xl border border-edge bg-panel p-3.5">
              <div class="flex items-center gap-2"><span class="font-mono text-sm text-white">${m}</span><span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-400 ml-auto">${x.tasks || 0} dispatcher</span></div>
              <div class="text-[11px] text-slate-400 mt-1">last dispatch · ${x.last_dispatch ? schWhen(x.last_dispatch) : "—"}</div>
            </div>`;
        })}
      </div>
      <div class="flex items-baseline gap-2 mb-3"><h3 class="text-sm font-semibold text-white">Agents on schedule</h3><span class="text-[11px] text-slate-400 font-mono">${S.updated ? "snapshot " + schWhen(S.updated) : ""}</span></div>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 mb-7">
        <${ScheduleCards} tasks=${tasks} agents=${s.roster.agents}/>
      </div>
      <details class="group">
        <summary class="flex items-center gap-2 mb-1 cursor-pointer list-none select-none">
          <span class="text-slate-500 group-open:rotate-90 transition-transform inline-block leading-none">▸</span>
          <h3 class="text-sm font-semibold text-white">All scheduled tasks</h3>
          <span class="text-[11px] font-normal text-slate-500">— expand for the full list</span>
        </summary>
        <div class="flex items-center justify-end gap-3 mt-3 mb-3"><input value=${filter} onInput=${e => setFilter(e.target.value)} class="bg-ink border border-edge rounded-lg px-3 py-1.5 text-sm w-[260px]" placeholder="Filter by task, agent, or machine…"/></div>
        <div>
          <div class="rounded-xl border border-edge bg-panel glow overflow-hidden">
            <div class="${GC} px-4 py-2 text-[10px] uppercase tracking-widest text-slate-400"><span></span><span>Task</span><span>Agent</span><span>Machine</span><span>Cadence</span><span>Next run</span><span>Via</span></div>
            ${rows.length ? rows.map(t => html`
              <div key=${t.task_id} class="${GC} items-center px-4 py-2.5 border-t border-edge/50 hover:bg-panel2/40 ${t.enabled ? '' : 'opacity-55'}">
                <span dangerouslySetInnerHTML=${{ __html: schDot(t.last_status) }}></span>
                <div class="min-w-0">
                  <div class="flex items-center gap-2"><code class="font-mono text-[12px] text-white truncate">${t.task_id}</code>${t.enabled ? null : html`<span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 shrink-0">OFF</span>`}</div>
                  <div class="text-[11px] text-slate-400 truncate">${t.description || ''}</div>
                </div>
                <div class="text-[11px] text-slate-300 truncate">${t.agent ? t.agent : html`<span class="text-slate-500">—</span>`}</div>
                <div class="text-[11px] font-mono text-slate-400">${t.machine || '—'}</div>
                <div class="text-[11px] text-slate-300 truncate" title=${t.cron || ''}>${t.schedule_human || t.cron || '—'}</div>
                <div class="text-[11px] text-slate-300">${schWhen(t.next_run)}<span class="text-slate-500"> · ${t.runs_next_7d || 0}/7d</span></div>
                <div class="flex items-center gap-1.5 shrink-0"><span dangerouslySetInnerHTML=${{ __html: schVia(t) }}></span><button title="Copy a prompt to modify this task" class="text-slate-400 hover:text-white text-xs px-1" onClick=${() => copyPrompt(schTaskPrompt(t))}>⧉</button></div>
              </div>`) : html`<div class="px-4 py-8 text-center text-slate-400 text-sm border-t border-edge/50">No tasks match “${f}”.</div>`}
          </div>
          <p class="text-[11px] text-slate-400 mt-2">${rows.length} of ${tasks.length} tasks · source: Scheduled/_inventory.json → build_schedule_snapshot.py</p>
        </div>
      </details>
    </div>`;
}
