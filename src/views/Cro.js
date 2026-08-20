// CRO view — the A/B test register + landing-page performance.
//
// Reads data/cro_snapshot.json, written several times a day by
// Scripts/build_cro_snapshot.py (GA4 + GSC + Clarity + data/cro_tests.json).
// The register itself stays authoritative in cro_tests.json; this view never
// writes back — significance is surfaced as a badge, not filed as an Attention
// item (Collin, 2026-08-14: dashboard badge only, no new queue noise).
import { html } from '../html.js';
import { useState } from 'preact/hooks';
import { useStore } from '../state.js';
import { usd } from '../lib/format.js';
import { mkAsk } from '../lib/prompts.js';
import { AskButton } from '../components/AskButton.js';
import { Section, Disclosure } from '../components/Section.js';

// ── formatting ───────────────────────────────────────────────────────────────
const pct = (n, d = 2) => (n == null || isNaN(+n)) ? '—' : (+n * 100).toFixed(d) + '%';
const sgn = (n, d = 1) => (n == null || isNaN(+n)) ? '—' : ((+n > 0 ? '+' : '') + (+n * 100).toFixed(d) + '%');
const money = n => (n == null || isNaN(+n)) ? '—' : '$' + (+n).toFixed(2);
const num = n => (n == null || isNaN(+n)) ? '—' : Math.round(+n).toLocaleString();
const p_ = n => (n == null || isNaN(+n)) ? '—' : (+n).toFixed(3);

const STATE = {
  significant: ['Significant', 'bg-emerald-500/15 text-emerald-300 border-emerald-400/25'],
  collecting: ['Collecting', 'bg-sky-500/15 text-sky-300 border-sky-400/25'],
  awaiting: ['No data yet', 'bg-amber-500/15 text-amber-300 border-amber-400/25'],
  concluded: ['Concluded', 'bg-white/5 text-slate-400 border-edge'],
};

function Pill({ state }) {
  const [label, cls] = STATE[state] || STATE.collecting;
  return html`<span class="text-[11px] px-2 py-0.5 rounded-full border ${cls}">${label}</span>`;
}

function Stat({ label, value, sub, tone }) {
  return html`
    <div class="rounded-xl border border-edge bg-panel p-4">
      <div class="text-[10px] uppercase tracking-widest text-slate-500">${label}</div>
      <div class="mt-1 text-2xl font-semibold ${tone || 'text-white'}">${value}</div>
      ${sub ? html`<div class="mt-0.5 text-[12px] text-slate-400">${sub}</div>` : null}
    </div>`;
}

// ── Stage 1: the ad-side read ────────────────────────────────────────────────
// Some tests are decided on delivery efficiency before they are decided on
// revenue. The quadrant framing test is the first: four ad sets at $50/day each
// buy roughly three purchases per arm — nowhere near enough to call a conversion
// rate — but tens of thousands of impressions, which IS enough to call
// add-to-carts per link click. So Stage 1 ranks on ATC/click and only the two
// survivors get a revenue read.
//
// Every rate here divides by LINK clicks, never clicks-all. Comparing clicks-all
// against link-driven sessions is what produced the "96% of clicks missing from
// GA4" false alarm on 2026-08-19.
function GateChip({ ok, label }) {
  return html`
    <span class="text-[10px] px-1.5 py-0.5 rounded border ${ok
      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/25'
      : 'bg-white/5 text-slate-500 border-edge'}">${ok ? '✓' : '○'} ${label}</span>`;
}

function Stage1Panel({ t }) {
  const arms = t.arms || [];
  const rg = t.read_gates || {};
  const base = (t.baselines || {}).atc_per_click;
  const s1 = t.stage1_read || {};
  const d = t.design || {};
  const ro = t.readout || {};
  const [showCreative, setShowCreative] = useState(false);
  const anyCreative = arms.some(a => (a.creatives || []).length);

  // Rank order comes from the feeder so the dashboard and the register can never
  // disagree about who is winning.
  const order = (s1.ranking || []).map(r => r.arm);
  const rows = order.length
    ? order.map(k => arms.find(a => a.arm === k)).filter(Boolean)
        .concat(arms.filter(a => !order.includes(a.arm)))
    : arms;

  const need = a => {
    if (a.disqualified) return ['below baseline — out', 'text-rose-300'];
    if (a.gates_clear) return ['gates open', 'text-emerald-300'];
    if (!a.impressions) return ['no delivery', 'text-slate-500'];
    const miss = [];
    if (a.gate_impressions === false) miss.push(`${num(rg.min_impressions - a.impressions)} impr`);
    if (a.gate_link_clicks === false) miss.push(`${num(rg.min_link_clicks - a.link_clicks)} clicks`);
    if (a.gate_frequency === false) miss.push('freq');
    return ['needs ' + (miss.join(' · ') || 'more data'), 'text-slate-500'];
  };

  return html`
    <div class="rounded-lg border border-sky-400/20 bg-sky-400/[0.04] p-3 space-y-3">
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div class="text-[10px] uppercase tracking-widest text-sky-300">Stage 1 · ad-side read</div>
          <div class="text-[12.5px] text-slate-300 mt-0.5">
            Ranked on add-to-carts per link click${base ? `, against the ${(base * 100).toFixed(1)}% account baseline` : ''}.
            CTR and CPC are context, never the verdict.
          </div>
        </div>
        ${d.budget_per_adset_per_day ? html`
          <div class="text-right text-[11px] font-mono text-slate-400 shrink-0">
            ${money(d.budget_per_adset_per_day)}/day × ${d.arms} ad sets${d.cbo === false ? ' · no CBO' : ''}<br/>
            ${d.creatives_per_adset} creatives each${ro.spend_to_date ? ` · ${money(ro.spend_to_date)} spent` : ''}
          </div>` : null}
      </div>

      ${t.status === 'planned' && (t.launch_gates || []).length ? html`
        <div class="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2.5 space-y-1.5">
          <div class="text-[10px] uppercase tracking-widest text-amber-300">Not launched — these clear first</div>
          ${t.launch_gates.map(g => html`
            <div class="text-[12px] text-amber-100/90">
              <span class="font-mono text-amber-300/80 mr-1.5">${g.id}</span>${g.gate}
              <div class="text-[11.5px] text-amber-200/50 ml-6">${g.why}</div>
            </div>`)}
        </div>` : null}

      <div class="overflow-x-auto">
        <table class="w-full text-[13px]">
          <thead>
            <tr class="text-[10px] uppercase tracking-widest text-slate-500 border-b border-edge">
              <th class="text-left py-2 font-normal">Arm</th>
              <th class="text-right py-2 font-normal">Spend</th>
              <th class="text-right py-2 font-normal">Impr</th>
              <th class="text-right py-2 font-normal">Link clicks</th>
              <th class="text-right py-2 font-normal">CTR</th>
              <th class="text-right py-2 font-normal">ATC / click</th>
              <th class="text-right py-2 font-normal">$ / ATC</th>
              <th class="text-right py-2 font-normal">Freq</th>
              <th class="text-right py-2 font-normal">Gate</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((a, i) => {
              const [gLabel, gCls] = need(a);
              const beats = base != null && a.atc_per_click != null && a.atc_per_click >= base;
              const lead = i === 0 && a.gates_clear && !a.disqualified;
              return html`
                <tr class="border-b border-edge/50 ${lead ? 'bg-white/[0.03]' : ''} ${a.disqualified ? 'opacity-60' : ''}">
                  <td class="py-2">
                    <span class="font-mono text-white">${a.arm}</span>
                    ${a.quadrant ? html`<span class="ml-2 text-[11px] text-slate-400">${a.quadrant}</span>` : null}
                    ${lead ? html`<span class="ml-2 text-[10px] text-emerald-300">leader</span>` : null}
                    ${a.path ? html`<div class="text-[11px] font-mono text-slate-600">${a.path}</div>` : null}
                  </td>
                  <td class="text-right py-2 font-mono text-slate-300">${money(a.spend)}</td>
                  <td class="text-right py-2 font-mono text-slate-300">${num(a.impressions)}</td>
                  <td class="text-right py-2 font-mono text-slate-300">${num(a.link_clicks)}</td>
                  <td class="text-right py-2 font-mono text-slate-400">${pct(a.ctr_link)}</td>
                  <td class="text-right py-2 font-mono ${a.atc_per_click == null ? 'text-slate-500' : (beats ? 'text-emerald-300' : 'text-rose-300')}">${pct(a.atc_per_click, 1)}</td>
                  <td class="text-right py-2 font-mono text-slate-300">${money(a.cost_per_atc)}</td>
                  <td class="text-right py-2 font-mono text-slate-400">${a.frequency == null ? '—' : (+a.frequency).toFixed(2)}</td>
                  <td class="text-right py-2 text-[11px] ${gCls}">${gLabel}</td>
                </tr>`;
            })}
          </tbody>
        </table>
      </div>

      ${anyCreative ? html`
        <div>
          <button class="text-[11px] text-slate-400 hover:text-white" onClick=${() => setShowCreative(!showCreative)}>
            ${showCreative ? '▾' : '▸'} By creative format
          </button>
          ${showCreative ? html`
            <div class="mt-2 overflow-x-auto">
              <table class="w-full text-[12.5px]">
                <thead>
                  <tr class="text-[10px] uppercase tracking-widest text-slate-500 border-b border-edge">
                    <th class="text-left py-1.5 font-normal">Arm · format</th>
                    <th class="text-right py-1.5 font-normal">Spend</th>
                    <th class="text-right py-1.5 font-normal">Clicks</th>
                    <th class="text-right py-1.5 font-normal">CTR</th>
                    <th class="text-right py-1.5 font-normal">ATC / click</th>
                    <th class="text-right py-1.5 font-normal">$ / ATC</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows.flatMap(a => (a.creatives || []).map(c => html`
                    <tr class="border-b border-edge/40">
                      <td class="py-1.5"><span class="font-mono text-slate-300">${a.arm}</span>
                        <span class="ml-2 text-slate-400">${c.format}</span></td>
                      <td class="text-right py-1.5 font-mono text-slate-400">${money(c.spend)}</td>
                      <td class="text-right py-1.5 font-mono text-slate-400">${num(c.link_clicks)}</td>
                      <td class="text-right py-1.5 font-mono text-slate-400">${pct(c.ctr_link)}</td>
                      <td class="text-right py-1.5 font-mono text-slate-300">${pct(c.atc_per_click, 1)}</td>
                      <td class="text-right py-1.5 font-mono text-slate-400">${money(c.cost_per_atc)}</td>
                    </tr>`))}
                </tbody>
              </table>
              <div class="mt-1 text-[11px] text-slate-500">
                Budget sits on the ad set, so Meta allocates between the two creatives inside an arm.
                A weak format here is a creative problem, not a verdict on the framing.
              </div>
            </div>` : null}
        </div>` : null}

      <div class="flex flex-wrap gap-1.5">
        <${GateChip} ok=${!!ro.stage1_callable} label="Stage 1 callable"/>
        ${/* A green tick on a check that hasn't run yet is worse than no chip —
             with zero link clicks "capture ≥70%" is vacuously true. */''}
        ${arms.some(a => a.link_clicks)
          ? html`<${GateChip} ok=${ro.ga4_capture_ok !== false} label="GA4 capture ≥70%"/>`
          : html`<span class="text-[10px] px-1.5 py-0.5 rounded border border-edge text-slate-500">GA4 capture — nothing to check yet</span>`}
        ${ro.review_on ? html`<span class="text-[10px] px-1.5 py-0.5 rounded border border-edge text-slate-400">
          first review ${ro.review_on}${ro.days_live != null ? ` · day ${ro.days_live}` : ''}</span>` : null}
        ${(s1.carry_forward || []).length ? html`<span class="text-[10px] px-1.5 py-0.5 rounded border border-emerald-400/25 bg-emerald-500/10 text-emerald-300">
          carry forward: ${s1.carry_forward.join(' + ')}</span>` : null}
      </div>

      ${(t.decision_rule || {}).stage_1 ? html`
        <div class="text-[12px] text-slate-400 border-l-2 border-sky-400/30 pl-3">${t.decision_rule.stage_1}</div>` : null}
    </div>`;
}

// ── one running test ─────────────────────────────────────────────────────────
function TestCard({ t }) {
  const [open, setOpen] = useState(t.state === 'significant');
  const arms = t.arms || [];
  const control = arms[0];

  const ask = mkAsk(
    'CRO test ' + t.id,
    `${t.name}. Status ${t.status}, ${t.days_running == null ? 'start date unknown' : t.days_running + ' days running'}. ` +
    `Read: ${t.headline}. Hypothesis: ${t.hypothesis || 'n/a'}. Surface: ${t.surface || 'n/a'}. ` +
    `Arms: ${arms.map(a => `${a.arm} n=${a.sessions} cvr=${a.cvr} rpv=${a.rpv}`).join(' | ')}.` +
    // A Stage-1 test asked about on its RPV numbers alone invites the wrong
    // answer — those arms are ranked on ad-side efficiency, not revenue.
    (t.stage === 1
      ? ` STAGE 1 — decided on add-to-carts per link click, not CVR/RPV. Baseline ` +
        `${(t.baselines || {}).atc_per_click}. Ad side: ${arms.map(a =>
          `${a.arm} spend=${a.spend} impr=${a.impressions} clicks=${a.link_clicks} ` +
          `atc/click=${a.atc_per_click} $/atc=${a.cost_per_atc} gates=${a.gates_clear}` +
          (a.disqualified ? ' DISQUALIFIED' : '')).join(' | ')}. ` +
        `Carry forward: ${((t.stage1_read || {}).carry_forward || []).join(', ') || 'none yet'}. ` +
        `Rule: ${(t.decision_rule || {}).stage_1 || ''}`
      : '')
  );

  return html`
    <div class="relative rounded-xl border border-edge bg-panel">
      <${AskButton} prompt=${ask}/>
      <button onClick=${() => setOpen(!open)} class="w-full text-left p-4 pr-10">
        <div class="flex items-start gap-3 flex-wrap">
          <${Pill} state=${t.state}/>
          <div class="min-w-0 flex-1">
            <div class="text-white text-[15px] font-medium">${t.name || t.id}</div>
            <div class="mt-0.5 text-[12px] text-slate-400 truncate">${t.surface || '—'}</div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-[13px] ${t.state === 'significant' ? 'text-emerald-300' : 'text-slate-300'}">${t.headline}</div>
            <div class="text-[11px] font-mono text-slate-500">
              ${t.days_running == null ? 'not started' : t.days_running + 'd'}
              ${t.start_date ? ' · from ' + t.start_date : ''}
            </div>
          </div>
          <span class="text-slate-500 text-xs">${open ? '▾' : '▸'}</span>
        </div>
      </button>

      ${open ? html`
        <div class="border-t border-edge p-4 space-y-3">
          ${t.hypothesis ? html`
            <div class="text-[13px] text-slate-300">
              <span class="text-[10px] uppercase tracking-widest text-slate-500 mr-2">Hypothesis</span>${t.hypothesis}
            </div>` : null}

          ${t.stage === 1 ? html`<${Stage1Panel} t=${t}/>` : null}

          ${t.stage === 1 ? html`
            <div class="text-[10px] uppercase tracking-widest text-slate-500 pt-1">
              Stage 2 · revenue read — not the decision metric yet
            </div>` : null}

          ${(arms.length && (t.stage !== 1 || arms.some(a => a.sessions))) ? html`
            <div class="overflow-x-auto">
              <table class="w-full text-[13px]">
                <thead>
                  <tr class="text-[10px] uppercase tracking-widest text-slate-500 border-b border-edge">
                    <th class="text-left py-2 font-normal">Arm</th>
                    <th class="text-right py-2 font-normal">Sessions</th>
                    <th class="text-right py-2 font-normal">Orders</th>
                    <th class="text-right py-2 font-normal">CVR</th>
                    <th class="text-right py-2 font-normal">RPV</th>
                    <th class="text-right py-2 font-normal">AOV</th>
                    <th class="text-right py-2 font-normal">RPV lift</th>
                    <th class="text-right py-2 font-normal">p (RPV)</th>
                  </tr>
                </thead>
                <tbody>
                  ${arms.map(a => {
                    const lead = a.arm === t.leader;
                    const lift = a.rpv_lift;
                    return html`
                      <tr class="border-b border-edge/50 ${lead ? 'bg-white/[0.03]' : ''}">
                        <td class="py-2">
                          <span class="font-mono text-white">${a.arm}</span>
                          ${lead ? html`<span class="ml-2 text-[10px] text-emerald-300">leader</span>` : null}
                          <div class="text-[11px] text-slate-500">${a.label || ''}</div>
                        </td>
                        <td class="text-right py-2 font-mono text-slate-300">${num(a.sessions)}</td>
                        <td class="text-right py-2 font-mono text-slate-300">${num(a.purchases)}</td>
                        <td class="text-right py-2 font-mono text-slate-300">${pct(a.cvr)}</td>
                        <td class="text-right py-2 font-mono text-white">${money(a.rpv)}</td>
                        <td class="text-right py-2 font-mono text-slate-300">${money(a.aov)}</td>
                        <td class="text-right py-2 font-mono ${lift == null ? 'text-slate-500' : (lift > 0 ? 'text-emerald-300' : 'text-rose-300')}">${a === control ? '—' : sgn(lift)}</td>
                        <td class="text-right py-2 font-mono ${(a.p_rpv != null && a.p_rpv < 0.05) ? 'text-emerald-300' : 'text-slate-500'}">${a === control ? '—' : p_(a.p_rpv)}</td>
                      </tr>`;
                  })}
                </tbody>
              </table>
            </div>` : html`
            <div class="text-[13px] text-amber-200/80">
              ${t.stage === 1
                ? 'No revenue data yet — Stage 2 opens once two arms clear the Stage 1 gates above.'
                : html`Registered in <span class="font-mono">cro_tests.json</span> but no arm data has been measured yet.
                  URL splits are read by <span class="font-mono">cro_lp_split_refresh.py</span>; theme tests need
                  <span class="font-mono">note_attributes</span> arm stamps to land.`}
            </div>`}

          ${(t.decision_rule || {}).stage_2 ? html`
            <div class="text-[12px] text-slate-400 border-l-2 border-edge pl-3">
              <span class="text-[10px] uppercase tracking-widest text-slate-500 block mb-0.5">How Stage 2 gets called</span>
              ${t.decision_rule.stage_2}
            </div>` : null}

          ${/* The cart leak taxes every arm equally, so an arm can win the test and
                still show a bad absolute ROAS. Without this on the card, the winning
                framing gets killed for a problem the cart is causing. */''}
          ${(t.decision_rule || {}).absolute_roas_caveat ? html`
            <div class="text-[12px] text-amber-200/70 border-l-2 border-amber-400/30 pl-3">${t.decision_rule.absolute_roas_caveat}</div>` : null}

          ${t.measurement_note ? html`
            <div class="text-[11.5px] text-slate-500 border-l-2 border-edge/60 pl-3">${t.measurement_note}</div>` : null}

          ${t.recommendation ? html`
            <div class="text-[12px] text-slate-400 border-l-2 border-edge pl-3">${t.recommendation}</div>` : null}
        </div>` : null}
    </div>`;
}

// ── landing pages ────────────────────────────────────────────────────────────
function LpTable({ rows, benchmark, sources }) {
  const [sort, setSort] = useState('sessions');
  const gscOk = sources && sources.gsc && sources.gsc.ok;
  const clOk = sources && sources.clarity && sources.clarity.ok;

  const sorted = [...rows].sort((a, b) => {
    const va = a[sort], vb = b[sort];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return vb - va;
  });

  // First and last cells carry the horizontal gutter so the row hover still spans
  // the full card width — padding the scroll container instead would inset it.
  const Th = ({ k, label, right, pad }) => html`
    <th class="${right ? 'text-right' : 'text-left'} py-2 px-3 ${pad || ''} font-normal ${sort === k ? 'text-slate-300' : ''}">
      ${k ? html`<button class="hover:text-white" onClick=${() => setSort(k)}>${label}${sort === k ? ' ▾' : ''}</button>` : label}
    </th>`;

  const bench = benchmark || {};

  const totals = rows.reduce((a, r) => ({
    sessions: a.sessions + (r.sessions || 0),
    revenue: a.revenue + (r.revenue || 0),
  }), { sessions: 0, revenue: 0 });

  return html`
    <${Section}
      id="cro_lps"
      title="Landing page performance"
      subtitle=${`GA4 revenue + traffic${gscOk ? ', GSC organic' : ''}${clOk ? ', Clarity friction' : ''}`}
      count=${`${rows.length} pages`}
      ${/* Header numbers use the same rounded form as the KPI cards above — a
           raw $13345.60 next to $13,346 reads like two different figures. The
           PDP benchmark stays out of here; it's on its own row once open. */''}
      meta=${`${num(totals.sessions)} sessions · ${usd(totals.revenue)}`}
      defaultOpen=${false}>
      ${bench.rpv != null ? html`
        <div class="px-4 py-2 border-b border-edge text-[12px]">
          <span class="text-slate-500">PDP benchmark </span>
          <span class="font-mono text-slate-300">${bench.path}</span>
          <span class="ml-2 font-mono text-white">${money(bench.rpv)} RPV</span>
          <span class="ml-2 font-mono text-slate-400">${pct(bench.cvr)} CVR</span>
        </div>` : null}

      <div class="overflow-x-auto">
        <table class="w-full text-[13px]">
          <thead>
            <tr class="text-[10px] uppercase tracking-widest text-slate-500 border-b border-edge">
              <${Th} label="Landing page" pad="pl-5"/>
              <${Th} k="sessions" label="Sessions" right=${true}/>
              <${Th} k="cvr" label="CVR" right=${true}/>
              <${Th} k="rpv" label="RPV" right=${true}/>
              <${Th} k="revenue" label="Revenue" right=${true} pad=${(!gscOk && !clOk) ? 'pr-5' : ''}/>
              ${gscOk ? html`<${Th} label="Organic" right=${true} pad=${clOk ? '' : 'pr-5'}/>` : null}
              ${clOk ? html`<${Th} label="Friction" right=${true} pad="pr-5"/>` : null}
            </tr>
          </thead>
          <tbody>
            ${sorted.map(r => {
              const g = r.gsc || {};
              const c = r.clarity || {};
              const beatsPdp = bench.rpv != null && r.rpv != null && r.sessions >= 100;
              return html`
                <tr class="border-b border-edge/50 hover:bg-white/[0.02]">
                  <td class="py-2 px-3 pl-5">
                    <a href=${'https://hostmodern.co' + r.path} target="_blank" rel="noopener"
                       class="text-slate-200 hover:text-white">${r.slug}</a>
                    ${r.in_test ? html`<span class="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300">in test</span>` : null}
                    ${r.sessions === 0 ? html`<span class="ml-2 text-[10px] text-slate-600">no traffic</span>` : null}
                  </td>
                  <td class="text-right py-2 px-3 font-mono text-slate-300">${num(r.sessions)}</td>
                  <td class="text-right py-2 px-3 font-mono text-slate-300">${pct(r.cvr)}</td>
                  <td class="text-right py-2 px-3 font-mono ${beatsPdp ? (r.rpv >= bench.rpv ? 'text-emerald-300' : 'text-rose-300') : 'text-white'}">${money(r.rpv)}</td>
                  <td class="text-right py-2 px-3 ${(!gscOk && !clOk) ? 'pr-5' : ''} font-mono text-slate-300">${r.revenue ? usd(r.revenue) : '—'}</td>
                  ${gscOk ? html`
                    <td class="text-right py-2 px-3 ${clOk ? '' : 'pr-5'} font-mono text-slate-400">
                      ${g.clicks == null ? '—' : html`${num(g.clicks)}<span class="text-slate-600"> / ${num(g.impressions)}</span>`}
                      ${g.position != null ? html`<div class="text-[11px] text-slate-600">pos ${(+g.position).toFixed(1)}</div>` : null}
                    </td>` : null}
                  ${clOk ? html`
                    <td class="text-right py-2 px-3 pr-5 font-mono text-slate-400">
                      ${c.scroll_depth == null ? '—' : html`${Math.round(c.scroll_depth)}%<span class="text-slate-600"> scroll</span>`}
                      ${(c.rage_clicks || c.dead_clicks) ? html`
                        <div class="text-[11px] text-amber-300/80">
                          ${num(c.rage_clicks || 0)} rage · ${num(c.dead_clicks || 0)} dead
                        </div>` : (c.sessions ? html`
                        <div class="text-[11px] text-slate-600">no rage/dead clicks</div>` : null)}
                    </td>` : null}
                </tr>`;
            })}
          </tbody>
        </table>
      </div>
    </${Section}>`;
}

// ── price tests ──────────────────────────────────────────────────────────────
// Deliberately NOT rendered as a TestCard. An A/B test is randomised, concurrent
// and session-denominated; a price test is pre/post, order-denominated, and absorbs
// every other change in its window. Same card shape would train the reader to give
// them the same confidence. So: different card, and the headline is always the
// sample gate rather than the delta until the gate actually opens.
const PSTATE = {
  awaiting: ['No data yet', 'bg-amber-500/15 text-amber-300 border-amber-400/25'],
  collecting: ['Collecting', 'bg-sky-500/15 text-sky-300 border-sky-400/25'],
  watch: ['Under threshold · not callable', 'bg-amber-500/15 text-amber-300 border-amber-400/25'],
  callable: ['Callable · holding', 'bg-emerald-500/15 text-emerald-300 border-emerald-400/25'],
  breached: ['Threshold breached', 'bg-rose-500/15 text-rose-300 border-rose-400/25'],
  integrity: ['Integrity problem', 'bg-rose-500/15 text-rose-300 border-rose-400/25'],
};

// usd() from lib/format renders null as "$0", which would read as a real zero in a
// contribution column. Blank it instead.
const usd_ = n => (n == null || isNaN(+n)) ? '—' : usd(n);
const dmoney = n => (n == null || isNaN(+n)) ? '—' : (+n < 0 ? '-$' : '+$') + Math.abs(+n).toFixed(2);

function ProgressBar({ frac, callable }) {
  const w = Math.max(0, Math.min(1, frac || 0)) * 100;
  return html`
    <div class="h-1.5 rounded-full bg-white/5 overflow-hidden">
      <div class="h-full rounded-full ${callable ? 'bg-emerald-400/70' : 'bg-sky-400/50'}"
           style=${`width:${w.toFixed(1)}%`}></div>
    </div>`;
}

function PriceCard({ t }) {
  const [open, setOpen] = useState(t.state === 'breached' || t.state === 'integrity');
  const g = t.gates || {};
  const b = t.baseline || {};
  const o = t.observed || {};
  const dl = t.delta || {};
  const [label, cls] = PSTATE[t.state] || PSTATE.collecting;
  // Until both gates pass, the deltas are noise wearing a number's clothes.
  const muted = g.callable ? 'text-white' : 'text-slate-500';

  const ask = mkAsk(
    'price test ' + t.test_id,
    `${t.label}. Changed ${t.changed_at}, measuring from ${t.measure_from}. State ${t.state}. ` +
    `${g.orders_collected} of ${g.min_orders_to_call} orders, p=${g.p_value}, callable=${g.callable}. ` +
    `Attach ${o.attach_per_1k} vs baseline ${b.attach_per_1k} per 1k. ASP ${o.realized_asp} vs ${b.realized_asp}. ` +
    `Contribution/1k ${o.contribution_per_1k} vs ${b.contribution_per_1k}. ` +
    `Threshold ${(t.thresholds || {}).alert_attach_per_1k}. ` +
    (t.confounders || []).map(c => `Confounder: ${c.summary}`).join(' ')
  );

  const row = (k, base, obs, delta) => html`
    <tr class="border-b border-edge/60 last:border-0">
      <td class="py-2 text-slate-400">${k}</td>
      <td class="text-right py-2 font-mono text-slate-400">${base}</td>
      <td class="text-right py-2 font-mono text-slate-200">${obs}</td>
      <td class="text-right py-2 font-mono ${muted}">${delta}</td>
    </tr>`;

  return html`
    <div class="relative rounded-xl border ${t.state === 'breached' || t.state === 'integrity' ? 'border-rose-400/25' : 'border-edge'} bg-panel">
      <${AskButton} prompt=${ask}/>
      <button onClick=${() => setOpen(!open)} class="w-full text-left p-4 pr-10">
        <div class="flex items-start gap-3 flex-wrap">
          <span class="text-[11px] px-2 py-0.5 rounded-full border ${cls}">${label}</span>
          <div class="min-w-0 flex-1">
            <div class="text-white text-[15px] font-medium">${t.label}</div>
            <div class="mt-0.5 text-[12px] text-slate-400">
              changed ${t.changed_at} · ${t.sku_is_group ? `${t.sku.length} SKUs, measured as a group` : t.sku[0]}
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-[13px] text-slate-200">${t.headline}</div>
            <div class="text-[11px] font-mono text-slate-500">
              ${g.orders_per_day ? `${g.orders_per_day}/day · ` : ''}${t.window_days}d in
            </div>
          </div>
          <span class="text-slate-500 text-xs">${open ? '▾' : '▸'}</span>
        </div>
        <div class="mt-3">
          <${ProgressBar} frac=${g.progress} callable=${g.callable}/>
          <div class="mt-1 flex justify-between text-[11px] font-mono text-slate-500">
            <span>${num(g.orders_collected)} / ${num(g.min_orders_to_call)} store orders</span>
            <span>${g.callable ? 'both gates open' : (g.sample_met ? `sample met · p=${p_(g.p_value)}` : 'sample gate closed')}</span>
          </div>
        </div>
      </button>

      ${open ? html`
        <div class="border-t border-edge p-4 space-y-3">
          ${t.inverted_success_criterion ? html`
            <div class="rounded-lg border border-violet-400/30 bg-violet-400/10 px-3 py-2.5 text-[12.5px] text-violet-100">
              <span class="text-[10px] uppercase tracking-widest text-violet-300 block mb-1">Read before judging — a volume drop is the goal here</span>
              ${t.inverted_success_criterion}
            </div>` : null}

          <!-- Confounders are deliberately NOT rendered (Collin, 2026-08-16: the banners
               buried the numbers). They stay in price_tests.json, still ride through the
               snapshot, and are still passed to the Ask prompt below, so the analysis keeps
               accounting for them. They are simply not shown. Do not re-add them here. -->

          <div class="overflow-x-auto">
            <table class="w-full text-[13px]">
              <thead>
                <tr class="text-[10px] uppercase tracking-widest text-slate-500 border-b border-edge">
                  <th class="text-left py-2 font-normal">Metric</th>
                  <th class="text-right py-2 font-normal">Baseline</th>
                  <th class="text-right py-2 font-normal">Since ${t.measure_from}</th>
                  <th class="text-right py-2 font-normal">${g.callable ? 'Delta' : 'Delta (not callable)'}</th>
                </tr>
              </thead>
              <tbody>
                ${/* Labels say "store orders" on purpose. Every denominator here is TOTAL
                      store orders in the window, not orders containing this product. Reading
                      "57 of 1,930 orders" as "57 Kit orders" inverts the whole card
                      (Collin, 2026-08-16). Do not shorten these back to "orders". */''}
                ${row('Units sold per 1,000 store orders', b.attach_per_1k, o.attach_per_1k, sgn(dl.attach_pct))}
                ${row('Average selling price', money(b.realized_asp), money(o.realized_asp), dmoney(dl.asp_abs))}
                ${row('Contribution per 1,000 store orders', usd_(b.contribution_per_1k), usd_(o.contribution_per_1k), sgn(dl.contribution_pct))}
                ${row('Store orders / units sold', num(b.orders) + ' / ' + num(b.units), num(o.orders) + ' / ' + num(o.units), '—')}
              </tbody>
            </table>
          </div>

          ${!g.callable ? html`
            <div class="text-[12px] text-slate-500">
              Not callable yet — ${num(g.min_orders_to_call - g.orders_collected)} more store orders needed
              ${g.eta_callable && g.eta_callable !== 'sample reached' ? `, roughly ${g.eta_callable} at the current rate` : ''}.
              A pre/post price test at this sample cannot separate a real move from noise.
            </div>` : null}

          <div class="grid md:grid-cols-2 gap-3 text-[12px]">
            <div class="rounded-lg border border-edge bg-panel2/40 px-3 py-2.5">
              <div class="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Threshold</div>
              <div class="text-slate-300">
                Alert if units per 1,000 store orders fall below ${(t.thresholds || {}).alert_attach_per_1k}
                ${(t.thresholds || {}).alert_is_breakeven ? ' (breakeven)' : ' (widened)'}.
                Currently ${o.attach_per_1k == null ? '—' : o.attach_per_1k}.
              </div>
              ${(t.thresholds || {}).rationale ? html`<div class="mt-1 text-slate-500">${t.thresholds.rationale}</div>` : null}
            </div>
            <div class="rounded-lg border border-edge bg-panel2/40 px-3 py-2.5">
              <div class="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Price integrity</div>
              <div class="${(t.integrity || {}).state === 'fail' ? 'text-rose-300' : 'text-slate-300'}">
                ${(t.integrity || {}).note}
              </div>
              ${o.price_points ? html`
                <div class="mt-1 font-mono text-slate-500">
                  ${Object.entries(o.price_points).map(([pt, q]) => `$${pt}×${q}`).join(' · ')}
                </div>` : null}
            </div>
          </div>

          ${t.today_partial && t.today_partial.orders ? html`
            <div class="text-[12px] text-slate-500">
              ${`Today so far (excluded from the gates): ${num(t.today_partial.orders)} orders, ` +
                `${num(t.today_partial.units)} units, attach ${t.today_partial.attach_per_1k}/1k.`}
            </div>` : null}
        </div>` : null}
    </div>`;
}

// ── shipping-threshold test ──────────────────────────────────────────────────
// A shipping change is store-wide: no SKU, no attach rate. Its card measures
// order-band migration, average order value and shipping collected per order
// against a locked baseline. Blended conversion rate and abandoned checkouts are
// judged by hm-price-test-watch (Triple Whale lives outside this feeder).
function ShippingCard({ t }) {
  const [open, setOpen] = useState(false);
  const g = t.gates || {};
  const b = t.baseline || {};
  const o = t.observed || {};
  const dl = t.delta || {};
  const [label, cls] = PSTATE[t.state] || PSTATE.collecting;
  const muted = g.callable ? 'text-white' : 'text-slate-500';

  const ask = mkAsk(
    'shipping threshold test ' + t.test_id,
    `${t.label}. Changed ${t.changed_at}, measuring from ${t.measure_from}. State ${t.state}. ` +
    `${g.orders_collected} of ${g.min_orders_to_call} store orders, p=${g.p_value} on mid-band share. ` +
    `Band mix baseline ${b.band_share_under_99}/${b.band_share_99_to_169}/${b.band_share_169_plus} ` +
    `vs observed ${o.band_share_under_99}/${o.band_share_99_to_169}/${o.band_share_169_plus}. ` +
    `AOV ${o.aov_total} vs ${b.aov_total}. Shipping collected per order ${o.ship_per_order} vs ${b.ship_per_order}. ` +
    (t.closeout_decision ? `Pending decision at closeout: ${t.closeout_decision.question} ` : '') +
    (t.confounders || []).map(c => `Confounder: ${c.summary}`).join(' ')
  );

  const row = (k, base, obs, delta) => html`
    <tr class="border-b border-edge/60 last:border-0">
      <td class="py-2 text-slate-400">${k}</td>
      <td class="text-right py-2 font-mono text-slate-400">${base}</td>
      <td class="text-right py-2 font-mono text-slate-200">${obs}</td>
      <td class="text-right py-2 font-mono ${muted}">${delta}</td>
    </tr>`;

  return html`
    <div class="relative rounded-xl border border-edge bg-panel">
      <${AskButton} prompt=${ask}/>
      <button onClick=${() => setOpen(!open)} class="w-full text-left p-4 pr-10">
        <div class="flex items-start gap-3 flex-wrap">
          <span class="text-[11px] px-2 py-0.5 rounded-full border ${cls}">${label}</span>
          <div class="min-w-0 flex-1">
            <div class="text-white text-[15px] font-medium">${t.label}</div>
            <div class="mt-0.5 text-[12px] text-slate-400">
              changed ${t.changed_at} · store-wide · decision due ${t.expires_at || '—'}
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-[13px] text-slate-200">${t.headline}</div>
            <div class="text-[11px] font-mono text-slate-500">
              ${g.orders_per_day ? `${g.orders_per_day}/day · ` : ''}${t.window_days}d in
            </div>
          </div>
          <span class="text-slate-500 text-xs">${open ? '▾' : '▸'}</span>
        </div>
        <div class="mt-3">
          <${ProgressBar} frac=${g.progress} callable=${g.callable}/>
          <div class="mt-1 flex justify-between text-[11px] font-mono text-slate-500">
            <span>${num(g.orders_collected)} / ${num(g.min_orders_to_call)} store orders</span>
            <span>${g.callable ? 'both gates open' : (g.sample_met ? `sample met · p=${p_(g.p_value)}` : 'sample gate closed')}</span>
          </div>
        </div>
      </button>

      ${open ? html`
        <div class="border-t border-edge p-4 space-y-3">
          <div class="overflow-x-auto">
            <table class="w-full text-[13px]">
              <thead>
                <tr class="text-[10px] uppercase tracking-widest text-slate-500 border-b border-edge">
                  <th class="text-left py-2 font-normal">Metric</th>
                  <th class="text-right py-2 font-normal">Baseline</th>
                  <th class="text-right py-2 font-normal">Since ${t.measure_from}</th>
                  <th class="text-right py-2 font-normal">${g.callable ? 'Delta' : 'Delta (not callable)'}</th>
                </tr>
              </thead>
              <tbody>
                ${row('Store orders under $99', pct(b.band_share_under_99, 1), pct(o.band_share_under_99, 1), sgn(dl.band_share_under_99))}
                ${row('Store orders $99–$168.99 (lost free shipping)', pct(b.band_share_99_to_169, 1), pct(o.band_share_99_to_169, 1), sgn(dl.band_share_99_to_169))}
                ${row('Store orders $169 and up (free shipping)', pct(b.band_share_169_plus, 1), pct(o.band_share_169_plus, 1), sgn(dl.band_share_169_plus))}
                ${row('Average order value', money(b.aov_total), money(o.aov_total), dmoney(dl.aov_abs))}
                ${row('Shipping collected per order', money(b.ship_per_order), money(o.ship_per_order), dmoney(dl.ship_per_order_abs))}
                ${row('Express take rate', pct(b.express_take_rate, 1), pct(o.express_take_rate, 1), sgn(dl.express_take_rate_abs))}
                ${row('Express fee collected (per express order)', money(b.express_fee_per_express_order), money(o.express_fee_per_express_order), '')}
                ${row('Express $ across all orders', money(b.express_fee_per_all_orders), money(o.express_fee_per_all_orders), dmoney(dl.express_fee_per_all_orders_abs))}
              </tbody>
            </table>
          </div>
          ${b.express_label_cost_per_order ? html`
            <div class="rounded-lg border border-edge bg-black/20 px-3 py-2 text-[12px] text-slate-400">
              <span class="text-slate-300">Reading express:</span> a falling take rate is the intended
              outcome, not a loss. Express costs ${money(b.express_label_cost_per_order)}/order in labels;
              at $16.99 HM recovered 19% of that. Buyers who stay now pay the full label, buyers who switch
              to Standard cut HM's cost on that order by roughly two thirds. Judge this line on
              <span class="text-slate-300">blended CVR</span>, not express volume.
            </div>` : null}
          ${t.closeout_decision ? html`
            <div class="rounded-lg border border-sky-400/25 bg-sky-400/10 px-3 py-2.5 text-[12.5px] text-sky-100">
              <span class="text-[10px] uppercase tracking-widest text-sky-300 block mb-1">Decision pending at closeout ${t.expires_at}</span>
              ${t.closeout_decision.question}
            </div>` : null}
        </div>` : null}
    </div>`;
}

function PriceTests({ d }) {
  const tests = (d && d.tests) || [];
  const shipping = (d && d.shipping_tests) || [];
  const gen = (d && d.generated) ? new Date(d.generated).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
  const breached = [...tests, ...shipping].filter(t => t.state === 'breached' || t.state === 'integrity').length;

  return html`
    <${Section}
      id="cro_price"
      title="Price tests"
      subtitle="Pre/post, measured on attach per 1,000 store orders — not randomised, not comparable to the A/B tests above"
      count=${tests.length + shipping.length}
      tone=${breached ? 'text-rose-300' : 'text-slate-400'}
      meta=${d ? `${breached ? breached + ' breached · ' : ''}updated ${gen} CT` : 'no price snapshot'}
      defaultOpen=${false}>
      <div class="p-3 space-y-2.5">
        ${shipping.map(t => html`<${ShippingCard} t=${t} key=${t.test_id}/>`)}
        ${tests.map(t => html`<${PriceCard} t=${t} key=${t.test_id}/>`)}
        ${!tests.length && !shipping.length ? html`
          <div class="p-6 text-center text-slate-400 text-[13px]">
            ${d ? html`No active price tests. Add one to <code class="font-mono text-slate-300">data/price_tests.json</code>.`
                : html`No price snapshot yet. Run <code class="font-mono text-slate-300">Scripts/build_price_snapshot.py</code>.`}
          </div>` : null}
        ${Object.keys((d && d.errors) || {}).length ? html`
          <div class="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-[12px] text-rose-200">
            ${Object.entries(d.errors).map(([k, v]) => `${k}: ${v}`).join(' · ')}
          </div>` : null}
      </div>
    </${Section}>`;
}

// ── test sections ────────────────────────────────────────────────────────────
// Tests are grouped by what they change, because the two families are not
// comparable and stacking them in one list is what made this page unruly.
// `category` is assigned by build_cro_snapshot.py (explicit in the register when
// the feeder sets it, derived from session_mode/surface otherwise) — the view
// never guesses.
function TestSection({ id, title, subtitle, running, concluded, defaultOpen }) {
  if (!running.length && !concluded.length) return null;
  const sig = running.filter(t => t.state === 'significant').length;
  const awaiting = running.filter(t => t.state === 'awaiting').length;

  const meta = [
    sig ? `${sig} ready to call` : null,
    awaiting ? `${awaiting} awaiting data` : null,
    concluded.length ? `${concluded.length} concluded` : null,
  ].filter(Boolean).join(' · ') || (running.length ? 'collecting' : '—');

  return html`
    <${Section} id=${id} title=${title} subtitle=${subtitle}
      count=${running.length ? `${running.length} running` : 'none running'}
      tone=${sig ? 'text-emerald-300' : 'text-slate-400'}
      meta=${meta} defaultOpen=${defaultOpen}>
      <div class="p-3 space-y-2.5">
        ${running.map(t => html`<${TestCard} t=${t} key=${t.id}/>`)}
        ${concluded.length ? html`
          <${Disclosure} label=${`Concluded (${concluded.length})`}>
            ${concluded.map(t => html`<${TestCard} t=${t} key=${t.id}/>`)}
          </${Disclosure}>` : null}
      </div>
    </${Section}>`;
}

// ── view ─────────────────────────────────────────────────────────────────────
export function Cro() {
  const s = useStore();
  const d = s.cro;

  // The A/B snapshot being absent must not hide the price panel — they have
  // separate feeders and either can be stale without the other.
  if (!d) {
    return html`
      <div class="max-w-[1500px] space-y-5">
        <div class="rounded-xl border border-edge bg-panel p-10 text-center text-slate-400">
          No CRO snapshot yet. Run
          <code class="font-mono text-slate-300">TZ="America/Chicago" python3 Scripts/build_cro_snapshot.py</code>
          to write <code class="font-mono text-slate-300">data/cro_snapshot.json</code>.
        </div>
        <${PriceTests} d=${s.price}/>
      </div>`;
  }

  const sum = d.summary || {};
  const running = (d.tests && d.tests.running) || [];
  const concluded = (d.tests && d.tests.concluded) || [];
  const lps = d.landing_pages || [];
  const sources = d.sources || {};
  const degraded = Object.entries(sources).filter(([, v]) => !v.ok);

  const gen = d.generated ? new Date(d.generated).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

  const askAll = mkAsk('the CRO program',
    `${sum.running} tests running (${sum.significant} at significance), ${sum.concluded} concluded. ` +
    `Running: ${running.map(t => `${t.id} — ${t.headline}`).join('; ')}. ` +
    `LPs: ${sum.lp_sessions} sessions, ${usd(sum.lp_revenue)} revenue across ${lps.length} pages.`);

  // One pass, two buckets. A test with an unknown category lands in on-site
  // rather than vanishing — a section nobody can see is worse than a mis-filed row.
  const inCat = (list, c) => list.filter(t => (t.category || 'onsite') === c);
  const lpRunning = inCat(running, 'landing_page');
  const lpConcluded = inCat(concluded, 'landing_page');
  const siteRunning = running.filter(t => !lpRunning.includes(t));
  const siteConcluded = concluded.filter(t => !lpConcluded.includes(t));

  return html`
    <div class="max-w-[1500px] space-y-5">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div class="text-[12px] text-slate-500">
          Updated ${gen} CT · GA4/GSC ${d.window_days}d window
          ${sources.clarity && sources.clarity.ok ? ` · Clarity ${sources.clarity.window_days}d` : ''}
        </div>
        <${AskButton} prompt=${askAll} class="h-7 w-7 grid place-items-center rounded-md text-slate-400 hover:text-white hover:bg-white/10"/>
      </div>

      ${degraded.length ? html`
        <div class="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-[13px] text-amber-200">
          Partial data — ${degraded.map(([k]) => k.toUpperCase()).join(', ')} unavailable this run.
          Those columns are blank; test math is unaffected.
        </div>` : null}

      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <${Stat} label="Tests running" value=${sum.running || 0}
                 sub=${sum.awaiting_data ? `${sum.awaiting_data} awaiting first read` : 'all reporting'}/>
        <${Stat} label="At significance" value=${sum.significant || 0}
                 tone=${sum.significant ? 'text-emerald-300' : 'text-white'}
                 sub=${sum.significant ? 'ready to call' : 'none ready to call'}/>
        <${Stat} label="LP sessions" value=${num(sum.lp_sessions)} sub=${`${lps.length} pages tracked`}/>
        <${Stat} label="LP revenue" value=${usd(sum.lp_revenue)} sub=${`${d.window_days}d, GA4 last-click`}/>
      </div>

      ${/* Landing page tests open by default — they are the live program. Everything
            else remembers whatever you last set (Section persists per id). */''}
      <${TestSection}
        id="cro_lp_tests"
        title="Landing page tests"
        subtitle="Where paid traffic lands — tw_adid redirect splits and ad-to-LP message match arms"
        running=${lpRunning} concluded=${lpConcluded} defaultOpen=${true}/>

      <${TestSection}
        id="cro_onsite_tests"
        title="On-site tests"
        subtitle="What the site does once they arrive — PDP, cart drawer, buy box. Arms stamped on the Shopify order."
        running=${siteRunning} concluded=${siteConcluded} defaultOpen=${false}/>

      ${!running.length && !concluded.length ? html`
        <div class="rounded-xl border border-edge bg-panel p-8 text-center text-slate-400">
          No tests registered in <code class="font-mono text-slate-300">data/cro_tests.json</code>.
        </div>` : null}

      <${PriceTests} d=${s.price}/>

      <${LpTable} rows=${lps} benchmark=${d.benchmark} sources=${sources}/>
    </div>`;
}
