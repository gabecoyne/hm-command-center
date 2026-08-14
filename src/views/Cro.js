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

// ── one running test ─────────────────────────────────────────────────────────
function TestCard({ t }) {
  const [open, setOpen] = useState(t.state === 'significant');
  const arms = t.arms || [];
  const control = arms[0];

  const ask = mkAsk(
    'CRO test ' + t.id,
    `${t.name}. Status ${t.status}, ${t.days_running == null ? 'start date unknown' : t.days_running + ' days running'}. ` +
    `Read: ${t.headline}. Hypothesis: ${t.hypothesis || 'n/a'}. Surface: ${t.surface || 'n/a'}. ` +
    `Arms: ${arms.map(a => `${a.arm} n=${a.sessions} cvr=${a.cvr} rpv=${a.rpv}`).join(' | ')}.`
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

          ${arms.length ? html`
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
              Registered in <span class="font-mono">cro_tests.json</span> but no arm data has been measured yet.
              URL splits are read by <span class="font-mono">cro_lp_split_refresh.py</span>; theme tests need
              <span class="font-mono">note_attributes</span> arm stamps to land.
            </div>`}

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

  const Th = ({ k, label, right }) => html`
    <th class="${right ? 'text-right' : 'text-left'} py-2 font-normal ${sort === k ? 'text-slate-300' : ''}">
      ${k ? html`<button class="hover:text-white" onClick=${() => setSort(k)}>${label}${sort === k ? ' ▾' : ''}</button>` : label}
    </th>`;

  const bench = benchmark || {};

  return html`
    <div class="rounded-xl border border-edge bg-panel overflow-hidden">
      <div class="px-4 py-3 border-b border-edge flex items-center justify-between flex-wrap gap-2">
        <div>
          <div class="text-white text-[15px] font-medium">Landing pages</div>
          <div class="text-[12px] text-slate-400">
            GA4 revenue + traffic${gscOk ? ', GSC organic' : ''}${clOk ? ', Clarity friction' : ''}
          </div>
        </div>
        ${bench.rpv != null ? html`
          <div class="text-right text-[12px]">
            <span class="text-slate-500">PDP benchmark </span>
            <span class="font-mono text-slate-300">${bench.path}</span>
            <span class="ml-2 font-mono text-white">${money(bench.rpv)} RPV</span>
            <span class="ml-2 font-mono text-slate-400">${pct(bench.cvr)} CVR</span>
          </div>` : null}
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-[13px]">
          <thead>
            <tr class="text-[10px] uppercase tracking-widest text-slate-500 border-b border-edge">
              <${Th} label="Landing page"/>
              <${Th} k="sessions" label="Sessions" right=${true}/>
              <${Th} k="cvr" label="CVR" right=${true}/>
              <${Th} k="rpv" label="RPV" right=${true}/>
              <${Th} k="revenue" label="Revenue" right=${true}/>
              ${gscOk ? html`<${Th} label="Organic" right=${true}/>` : null}
              ${clOk ? html`<${Th} label="Friction" right=${true}/>` : null}
            </tr>
          </thead>
          <tbody>
            ${sorted.map(r => {
              const g = r.gsc || {};
              const c = r.clarity || {};
              const beatsPdp = bench.rpv != null && r.rpv != null && r.sessions >= 100;
              return html`
                <tr class="border-b border-edge/50 hover:bg-white/[0.02]">
                  <td class="py-2">
                    <a href=${'https://hostmodern.co' + r.path} target="_blank" rel="noopener"
                       class="text-slate-200 hover:text-white">${r.slug}</a>
                    ${r.in_test ? html`<span class="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300">in test</span>` : null}
                    ${r.sessions === 0 ? html`<span class="ml-2 text-[10px] text-slate-600">no traffic</span>` : null}
                  </td>
                  <td class="text-right py-2 font-mono text-slate-300">${num(r.sessions)}</td>
                  <td class="text-right py-2 font-mono text-slate-300">${pct(r.cvr)}</td>
                  <td class="text-right py-2 font-mono ${beatsPdp ? (r.rpv >= bench.rpv ? 'text-emerald-300' : 'text-rose-300') : 'text-white'}">${money(r.rpv)}</td>
                  <td class="text-right py-2 font-mono text-slate-300">${r.revenue ? usd(r.revenue) : '—'}</td>
                  ${gscOk ? html`
                    <td class="text-right py-2 font-mono text-slate-400">
                      ${g.clicks == null ? '—' : html`${num(g.clicks)}<span class="text-slate-600"> / ${num(g.impressions)}</span>`}
                      ${g.position != null ? html`<div class="text-[11px] text-slate-600">pos ${(+g.position).toFixed(1)}</div>` : null}
                    </td>` : null}
                  ${clOk ? html`
                    <td class="text-right py-2 font-mono text-slate-400">
                      ${c.scroll_depth == null ? '—' : html`${Math.round(c.scroll_depth)}%<span class="text-slate-600"> scroll</span>`}
                      ${(c.rage_clicks || c.dead_clicks) ? html`
                        <div class="text-[11px] ${(c.rage_clicks || 0) > 0 ? 'text-amber-300/80' : 'text-slate-600'}">
                          ${num(c.rage_clicks || 0)} rage · ${num(c.dead_clicks || 0)} dead
                        </div>` : null}
                    </td>` : null}
                </tr>`;
            })}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ── view ─────────────────────────────────────────────────────────────────────
export function Cro() {
  const s = useStore();
  const [tab, setTab] = useState('running');
  const d = s.cro;

  if (!d) {
    return html`
      <div class="max-w-[1500px]">
        <div class="rounded-xl border border-edge bg-panel p-10 text-center text-slate-400">
          No CRO snapshot yet. Run
          <code class="font-mono text-slate-300">TZ="America/Chicago" python3 Scripts/build_cro_snapshot.py</code>
          to write <code class="font-mono text-slate-300">data/cro_snapshot.json</code>.
        </div>
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

  const tabs = [['running', `Running (${running.length})`], ['concluded', `Concluded (${concluded.length})`]];

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

      <div class="flex gap-1.5">
        ${tabs.map(([k, label]) => html`
          <button onClick=${() => setTab(k)}
            class="text-[13px] px-3 py-1.5 rounded-lg ${tab === k ? 'bg-panel2 text-white' : 'text-slate-400 hover:text-white hover:bg-panel2'}">
            ${label}
          </button>`)}
      </div>

      <div class="space-y-2.5">
        ${(tab === 'running' ? running : concluded).map(t => html`<${TestCard} t=${t} key=${t.id}/>`)}
        ${!(tab === 'running' ? running : concluded).length ? html`
          <div class="rounded-xl border border-edge bg-panel p-8 text-center text-slate-400">
            No ${tab} tests.
          </div>` : null}
      </div>

      <${LpTable} rows=${lps} benchmark=${d.benchmark} sources=${sources}/>
    </div>`;
}
