// Ecomm Health — the weekly full-funnel red/yellow/green scorecard.
//
// Reads data/ecomm_health_scorecard.json, written Monday 8am CT by
// Scripts/ecomm_health_scorecard.py (Triple Whale REST, Meta + Google Ads direct
// APIs, GA4, GSC, Shopify, Klaviyo; targets from the working model and
// hm_unit_economics.py). Every verdict is computed in the feeder — this view
// only renders, so the page and the JSON can never disagree about a colour.
// Design + deviations from the Stix source spec:
// Doc/Engineering/HM_Ecomm_Health_Scorecard_Spec.md
import { html } from '../html.js';
import { useState } from 'preact/hooks';
import { useStore } from '../state.js';
import { mkAsk } from '../lib/prompts.js';
import { AskButton } from '../components/AskButton.js';
import { Section } from '../components/Section.js';

// ── formatting ───────────────────────────────────────────────────────────────
const isNum = n => n != null && !isNaN(+n);
function fmt(v, unit) {
  if (!isNum(v)) return '—';
  const n = +v;
  switch (unit) {
    case '$': return Math.abs(n) >= 1000 ? '$' + Math.round(n).toLocaleString() : '$' + n.toFixed(2);
    case '%': return n.toFixed(Math.abs(n) < 10 ? 2 : 1) + '%';
    case 'x': return n.toFixed(2) + 'x';
    case 's': return Math.round(n) + 's';
    default: return Math.abs(n) >= 100 ? Math.round(n).toLocaleString() : n.toFixed(2).replace(/\.?0+$/, '');
  }
}
const sgn = (n, d = 1) => !isNum(n) ? '—' : ((+n > 0 ? '+' : '') + (+n).toFixed(d) + '%');
const shortDate = iso => { const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };

// Verdict → colours. `na` and `ctx` are deliberately neutral: not-scored is not
// "fine", and the tally never counts them (spec's one hard rule).
const TONE = {
  green: { dot: 'bg-emerald-400', text: 'text-emerald-300', border: 'border-emerald-400/25', bg: 'bg-emerald-500/10', label: 'On track' },
  yellow: { dot: 'bg-amber-400', text: 'text-amber-300', border: 'border-amber-400/25', bg: 'bg-amber-500/10', label: 'Watch' },
  red: { dot: 'bg-rose-400', text: 'text-rose-300', border: 'border-rose-400/25', bg: 'bg-rose-500/10', label: 'Off' },
  na: { dot: 'bg-slate-600', text: 'text-slate-500', border: 'border-edge', bg: 'bg-white/[0.02]', label: 'Not scored' },
  ctx: { dot: 'bg-sky-500/60', text: 'text-sky-300/80', border: 'border-sky-400/20', bg: 'bg-sky-500/[0.06]', label: 'Context' },
};
const tone = v => TONE[v] || TONE.na;

// A delta is good or bad depending on which way the metric should move. `band`
// metrics (paid spend) have no good direction — a move either way is just a move.
function deltaTone(pct, direction) {
  if (!isNum(pct) || direction === 'band') return 'text-slate-400';
  const good = direction === 'down' ? pct < 0 : pct > 0;
  if (Math.abs(pct) < 2) return 'text-slate-400';
  return good ? 'text-emerald-300' : 'text-rose-300';
}

const BASIS = {
  plan: ['plan', 'text-indigo-300 border-indigo-400/30'],
  benchmark: ['bench', 'text-sky-300 border-sky-400/30'],
  baseline: ['12wk', 'text-slate-400 border-edge'],
  context: ['ctx', 'text-slate-500 border-edge'],
};

// ── sparkline ────────────────────────────────────────────────────────────────
// Verdict-coloured dots on a neutral line: the shape is the trend, the dots are
// the weeks that were red. A metric that is red now but was red all summer
// reads differently from one that just tipped.
function Spark({ series, verdicts, w = 120, h = 28, refLine }) {
  const pts = (series || []).map((v, i) => [i, isNum(v) ? +v : null]);
  const vals = pts.filter(p => p[1] != null).map(p => p[1]);
  if (vals.length < 2) return html`<svg width=${w} height=${h}></svg>`;
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (isNum(refLine)) { lo = Math.min(lo, +refLine); hi = Math.max(hi, +refLine); }
  if (hi === lo) { hi = lo + 1; }
  const n = pts.length;
  const x = i => 3 + (i / Math.max(n - 1, 1)) * (w - 6);
  const y = v => h - 3 - ((v - lo) / (hi - lo)) * (h - 6);
  const d = pts.filter(p => p[1] != null).map((p, k) => (k ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join(' ');
  const DOT = { green: '#34d399', yellow: '#fbbf24', red: '#fb7185' };
  return html`
    <svg width=${w} height=${h} viewBox=${`0 0 ${w} ${h}`} class="shrink-0">
      ${isNum(refLine) ? html`<line x1="0" x2=${w} y1=${y(+refLine)} y2=${y(+refLine)} stroke="currentColor" stroke-opacity="0.18" stroke-dasharray="2 3"/>` : null}
      <path d=${d} fill="none" stroke="currentColor" stroke-opacity="0.55" stroke-width="1.25"/>
      ${pts.map((p, i) => p[1] == null ? null : html`<circle cx=${x(p[0])} cy=${y(p[1])} r=${i === n - 1 ? 2.4 : 1.6} fill=${DOT[(verdicts || [])[i]] || '#64748b'}/>`)}
    </svg>`;
}

// ── metric card ──────────────────────────────────────────────────────────────
function MetricCard({ m, mode }) {
  const t = tone(m.verdict);
  const [b, bcls] = BASIS[m.basis] || BASIS.baseline;
  const delta = mode === 'wow' ? m.wow_pct : m.vs_median_pct;
  const deltaLabel = mode === 'wow' ? 'WoW' : 'vs 12wk';
  const [showNote, setShowNote] = useState(false);
  return html`
    <div class="rounded-lg border ${t.border} ${m.verdict === 'red' ? 'bg-rose-500/[0.05]' : 'bg-white/[0.015]'} p-2.5 min-w-0">
      <div class="flex items-start gap-2">
        <span class="mt-1.5 h-2 w-2 rounded-full shrink-0 ${t.dot}" title=${t.label}></span>
        <div class="min-w-0 flex-1">
          <div class="text-[12px] text-slate-300 leading-tight truncate" title=${m.label}>${m.label}</div>
          <div class="mt-0.5 flex items-baseline gap-2 flex-wrap">
            <span class="text-[17px] font-semibold ${m.verdict === 'na' ? 'text-slate-500' : 'text-white'}">${fmt(m.latest, m.unit)}</span>
            <span class="text-[11px] font-mono ${deltaTone(delta, m.direction)}">${sgn(delta)} <span class="text-slate-600">${deltaLabel}</span></span>
          </div>
        </div>
        <${Spark} series=${m.series} verdicts=${m.verdicts} refLine=${m.basis === 'baseline' ? m.median : m.ref} w=${96} h=${26}/>
      </div>
      <div class="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-500 min-w-0">
        <span class="px-1 rounded border ${bcls} font-mono">${b}</span>
        <span class="truncate">${m.ref_label ? `${m.ref_label}${isNum(m.ref) ? ' · ' + fmt(m.ref, m.unit) : ''}` : (m.verdict === 'ctx' ? 'shown, not scored' : '')}</span>
        ${m.note ? html`<button class="ml-auto text-slate-500 hover:text-white shrink-0" onClick=${() => setShowNote(!showNote)} title="why this basis">ⓘ</button>` : null}
      </div>
      ${showNote ? html`<div class="mt-1.5 text-[11px] text-slate-400 leading-snug">${m.note}</div>` : null}
    </div>`;
}

// ── hero: health tile + KPI strip ────────────────────────────────────────────
function HealthTile({ health, weeks }) {
  const pct = health.pct;
  const t = pct == null ? TONE.na : (pct >= 70 ? TONE.green : (pct >= 50 ? TONE.yellow : TONE.red));
  const tally = health.tally || {};
  const first = (health.series || []).find(isNum);
  const drift = (isNum(first) && isNum(pct)) ? pct - first : null;
  return html`
    <div class="rounded-xl border ${t.border} ${t.bg} p-4 flex items-center gap-5">
      <div>
        <div class="text-[10px] uppercase tracking-widest text-slate-400">Funnel health</div>
        <div class="text-4xl font-semibold ${t.text}">${pct == null ? '—' : pct.toFixed(0) + '%'}</div>
        <div class="text-[12px] text-slate-400 mt-0.5">${health.green}/${health.scored} scored metrics green</div>
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-slate-300"><${Spark} series=${health.series} verdicts=${(health.series || []).map(v => v == null ? 'na' : (v >= 70 ? 'green' : (v >= 50 ? 'yellow' : 'red')))} w=${260} h=${44}/></div>
        <div class="flex items-center gap-3 text-[11px] font-mono mt-1">
          <span class="text-emerald-300">● ${tally.green || 0}</span>
          <span class="text-amber-300">● ${tally.yellow || 0}</span>
          <span class="text-rose-300">● ${tally.red || 0}</span>
          ${drift != null ? html`<span class="ml-auto ${drift < -10 ? 'text-rose-300' : 'text-slate-400'}">${drift > 0 ? '+' : ''}${drift.toFixed(0)} pts since ${weeks[0] ? shortDate(weeks[0].start) : 'week 1'}</span>` : null}
        </div>
      </div>
    </div>`;
}

function Kpi({ m, mode }) {
  const t = tone(m.verdict);
  const delta = mode === 'wow' ? m.wow_pct : m.vs_median_pct;
  return html`
    <div class="rounded-xl border border-edge bg-panel p-3">
      <div class="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-500">
        <span class="h-1.5 w-1.5 rounded-full ${t.dot}"></span>${m.label}
      </div>
      <div class="mt-1 text-xl font-semibold ${m.verdict === 'red' ? 'text-rose-200' : 'text-white'}">${fmt(m.latest, m.unit)}</div>
      <div class="text-[11px] font-mono ${deltaTone(delta, m.direction)}">${sgn(delta)} <span class="text-slate-600">${mode === 'wow' ? 'WoW' : 'vs 12wk'}</span>
        ${isNum(m.ref) ? html`<span class="text-slate-500 ml-1.5">· ${m.basis === 'plan' ? 'plan' : 'ref'} ${fmt(m.ref, m.unit)}</span>` : null}</div>
    </div>`;
}

// ── alerts ───────────────────────────────────────────────────────────────────
// Reds only, longest streak first. A 6-week red is a condition; a 1-week red is
// a question. Capped so the page stays a scorecard, not a wall.
function Alerts({ alerts, mode }) {
  const [all, setAll] = useState(false);
  if (!alerts.length) return html`
    <div class="rounded-xl border border-emerald-400/25 bg-emerald-500/[0.06] px-4 py-3 text-[13px] text-emerald-200">Nothing red this week.</div>`;
  const show = all ? alerts : alerts.slice(0, 6);
  return html`
    <div class="rounded-xl border border-rose-400/25 bg-panel">
      <div class="px-4 py-2.5 flex items-center gap-2 border-b border-edge">
        <span class="text-white text-[14px] font-medium">Red this week</span>
        <span class="text-[11px] px-1.5 py-0.5 rounded-full border border-rose-400/25 text-rose-300">${alerts.length}</span>
        <span class="ml-auto text-[11px] text-slate-500">longest streak first</span>
      </div>
      <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-2 p-3">
        ${show.map(a => {
          const delta = mode === 'wow' ? a.wow_pct : a.vs_median_pct;
          return html`
            <div class="rounded-lg border border-rose-400/20 bg-rose-500/[0.05] p-2.5">
              <div class="flex items-center gap-2">
                <span class="text-[12.5px] text-white">${a.label}</span>
                <span class="ml-auto text-[10px] font-mono px-1.5 rounded ${a.streak >= 4 ? 'bg-rose-500/20 text-rose-200' : 'bg-white/5 text-slate-400'}">${a.streak}w red</span>
              </div>
              <div class="mt-1 flex items-baseline gap-2">
                <span class="text-[16px] font-semibold text-white">${fmt(a.latest, a.unit)}</span>
                <span class="text-[11px] font-mono text-rose-300">${sgn(delta)}</span>
                ${isNum(a.ref) ? html`<span class="text-[11px] text-slate-500">${a.basis === 'plan' ? 'plan' : (a.basis === 'benchmark' ? 'bar' : 'median')} ${fmt(a.ref, a.unit)}</span>` : null}
              </div>
              <div class="text-[10px] text-slate-500 mt-0.5">${a.section}${a.note ? ' · ' + a.note : ''}</div>
            </div>`;
        })}
      </div>
      ${alerts.length > 6 ? html`
        <button class="w-full text-[11px] text-slate-400 hover:text-white py-2 border-t border-edge" onClick=${() => setAll(!all)}>
          ${all ? '▾ show fewer' : `▸ ${alerts.length - 6} more`}
        </button>` : null}
    </div>`;
}

// ── movers + correlations ────────────────────────────────────────────────────
function Movers({ movers }) {
  if (!movers.length) return null;
  return html`
    <div class="rounded-xl border border-edge bg-panel">
      <div class="px-4 py-2.5 border-b border-edge"><span class="text-white text-[14px] font-medium">Biggest moves</span>
        <span class="text-[11px] text-slate-500 ml-2">vs trailing 12-week median</span></div>
      <div class="divide-y divide-edge/60">
        ${movers.map(m => html`
          <div class="px-4 py-2 flex items-center gap-3 text-[12.5px]">
            <span class="h-1.5 w-1.5 rounded-full ${tone(m.verdict).dot}"></span>
            <span class="text-slate-200 flex-1 min-w-0 truncate">${m.label}<span class="text-slate-600 ml-1.5 text-[10px]">${m.section}</span></span>
            <span class="font-mono text-white">${fmt(m.latest, m.unit)}</span>
            <span class="font-mono text-slate-500 text-[11px] w-16 text-right">${fmt(m.median, m.unit)}</span>
            <span class="font-mono w-16 text-right ${deltaTone(m.vs_median_pct, m.direction)}">${sgn(m.vs_median_pct, 0)}</span>
          </div>`)}
      </div>
    </div>`;
}

function Correlations({ corrs }) {
  const [open, setOpen] = useState(null);
  return html`
    <div class="rounded-xl border border-edge bg-panel">
      <div class="px-4 py-2.5 border-b border-edge">
        <span class="text-white text-[14px] font-medium">Correlations</span>
        <span class="text-[11px] text-slate-500 ml-2">Pearson r over the displayed weeks · a null result is still a finding</span>
      </div>
      <div class="divide-y divide-edge/60">
        ${corrs.map(c => {
          const r = c.r;
          const cls = r == null ? 'text-slate-500' : (Math.abs(r) >= 0.7 ? 'text-white' : (Math.abs(r) >= 0.4 ? 'text-slate-300' : 'text-slate-500'));
          const isOpen = open === c.id;
          return html`
            <div class="px-4 py-2">
              <button class="w-full text-left flex items-center gap-3 text-[12.5px]" onClick=${() => setOpen(isOpen ? null : c.id)}>
                <span class="font-mono w-14 ${cls}">${r == null ? '—' : (r > 0 ? '+' : '') + r.toFixed(2)}</span>
                <span class="text-slate-200 flex-1 min-w-0 truncate">${c.a} <span class="text-slate-600">×</span> ${c.b}</span>
                <span class="text-[10px] font-mono text-slate-500 shrink-0">${c.strength || (c.split_at != null ? 'pre / post split' : (c.n ? `n=${c.n}` : 'no data'))}${c.strength && c.n ? ` · n=${c.n}` : ''}</span>
              </button>
              ${isOpen ? html`
                <div class="mt-1.5 ml-[4.25rem] text-[11.5px] text-slate-400 leading-snug">
                  ${c.question}
                  ${c.reading ? html`<div class="text-slate-500 mt-0.5">${c.reading}</div>` : null}
                  ${c.split_at != null ? html`<div class="text-slate-500 mt-0.5">Regime split at week ${c.split_at + 1} of the window.</div>` : null}
                </div>` : null}
            </div>`;
        })}
      </div>
    </div>`;
}

// ── section metadata ─────────────────────────────────────────────────────────
// Order is funnel order: top → bottom, then the channels that feed it.
const SECTIONS = [
  ['Paid reach', 'Spend, impressions, reach, impression share — how much demand we are buying'],
  ['Paid engagement', 'Whether the buying lands: clicks, CTR, CPC'],
  ['Site traffic', 'GA4 sessions and quality of visit'],
  ['Product engagement', 'Do they look at product, and do they add it'],
  ['Cart & checkout', 'Cart → checkout → purchase mechanics'],
  ['Conversion & revenue', 'The outcome: revenue vs the model, orders, CVR by device, AOV'],
  ['Paid efficiency', 'ROAS vs the derived bars (never a fixed target), cost per order, CAC'],
  ['Email', 'Klaviyo campaigns + flows — revenue from metric aggregates, rates from campaign reports'],
  ['SMS', 'Same, SMS channel'],
  ['Owned total', 'Email + SMS share of gross revenue — the insulation from paid'],
  ['Organic', 'Search Console — clicks, impressions, position, non-brand capture'],
  ['Retention & ops', 'Repeat share (Shopify, account-age proxy)'],
];

function MetricSection({ name, subtitle, rows, mode, defaultOpen }) {
  if (!rows || !rows.length) return null;
  const c = { green: 0, yellow: 0, red: 0 };
  rows.forEach(r => { if (c[r.verdict] != null) c[r.verdict]++; });
  const scored = c.green + c.yellow + c.red;
  const meta = scored ? `${c.green}g · ${c.yellow}y · ${c.red}r` : 'context only';
  return html`
    <${Section} id=${'eh_' + name.toLowerCase().replace(/[^a-z]+/g, '_')} title=${name} subtitle=${subtitle}
      count=${`${rows.length}`} tone=${c.red ? 'text-rose-300' : (c.yellow ? 'text-amber-300' : 'text-emerald-300')}
      meta=${meta} defaultOpen=${defaultOpen}>
      <div class="p-3 grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2">
        ${rows.map(m => html`<${MetricCard} m=${m} mode=${mode} key=${m.key}/>`)}
      </div>
    </${Section}>`;
}

// ── view ─────────────────────────────────────────────────────────────────────
export function EcommHealth() {
  const s = useStore();
  const d = s.ecomm;
  const [mode, setMode] = useState(() => { try { return localStorage.getItem('hm_eh_mode') || 'median'; } catch { return 'median'; } });
  const pick = m => { setMode(m); try { localStorage.setItem('hm_eh_mode', m); } catch {} };

  if (!d) {
    return html`
      <div class="rounded-xl border border-edge bg-panel p-10 text-center text-slate-400">
        No scorecard yet. Run
        <code class="font-mono text-slate-300">TZ="America/Chicago" python3 Scripts/ecomm_health_scorecard.py</code>
        to write <code class="font-mono text-slate-300">data/ecomm_health_scorecard.json</code>.
      </div>`;
  }

  const health = d.health || {};
  const weeks = (d.window && d.window.weeks) || [];
  const last = weeks[weeks.length - 1];
  const sources = d.sources || {};
  const degraded = Object.entries(sources).filter(([, v]) => !v.ok);
  const notes = Object.entries(sources).filter(([, v]) => v.ok && v.note);
  const ue = d.unit_economics || {};
  const gen = d.generated ? new Date(d.generated).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
  const alerts = d.alerts || [];
  const kpis = d.kpis || [];

  const askAll = mkAsk('ecomm funnel health',
    `Week of ${last ? shortDate(last.start) + '–' + shortDate(last.end) : '—'}: ${health.green}/${health.scored} scored metrics green (${health.pct}%). ` +
    `Red: ${alerts.slice(0, 8).map(a => `${a.label} ${fmt(a.latest, a.unit)} (${a.streak}w red, ${sgn(a.vs_median_pct)} vs 12wk median)`).join('; ')}. ` +
    `KPIs: ${kpis.map(k => `${k.label} ${fmt(k.latest, k.unit)} [${k.verdict}]`).join(', ')}. ` +
    `Bars: break-even MER ${ue.break_even_mer}, scale gate ${ue.scale_gate_mer}.`);

  return html`
    <div class="max-w-[1500px] space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div class="text-[12px] text-slate-500">
          Week of <span class="text-slate-300">${last ? `${shortDate(last.start)} – ${shortDate(last.end)}` : '—'}</span>
          · updated ${gen} CT · ${d.window ? d.window.display_weeks : 12} weeks shown, ${d.window ? d.window.pulled_weeks : 16} pulled
          · model ${d.model && d.model.file ? d.model.file.replace(/^HM_Model_Working_/, '').replace(/\.xlsx$/, '') : (d.model && d.model.version != null ? 'V' + d.model.version : '—')}
          · bars ${ue.break_even_mer ? `BE ${(+ue.break_even_mer).toFixed(2)} / gate ${(+ue.scale_gate_mer).toFixed(2)}` : '—'}
        </div>
        <div class="flex items-center gap-2">
          <div class="flex rounded-lg border border-edge overflow-hidden text-[11px]">
            ${[['median', 'vs 12wk median'], ['wow', 'Week over week']].map(([id, label]) => html`
              <button class="px-2.5 py-1 ${mode === id ? 'bg-panel2 text-white' : 'text-slate-400 hover:text-white'}" onClick=${() => pick(id)}>${label}</button>`)}
          </div>
          <${AskButton} prompt=${askAll} class="h-7 w-7 grid place-items-center rounded-md text-slate-400 hover:text-white hover:bg-white/10"/>
        </div>
      </div>

      ${degraded.length ? html`
        <div class="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-[13px] text-amber-200">
          Partial data — ${degraded.map(([k, v]) => `${k} (${(v.error || 'down').slice(0, 80)})`).join('; ')}.
          Those metrics are blank this week; the prior snapshot's numbers were not carried forward.
        </div>` : null}
      ${notes.length ? html`
        <div class="text-[11.5px] text-slate-500 px-1">${notes.map(([k, v]) => `${k}: ${v.note}`).join(' · ')}</div>` : null}

      <${HealthTile} health=${health} weeks=${weeks}/>

      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        ${kpis.map(k => html`<${Kpi} m=${k} mode=${mode} key=${k.key}/>`)}
      </div>

      <${Alerts} alerts=${alerts} mode=${mode}/>

      <div class="grid lg:grid-cols-2 gap-4">
        <${Movers} movers=${d.movers || []}/>
        <${Correlations} corrs=${d.correlations || []}/>
      </div>

      ${SECTIONS.map(([name, sub], i) => html`
        <${MetricSection} name=${name} subtitle=${sub} rows=${(d.sections || {})[name]} mode=${mode}
          defaultOpen=${i < 7} key=${name}/>`)}

      <div class="rounded-xl border border-edge bg-panel px-4 py-3 text-[12px] text-slate-500">
        <span class="text-slate-300">Market backdrop</span> ·
        ${d.market_conditions && d.market_conditions.category_interest_trends && Object.keys(d.market_conditions.category_interest_trends).length
          ? 'Google Trends category-interest index loaded (context, not scored).'
          : html`No Google Trends index loaded — side-load <code class="font-mono">data/trends_ecomm.json</code> to enable the seasonal read. Nothing here is scored on it.`}
      </div>
    </div>`;
}
