// Ecomm Health — the weekly full-funnel red/yellow/green scorecard.
//
// Reads data/ecomm_health_scorecard.json, written Monday 8am CT by
// Scripts/ecomm_health_scorecard.py (Triple Whale REST, Meta + Google Ads direct
// APIs, GA4, GSC, Shopify, Klaviyo, side-loaded Google Trends; targets from the
// working model and hm_unit_economics.py), plus data/ecomm_health_diagnosis.json,
// the findings the Monday run writes. Every verdict is computed in the feeder —
// this view only renders, so the page and the JSON can never disagree about a
// colour. Layout follows the Stix scorecard: metric rows × week columns, cells
// coloured by that week's verdict, trend + WoW + scored-against on the right.
// Design + deviations: Doc/Engineering/HM_Ecomm_Health_Scorecard_Spec.md
import { html } from '../html.js';
import { useState } from 'preact/hooks';
import { useStore } from '../state.js';
import { mkAsk } from '../lib/prompts.js';
import { userAv } from '../lib/avatars.js';
import { AskButton } from '../components/AskButton.js';
import { Section } from '../components/Section.js';

// ── formatting ───────────────────────────────────────────────────────────────
const isNum = n => n != null && !isNaN(+n);
const kfmt = n => Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : (Math.abs(n) >= 10000 ? Math.round(n / 1000) + 'K' : Math.round(n).toLocaleString());
function fmt(v, unit, compact = false) {
  if (!isNum(v)) return '—';
  const n = +v;
  switch (unit) {
    case '$': return compact && Math.abs(n) >= 10000 ? '$' + kfmt(n) : (Math.abs(n) >= 1000 ? '$' + Math.round(n).toLocaleString() : '$' + n.toFixed(2));
    case '%': return n.toFixed(Math.abs(n) < 10 ? 2 : 1) + '%';
    case 'x': return n.toFixed(2) + 'x';
    case 's': return Math.round(n) + 's';
    default: return compact ? kfmt(n) : (Math.abs(n) >= 100 ? Math.round(n).toLocaleString() : n.toFixed(2).replace(/\.?0+$/, ''));
  }
}
const sgn = (n, d = 1) => !isNum(n) ? '—' : ((+n > 0 ? '+' : '') + (+n).toFixed(d) + '%');
const shortDate = iso => { const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };

// Verdict → colours. `na` and `ctx` are deliberately neutral: not-scored is not
// "fine", and the tally never counts them (spec's one hard rule).
const TONE = {
  green: { dot: 'bg-emerald-400', text: 'text-emerald-300', border: 'border-emerald-400/25', bg: 'bg-emerald-500/10', cell: 'bg-emerald-500/[0.13] text-emerald-200', label: 'On track' },
  yellow: { dot: 'bg-amber-400', text: 'text-amber-300', border: 'border-amber-400/25', bg: 'bg-amber-500/10', cell: 'bg-amber-500/[0.14] text-amber-200', label: 'Watch' },
  red: { dot: 'bg-rose-400', text: 'text-rose-300', border: 'border-rose-400/25', bg: 'bg-rose-500/10', cell: 'bg-rose-500/[0.16] text-rose-200', label: 'Off' },
  na: { dot: 'bg-slate-600', text: 'text-slate-500', border: 'border-edge', bg: 'bg-white/[0.02]', cell: 'text-slate-500', label: 'Not scored' },
  ctx: { dot: 'bg-sky-500/60', text: 'text-sky-300/80', border: 'border-sky-400/20', bg: 'bg-sky-500/[0.06]', cell: 'text-slate-300', label: 'Context' },
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
// Trend line colour: direction-aware, from the OLS %/wk the feeder computes.
function trendTone(pct, direction) {
  if (!isNum(pct) || direction === 'band' || Math.abs(pct) < 1) return '#94a3b8';
  const good = direction === 'down' ? pct < 0 : pct > 0;
  return good ? '#34d399' : '#fb7185';
}

const SOURCE = {
  'Paid reach': 'Triple Whale · Meta · Google Ads', 'Paid engagement': 'Meta · Google Ads', 'Site traffic': 'GA4',
  'Product engagement': 'GA4', 'Cart & checkout': 'GA4', 'Conversion & revenue': 'Triple Whale · GA4 · model',
  'Paid efficiency': 'Triple Whale · unit economics', 'Email': 'Klaviyo', 'SMS': 'Klaviyo', 'Owned total': 'Klaviyo ÷ Triple Whale',
  'Organic': 'Search Console · Google Ads', 'Retention & ops': 'Shopify', 'Market conditions': 'Google Trends (side-loaded)',
  'Buyer journey': 'Shopify customerJourneySummary',
};

// ── sparkline (trend column) ─────────────────────────────────────────────────
function Trend({ series, color, w = 84, h = 22 }) {
  const pts = (series || []).map((v, i) => [i, isNum(v) ? +v : null]).filter(p => p[1] != null);
  if (pts.length < 2) return html`<svg width=${w} height=${h}></svg>`;
  const vals = pts.map(p => p[1]);
  let lo = Math.min(...vals), hi = Math.max(...vals); if (hi === lo) hi = lo + 1;
  const n = (series || []).length;
  const x = i => 2 + (i / Math.max(n - 1, 1)) * (w - 4);
  const y = v => h - 2 - ((v - lo) / (hi - lo)) * (h - 4);
  const d = pts.map((p, k) => (k ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  return html`
    <svg width=${w} height=${h} viewBox=${`0 0 ${w} ${h}`} class="shrink-0">
      <path d=${d} fill="none" stroke=${color} stroke-width="1.4" stroke-linejoin="round"/>
      <circle cx=${x(last[0])} cy=${y(last[1])} r="1.8" fill=${color}/>
    </svg>`;
}

// ── section table ────────────────────────────────────────────────────────────
// One row per metric; one cell per displayed week coloured by THAT week's verdict,
// so a red row reads as "red since when", not just "red now".
function MetricRow({ m, weeks, mode }) {
  const [open, setOpen] = useState(false);
  const delta = mode === 'wow' ? m.wow_pct : m.vs_median_pct;
  const [bLabel, bCls] = { plan: ['Plan', 'text-indigo-300'], benchmark: ['Benchmark', 'text-sky-300'], baseline: ['12wk median', 'text-slate-400'], context: ['Context', 'text-slate-500'] }[m.basis] || ['', ''];
  const refTxt = m.basis === 'context' ? 'shown, not scored'
    : (m.basis === 'baseline' ? `${bLabel} · ${fmt(m.median, m.unit, true)}`
      : (isNum(m.ref) ? `${bLabel} · ${m.ref_label && m.ref_label.includes('≤') ? '≤' : (m.basis === 'benchmark' ? '≥' : '')}${fmt(m.ref, m.unit, true)}` : (m.ref_label || bLabel)));
  return html`
    <tr class="border-b border-edge/60 ${m.verdict === 'red' ? 'bg-rose-500/[0.02]' : ''}">
      <td class="py-1.5 pr-2 pl-3 sticky left-0 bg-panel z-[1] min-w-[190px]">
        <div class="flex items-center gap-1.5">
          <span class="h-1.5 w-1.5 rounded-full shrink-0 ${tone(m.verdict).dot}"></span>
          <span class="text-[12.5px] text-slate-200 leading-tight">${m.label}</span>
          ${m.note ? html`<button class="text-[10px] text-slate-500 hover:text-white" title=${m.note} onClick=${() => setOpen(!open)}>ⓘ</button>` : null}
        </div>
        ${open && m.note ? html`<div class="text-[10.5px] text-slate-500 leading-snug mt-0.5 pr-2">${m.note}</div>` : null}
      </td>
      ${(m.series || []).map((v, i) => html`
        <td class="py-1.5 px-1 text-center font-mono text-[11.5px] ${tone((m.verdicts || [])[i]).cell} ${i === m.series.length - 1 ? 'font-semibold' : ''}"
            title=${`${weeks[i] ? shortDate(weeks[i].start) : ''}: ${fmt(v, m.unit)}`}>${fmt(v, m.unit, true)}</td>`)}
      <td class="py-1 px-2 text-slate-300"><${Trend} series=${m.series} color=${trendTone(m.trend_pct_per_week, m.direction)}/></td>
      <td class="py-1.5 px-2 text-right font-mono text-[11.5px] ${deltaTone(delta, m.direction)}">${sgn(delta)}</td>
      <td class="py-1.5 pl-2 pr-3 text-[10.5px] font-mono ${bCls} whitespace-nowrap">${refTxt}</td>
    </tr>`;
}

function Tally({ c }) {
  return html`<span class="inline-flex gap-1 align-middle ml-1">
    ${[['green', 'bg-emerald-600'], ['yellow', 'bg-amber-600'], ['red', 'bg-rose-600']].map(([k, cls]) => c[k] ? html`<span class="text-[10px] font-mono text-white px-1.5 rounded ${cls}">${c[k]}</span>` : null)}
  </span>`;
}

function MetricSection({ name, subtitle, rows, weeks, mode, defaultOpen }) {
  if (!rows || !rows.length) return null;
  const c = { green: 0, yellow: 0, red: 0 };
  rows.forEach(r => { if (c[r.verdict] != null) c[r.verdict]++; });
  const scored = c.green + c.yellow + c.red;
  return html`
    <${Section} id=${'eh_' + name.toLowerCase().replace(/[^a-z]+/g, '_')}
      title=${html`<span>${name} <${Tally} c=${c}/></span>`}
      subtitle=${subtitle} meta=${SOURCE[name] || ''} defaultOpen=${defaultOpen}
      count=${scored ? null : 'context'} tone="text-slate-500">
      <div class="overflow-x-auto">
        <table class="w-full text-[12px] border-collapse">
          <thead>
            <tr class="text-[9.5px] uppercase tracking-widest text-slate-500 border-b border-edge">
              <th class="text-left font-normal py-2 pl-3 sticky left-0 bg-panel z-[1]">Metric</th>
              ${weeks.map((w, i) => html`<th class="font-normal py-2 px-1 text-center whitespace-nowrap ${i === weeks.length - 1 ? 'text-white' : ''}">${shortDate(w.start)}</th>`)}
              <th class="font-normal py-2 px-2 text-left">Trend</th>
              <th class="font-normal py-2 px-2 text-right">${mode === 'wow' ? 'WoW' : 'vs 12wk'}</th>
              <th class="font-normal py-2 pl-2 pr-3 text-left">Scored against</th>
            </tr>
          </thead>
          <tbody>${rows.map(m => html`<${MetricRow} m=${m} weeks=${weeks} mode=${mode} key=${m.key}/>`)}</tbody>
        </table>
      </div>
    </${Section}>`;
}

// ── §2 demand shape chart ────────────────────────────────────────────────────
// Three series at wildly different volumes (Trends 0-100, dollars in the tens of
// thousands) indexed to 100 at the first week, so "are we moving proportionally"
// is a readable question. Hover a point for the raw figure.
const DS = { category: ['Category demand', '#94a3b8', '4 3'], brand: ['Brand demand', '#fb7185', ''], revenue: ['Revenue', '#34d399', ''] };
function DemandChart({ ds }) {
  const [hover, setHover] = useState(null);
  if (!ds || !ds.weeks || !ds.weeks.length) return null;
  const W = 900, H = 260, L = 40, R = 16, T = 14, B = 34;
  const keys = Object.keys(DS).filter(k => (ds.indexed[k] || []).some(isNum));
  const all = keys.flatMap(k => ds.indexed[k].filter(isNum));
  if (!all.length) return null;
  const lo = Math.floor(Math.min(...all, 100) / 10) * 10 - 10, hi = Math.ceil(Math.max(...all, 100) / 10) * 10 + 10;
  const n = ds.weeks.length;
  const x = i => L + (i / Math.max(n - 1, 1)) * (W - L - R);
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = []; for (let v = lo; v <= hi; v += 20) ticks.push(v);
  const path = s => s.map((v, i) => isNum(v) ? [i, v] : null).filter(Boolean).map((p, k) => (k ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join(' ');
  const rawFmt = (k, i) => {
    const r = (ds.raw[k] || [])[i];
    if (!isNum(r)) return '—';
    return k === 'revenue' ? '$' + Math.round(r).toLocaleString() : (+r).toFixed(0);
  };
  const bw = (W - L - R) / n;
  return html`
    <div class="relative">
      <svg viewBox=${`0 0 ${W} ${H}`} class="w-full h-auto text-slate-500" onMouseLeave=${() => setHover(null)}>
        ${ticks.map(v => html`<g>
          <line x1=${L} x2=${W - R} y1=${y(v)} y2=${y(v)} stroke="currentColor" stroke-opacity=${v === 100 ? 0.45 : 0.12} stroke-dasharray=${v === 100 ? '' : '2 4'}/>
          <text x=${L - 6} y=${y(v) + 3.5} text-anchor="end" font-size="10" fill="currentColor">${v}</text></g>`)}
        ${ds.weeks.map((w, i) => html`<text x=${x(i)} y=${H - B + 16} text-anchor="middle" font-size="10" fill="currentColor">${shortDate(w)}</text>`)}
        ${keys.map(k => html`<path d=${path(ds.indexed[k])} fill="none" stroke=${DS[k][1]} stroke-width="2" stroke-dasharray=${DS[k][2]} stroke-linejoin="round"/>`)}
        ${keys.map(k => ds.indexed[k].map((v, i) => isNum(v) ? html`<circle cx=${x(i)} cy=${y(v)} r=${hover === i ? 4 : 2.6} fill=${DS[k][1]}/>` : null))}
        ${ds.weeks.map((w, i) => html`<rect x=${x(i) - bw / 2} y=${T} width=${bw} height=${H - T - B} fill="transparent" onMouseEnter=${() => setHover(i)}/>`)}
        ${hover != null ? html`<line x1=${x(hover)} x2=${x(hover)} y1=${T} y2=${H - B} stroke="currentColor" stroke-opacity="0.35"/>` : null}
      </svg>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[11px]">
        ${keys.map(k => html`<span class="inline-flex items-center gap-1.5 text-slate-300"><span class="inline-block w-4 h-0.5" style=${`background:${DS[k][1]}`}></span>${DS[k][0]}</span>`)}
        <span class="ml-auto font-mono text-slate-500 min-h-[1em]">
          ${hover != null ? `${shortDate(ds.weeks[hover])} · ${keys.map(k => `${DS[k][0].split(' ')[0]} ${ds.indexed[k][hover] != null ? ds.indexed[k][hover].toFixed(0) : '—'} (${rawFmt(k, hover)})`).join(' · ')}` : 'hover for raw figures'}
        </span>
      </div>
    </div>`;
}

function DemandShape({ ds }) {
  if (!ds || !ds.weeks) return null;
  const r = (v) => v == null ? '—' : (v > 0 ? '+' : '') + (+v).toFixed(2);
  const first = k => (ds.indexed[k] || []).find(isNum), last = k => [...(ds.indexed[k] || [])].reverse().find(isNum);
  const chg = k => (isNum(first(k)) && isNum(last(k))) ? Math.round(last(k) - first(k)) : null;
  const hasTrends = (ds.indexed.category || []).some(isNum);
  return html`
    <${Section} id="eh_demand" title="Category demand vs brand demand"
      subtitle="Is the market moving, or are we? Indexed to 100 at the first week."
      meta=${ds.trends_pulled ? `Trends pulled ${ds.trends_pulled}` : ''} defaultOpen=${true}>
      <div class="p-4 space-y-3">
        ${hasTrends ? html`
          <div class="grid sm:grid-cols-3 gap-2 text-[12px]">
            ${['category', 'brand', 'revenue'].map(k => html`
              <div class="rounded-lg border border-edge bg-white/[0.02] px-3 py-2">
                <div class="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-500"><span class="inline-block w-2 h-2 rounded-full" style=${`background:${DS[k][1]}`}></span>${DS[k][0]}</div>
                <div class="mt-0.5 flex items-baseline gap-2">
                  <span class="text-xl font-semibold text-white">${isNum(last(k)) ? last(k).toFixed(0) : '—'}</span>
                  <span class="font-mono text-[11px] ${chg(k) == null ? 'text-slate-500' : (chg(k) < 0 ? 'text-rose-300' : 'text-emerald-300')}">${chg(k) == null ? '' : (chg(k) > 0 ? '+' : '') + chg(k) + ' pts'}</span>
                </div>
                <div class="text-[10.5px] text-slate-500 leading-snug">${(ds.sources || {})[k] || ''}</div>
              </div>`)}
          </div>
          <${DemandChart} ds=${ds}/>
          <div class="text-[11.5px] text-slate-400 leading-relaxed">
            Brand × category <span class="font-mono text-slate-200">r ${r(ds.r_brand_category)}</span> ·
            brand × revenue <span class="font-mono text-slate-200">r ${r(ds.r_brand_revenue)}</span> ·
            brand × paid spend <span class="font-mono text-slate-200">r ${r(ds.r_brand_spend)}</span> ·
            category × revenue <span class="font-mono text-slate-200">r ${r(ds.r_category_revenue)}</span>.
            If brand tracks category, the market moved. If brand tracks spend and falls further than category, we are buying our own brand demand and it stops when the media stops.
          </div>`
        : html`<div class="text-[12px] text-slate-500">No Google Trends index loaded — side-load <code class="font-mono">data/trends_ecomm.json</code> (pulled through a browser session; the endpoint 429s every datacenter IP).</div>`}
      </div>
    </${Section}>`;
}

// ── hero: health tile + KPI strip ────────────────────────────────────────────
function HealthSpark({ series, w = 260, h = 44 }) {
  const pts = (series || []).map((v, i) => [i, isNum(v) ? +v : null]).filter(p => p[1] != null);
  if (pts.length < 2) return null;
  const n = (series || []).length;
  const x = i => 3 + (i / Math.max(n - 1, 1)) * (w - 6), y = v => h - 3 - (v / 100) * (h - 6);
  const d = pts.map((p, k) => (k ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join(' ');
  const c = v => v >= 70 ? '#34d399' : (v >= 50 ? '#fbbf24' : '#fb7185');
  return html`<svg width=${w} height=${h} viewBox=${`0 0 ${w} ${h}`}>
    <line x1="0" x2=${w} y1=${y(50)} y2=${y(50)} stroke="currentColor" stroke-opacity="0.15" stroke-dasharray="2 3"/>
    <path d=${d} fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1.25"/>
    ${pts.map((p, i) => html`<circle cx=${x(p[0])} cy=${y(p[1])} r=${i === pts.length - 1 ? 2.6 : 1.8} fill=${c(p[1])}/>`)}
  </svg>`;
}

function HealthTile({ health, weeks }) {
  const pct = health.pct;
  const t = pct == null ? TONE.na : (pct >= 70 ? TONE.green : (pct >= 50 ? TONE.yellow : TONE.red));
  const tally = health.tally || {};
  const first = (health.series || []).find(isNum);
  const drift = (isNum(first) && isNum(pct)) ? pct - first : null;
  return html`
    <div class="rounded-xl border ${t.border} ${t.bg} p-4 flex items-center gap-5 flex-wrap">
      <div>
        <div class="text-[10px] uppercase tracking-widest text-slate-400">Funnel health</div>
        <div class="text-4xl font-semibold ${t.text}">${pct == null ? '—' : pct.toFixed(0) + '%'}</div>
        <div class="text-[12px] text-slate-400 mt-0.5">${health.green}/${health.scored} scored metrics green</div>
      </div>
      <div class="flex-1 min-w-[260px]">
        <div class="text-slate-300"><${HealthSpark} series=${health.series}/></div>
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
        ${isNum(m.ref) ? html`<span class="text-slate-500 ml-1.5">· ${m.basis === 'plan' ? 'plan' : 'ref'} ${fmt(m.ref, m.unit, true)}</span>` : null}</div>
    </div>`;
}

// ── alerts ───────────────────────────────────────────────────────────────────
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
                ${isNum(a.ref) ? html`<span class="text-[11px] text-slate-500">${a.basis === 'plan' ? 'plan' : (a.basis === 'benchmark' ? 'bar' : 'median')} ${fmt(a.ref, a.unit, true)}</span>` : null}
              </div>
              <div class="text-[10px] text-slate-500 mt-0.5">${a.section}</div>
            </div>`;
        })}
      </div>
      ${alerts.length > 6 ? html`
        <button class="w-full text-[11px] text-slate-400 hover:text-white py-2 border-t border-edge" onClick=${() => setAll(!all)}>
          ${all ? '▾ show fewer' : `▸ ${alerts.length - 6} more`}
        </button>` : null}
    </div>`;
}

// ── ATC decomposition + journey economics ────────────────────────────────────
// ATC rate = product views/session × ATC per product view. Both factors used to sit on
// benchmarks that never left green, so a falling ATC rate read as an unattributable site
// problem. This panel names which of the two moved: routing (did they reach a PDP) or
// persuasion (did the PDP close them).
function Decomposition({ dec, econ }) {
  const [horizon, setHorizon] = useState('vs_median');
  if (!dec && !(econ && econ.trackable_orders)) return null;
  const split = ((dec || {}).splits || []).find(s => s.horizon === horizon);
  const money = n => !isNum(n) ? '—' : '$' + Math.round(+n).toLocaleString();

  return html`
    <div class="rounded-xl border border-edge bg-panel">
      <div class="px-4 py-2.5 border-b border-edge flex items-center gap-2">
        <span class="text-white text-[14px] font-medium">Where the ATC rate moved</span>
        <span class="text-[11px] text-slate-500">${(dec || {}).identity || ''}</span>
        ${dec ? html`
          <div class="ml-auto flex rounded-md border border-edge overflow-hidden text-[10.5px]">
            ${[['vs_median', 'vs median'], ['wow', 'WoW']].map(([k, lab]) => html`
              <button key=${k} class="px-2 py-0.5 ${horizon === k ? 'bg-white/10 text-white' : 'text-slate-400'}"
                onClick=${() => setHorizon(k)}>${lab}</button>`)}
          </div>` : null}
      </div>

      ${split ? html`
        <div class="px-4 py-3">
          <div class="flex items-baseline gap-2 mb-2.5">
            <span class="text-[11px] text-slate-500">ATC rate</span>
            <span class="font-mono text-[15px] ${split.total_pct < 0 ? 'text-rose-300' : 'text-emerald-300'}">${sgn(split.total_pct)}</span>
          </div>
          ${split.terms.map(t => {
            // share_of_move can exceed 100% when the two factors move in opposite
            // directions — clamp the BAR, never the printed number.
            const w = Math.min(Math.abs(t.share_of_move), 100);
            return html`
              <div class="mb-2" key=${t.key}>
                <div class="flex items-baseline gap-2 text-[12px]">
                  <span class="text-slate-200">${t.label}</span>
                  <span class="text-[10.5px] text-slate-500">${t.meaning}</span>
                  <span class="ml-auto font-mono text-[11.5px] ${t.pct < 0 ? 'text-rose-300' : 'text-emerald-300'}">${sgn(t.pct)}</span>
                  <span class="font-mono text-[11px] text-slate-400 w-14 text-right">${t.share_of_move.toFixed(0)}%</span>
                </div>
                <div class="mt-1 h-1.5 rounded bg-white/5 overflow-hidden">
                  <div class="h-full ${t.share_of_move >= 0 ? 'bg-sky-400/60' : 'bg-amber-400/60'}" style="width:${w}%"></div>
                </div>
              </div>`;
          })}
          ${dec.reads ? html`<div class="text-[11.5px] text-slate-400 mt-2.5 leading-snug">${dec.reads}</div>` : null}
        </div>` : html`<div class="px-4 py-3 text-[12px] text-slate-500">Not enough weeks to split the move.</div>`}

      ${econ && econ.trackable_orders ? html`
        <div class="px-4 py-3 border-t border-edge">
          <div class="text-[11px] text-slate-500 mb-2">
            What the second visit costs · ${econ.trackable_orders.toLocaleString()} trackable orders,
            ${econ.window ? `${shortDate(econ.window.start)} – ${shortDate(econ.window.end)}` : ''}
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
            ${[['Closed on visit 1', isNum(econ.one_visit_pct) ? econ.one_visit_pct.toFixed(1) + '%' : '—', 'no return trip needed'],
               ['Revenue needing 2+', isNum(econ.multi_revenue_share) ? econ.multi_revenue_share.toFixed(1) + '%' : '—', 'of gross revenue'],
               ['Extra discount', isNum(econ.discount_gap_pp) ? sgn(econ.discount_gap_pp, 2).replace('%', 'pp') : '—', '2+ visit vs 1-visit'],
               ['Margin given up', money(econ.discount_cost_window), 'if the gap closed — upper bound']
              ].map(([lab, val, sub]) => html`
              <div key=${lab}>
                <div class="text-[10.5px] text-slate-500">${lab}</div>
                <div class="font-mono text-[15px] text-white">${val}</div>
                <div class="text-[10px] text-slate-600">${sub}</div>
              </div>`)}
          </div>
        </div>` : null}
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
            <span class="font-mono text-white">${fmt(m.latest, m.unit, true)}</span>
            <span class="font-mono text-slate-500 text-[11px] w-16 text-right">${fmt(m.median, m.unit, true)}</span>
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
                </div>` : null}
            </div>`;
        })}
      </div>
    </div>`;
}

// ── diagnosis ────────────────────────────────────────────────────────────────
// Written by the Monday run (data/ecomm_health_diagnosis.json), not derived here:
// findings are an argument, and an argument needs an author. Each carries the
// evidence rows it rests on and the person who owns the next move.
function Owner({ o }) {
  const name = { gabe: 'Gabe Coyne', collin: 'Collin Duff' }[o.person] || o.person;
  return html`
    <div class="flex items-center gap-2 rounded-lg border border-edge bg-white/[0.02] px-2.5 py-1.5">
      <span dangerouslySetInnerHTML=${{ __html: userAv(o.person, 24) }}></span>
      <div class="leading-tight"><div class="text-[12px] text-white">${name}</div><div class="text-[9.5px] font-mono uppercase tracking-wider text-slate-500">${o.role}</div></div>
    </div>`;
}

function Diagnosis({ dg, scorecardWeek }) {
  if (!dg || !dg.findings) return null;
  const stale = dg.week && scorecardWeek && dg.week.start !== scorecardWeek.start;
  return html`
    <${Section} id="eh_diagnosis" title="What's actually going wrong"
      subtitle=${dg.week ? `Diagnosis for the week of ${shortDate(dg.week.start)} – ${shortDate(dg.week.end)}` : ''}
      meta=${dg.generated ? 'written ' + new Date(dg.generated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''} defaultOpen=${true}>
      <div class="p-4 space-y-3">
        ${stale ? html`<div class="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-200">This diagnosis is from an earlier week than the scorecard above — the Monday run rewrites it.</div>` : null}
        ${dg.headline ? html`<p class="text-[13.5px] text-slate-200 leading-relaxed max-w-[900px]">${dg.headline}</p>` : null}
        ${dg.findings.map((f, i) => html`
          <div class="rounded-xl border border-edge bg-white/[0.015] p-4">
            <span class="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded ${i === 0 ? 'bg-rose-500/20 text-rose-200' : 'bg-white/5 text-slate-400'}">Finding ${i + 1} · ${f.tag}</span>
            <div class="mt-2 text-[15px] font-medium text-white leading-snug">${f.title}</div>
            <p class="mt-2 text-[13px] text-slate-300 leading-relaxed max-w-[900px]">${f.body}</p>
            ${f.do ? html`<div class="mt-2.5 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.06] px-3 py-2 text-[12.5px] text-emerald-100 max-w-[900px]"><span class="text-[10px] font-mono uppercase tracking-widest text-emerald-300 mr-2">Do</span>${f.do}</div>` : null}
            ${(f.evidence || []).length ? html`<div class="mt-2 text-[11px] font-mono text-slate-500 border-l-2 border-edge pl-2">Evidence — ${f.evidence.join('; ')}.</div>` : null}
            ${(f.owners || []).length ? html`
              <div class="mt-3 flex items-center gap-2 flex-wrap">
                <span class="text-[10px] font-mono uppercase tracking-widest text-slate-500 mr-1">${f.owners.length > 1 ? 'Owners' : 'Owner'}</span>
                ${f.owners.map(o => html`<${Owner} o=${o}/>`)}
              </div>` : null}
          </div>`)}
        ${(dg.closed || []).length ? html`
          <div class="rounded-lg border border-edge px-4 py-3">
            <div class="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1.5">Explanations closed</div>
            ${dg.closed.map(c => html`<div class="text-[12px] text-slate-400 leading-relaxed">— ${c}</div>`)}
          </div>` : null}
      </div>
    </${Section}>`;
}

// ── section metadata ─────────────────────────────────────────────────────────
const SECTIONS = [
  ['Paid reach', 'How much demand we are buying, and how hard it lands on the same people'],
  ['Paid engagement', 'Whether the impressions turn into clicks, and what a click costs'],
  ['Site traffic', 'Volume and quality of what actually arrives'],
  ['Product engagement', 'Do they reach a product, and do they add it'],
  ['Cart & checkout', 'Cart → checkout → purchase mechanics'],
  ['Conversion & revenue', 'The outcome: revenue vs the model, orders, CVR by device, AOV'],
  ['Paid efficiency', 'ROAS vs the derived bars (never a fixed target), cost per order, CAC'],
  ['Email', 'Campaigns + flows — revenue from metric aggregates, rates from campaign reports'],
  ['SMS', 'Same, SMS channel'],
  ['Owned total', 'Email + SMS share of gross revenue — the insulation from paid'],
  ['Organic', 'Search Console: clicks, impressions, position, brand vs non-brand'],
  ['Retention & ops', 'Repeat share (Shopify, account-age proxy)'],
  ['Buyer journey', 'Visits and days an order takes — zero-visit (CS/manual) orders excluded, 30-day attribution cap'],
  ['Market conditions', 'Google Trends — shown for context, never scored'],
];

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
  const dg = s.ecommDiag;

  const askAll = mkAsk('ecomm funnel health',
    `Week of ${last ? shortDate(last.start) + '–' + shortDate(last.end) : '—'}: ${health.green}/${health.scored} scored metrics green (${health.pct}%). ` +
    `Red: ${alerts.slice(0, 8).map(a => `${a.label} ${fmt(a.latest, a.unit)} (${a.streak}w red, ${sgn(a.vs_median_pct)} vs 12wk median)`).join('; ')}. ` +
    `KPIs: ${kpis.map(k => `${k.label} ${fmt(k.latest, k.unit)} [${k.verdict}]`).join(', ')}. ` +
    (dg && dg.headline ? `Current diagnosis: ${dg.headline} ` : '') +
    `Bars: break-even MER ${ue.break_even_mer}, scale gate ${ue.scale_gate_mer}.`);

  return html`
    <div class="max-w-[1600px] space-y-4">
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

      <${DemandShape} ds=${d.demand_shape}/>

      <${Alerts} alerts=${alerts} mode=${mode}/>

      <${Decomposition} dec=${d.decomposition} econ=${d.journey_economics}/>

      ${SECTIONS.map(([name, sub], i) => html`
        <${MetricSection} name=${name} subtitle=${sub} rows=${(d.sections || {})[name]} weeks=${weeks} mode=${mode}
          defaultOpen=${i < 7 || name === 'Market conditions'} key=${name}/>`)}

      <div class="grid lg:grid-cols-2 gap-4">
        <${Movers} movers=${d.movers || []}/>
        <${Correlations} corrs=${d.correlations || []}/>
      </div>

      <${Diagnosis} dg=${dg} scorecardWeek=${last}/>
    </div>`;
}
