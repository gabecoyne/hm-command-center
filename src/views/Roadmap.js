// Roadmap view — Product Roadmap (Gantt). Ported from the monolith's
// renderRoadmap. The heavy absolute-positioned track is built as one big HTML
// string and injected via dangerouslySetInnerHTML (exactly as the monolith set
// wrap.innerHTML); the filter chips and "Discuss roadmap" button are real
// Preact elements with onClick handlers.
import { html } from '../html.js';
import { useState } from 'preact/hooks';
import { useStore } from '../state.js';
import { esc } from '../lib/format.js';
import { mkAsk } from '../lib/prompts.js';
import { copyPrompt } from '../components/Toasts.js';
import { CHAT_SVG } from '../components/AskButton.js';

/* ===== Product Roadmap (Gantt) ===== */
const RM_STAGE_FB = { concept: { label: "Concept", color: "#64748b" }, design: { label: "Design", color: "#38bdf8" }, production: { label: "Production", color: "#f59e0b" }, shipping: { label: "Freight", color: "#818cf8" } };
const RM_MS_FB = { land: { label: "Lands", color: "#e2e8f0", glyph: "diamond" }, preorder: { label: "Pre-order opens", color: "#34d399", glyph: "diamond" }, preorder_ship: { label: "Pre-orders ship", color: "#818cf8", glyph: "diamond" }, launch: { label: "Ready to ship", color: "#fbbf24", glyph: "star" } };
const RM_STATUS = { concept: ["Concept", "bg-slate-500/15 text-slate-300 border-slate-400/20"], design: ["Design", "bg-sky-500/15 text-sky-300 border-sky-400/20"], production: ["Production", "bg-amber-500/15 text-amber-300 border-amber-400/20"], shipping: ["Freight", "bg-indigo-500/15 text-indigo-300 border-indigo-400/20"], transit: ["In transit", "bg-indigo-500/15 text-indigo-300 border-indigo-400/20"], live: ["Live", "bg-emerald-500/15 text-emerald-300 border-emerald-400/20"] };
const rmDay = s => new Date(String(s).slice(0, 10) + "T00:00:00");
const rmFom = d => new Date(d.getFullYear(), d.getMonth(), 1);
const rmAddM = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const rmFmt = s => { try { return rmDay(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" }); } catch { return s; } };
function rmMsMark(color, glyph, px, title) {
  const t = ' title="' + esc(title || "") + '"';
  if (glyph === "star") { return '<span' + t + ' style="position:absolute;left:' + px + 'px;top:50%;transform:translate(-50%,-50%);color:' + color + ';font-size:15px;line-height:1;z-index:20;text-shadow:0 1px 2px rgba(0,0,0,.6);cursor:default">★</span>'; }
  return '<span' + t + ' style="position:absolute;left:' + px + 'px;top:50%;width:12px;height:12px;background:' + color + ';transform:translate(-50%,-50%) rotate(45deg);border:1.5px solid rgba(10,12,14,.8);border-radius:2px;z-index:20;box-shadow:0 1px 3px rgba(0,0,0,.5);cursor:default"></span>';
}

export function Roadmap(props) {
  const s = useStore();
  const [rmFilter, setFilter] = useState("all");

  const rd = (typeof s.roadmap !== "undefined" && s.roadmap) ? s.roadmap : { products: [] };
  const stages = Object.assign({}, RM_STAGE_FB, rd.stages || {}), mtypes = Object.assign({}, RM_MS_FB, rd.milestoneTypes || {});
  const allProds = rd.products || [];
  // horizon from every date in the file
  const all = []; allProds.forEach(p => { (p.phases || []).forEach(ph => { if (ph.start) all.push(+rmDay(ph.start)); if (ph.end) all.push(+rmDay(ph.end)); }); (p.milestones || []).forEach(m => { if (m.date) all.push(+rmDay(m.date)); }); });
  if (!all.length) {
    return html`<div class="max-w-[1500px]"><div class="rounded-xl border border-edge bg-panel p-10 text-center text-slate-400" dangerouslySetInnerHTML=${{ __html: 'No roadmap data yet. Add products to <code>data/roadmap.json</code>.' }}></div></div>`;
  }
  const minD = new Date(Math.min.apply(null, all)), maxD = new Date(Math.max.apply(null, all));
  const h0 = rmFom(minD), h1 = rmAddM(rmFom(maxD), 1);
  const DAY = 86400000, PPD = 2.3, LABELW = 224, ROWH = 48;
  const totalDays = Math.max(1, (h1 - h0) / DAY), trackPx = Math.round(totalDays * PPD);
  const pxFor = ms => ((ms - (+h0)) / DAY) * PPD;
  // months
  const months = []; for (let m = new Date(h0); +m < +h1; m = rmAddM(m, 1)) { const nx = rmAddM(m, 1); months.push({ x: pxFor(+m), mid: (pxFor(+m) + pxFor(+nx)) / 2, label: m.toLocaleDateString(undefined, { month: "short" }), yr: m.getFullYear(), jan: m.getMonth() === 0 }); }
  const nowPx = pxFor(Date.now());
  // filter chips
  const counts = { all: allProds.length }; allProds.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });
  const chipDefs = [["all", "All"]].concat(Object.keys(RM_STATUS).filter(k => counts[k]).map(k => [k, RM_STATUS[k][0]]));
  // legend
  const legStage = Object.keys(stages).map(k => '<span class="inline-flex items-center gap-1.5"><span style="width:14px;height:10px;border-radius:2px;background:' + stages[k].color + ';display:inline-block"></span><span class="text-slate-300">' + esc(stages[k].label) + '</span></span>').join("");
  const legMs = Object.keys(mtypes).map(k => { const m = mtypes[k]; const mk = m.glyph === "star" ? '<span style="color:' + m.color + ';font-size:13px;line-height:1">★</span>' : '<span style="width:11px;height:11px;background:' + m.color + ';transform:rotate(45deg);border-radius:2px;display:inline-block"></span>'; return '<span class="inline-flex items-center gap-1.5">' + mk + '<span class="text-slate-300">' + esc(m.label) + '</span></span>'; }).join("");
  const draftBanner = rd.draft ? '<div class="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-[13px] text-amber-200">Draft dates — seeded so the timeline renders. Edit <code class="font-mono text-amber-100">data/roadmap.json</code> (or ask me) to replace with real dates.</div>' : '';
  const askPrompt = mkAsk("product roadmap", "Products in the pipeline: " + allProds.map(p => p.name + " (" + (p.status || "?") + ")").join(", ") + ".");
  // month header
  const gridlines = months.map(mo => '<div style="position:absolute;left:' + mo.x + 'px;top:0;bottom:0;width:1px;background:rgba(148,163,184,.08)"></div>').join("");
  const monthLabels = months.map(mo => '<div style="position:absolute;left:' + mo.mid + 'px;top:6px;transform:translateX(-50%);white-space:nowrap" class="text-[10px] uppercase tracking-wider ' + (mo.jan ? "text-slate-300 font-semibold" : "text-slate-500") + '">' + mo.label + (mo.jan ? " ’" + String(mo.yr).slice(2) : "") + '</div>').join("");
  const nowHeader = (nowPx >= 0 && nowPx <= trackPx) ? '<div style="position:absolute;left:' + nowPx + 'px;top:2px;transform:translateX(-50%)" class="text-[9px] font-mono text-emerald-300 whitespace-nowrap">today</div>' : '';
  // rows
  const prods = rmFilter === "all" ? allProds : allProds.filter(p => (p.status || "") === rmFilter);
  const rows = prods.map(p => {
    const bars = (p.phases || []).map(ph => { const st = stages[ph.stage] || { label: ph.stage, color: "#64748b" }; const x = pxFor(+rmDay(ph.start)); const w = Math.max(6, pxFor(+rmDay(ph.end)) - x); const showLbl = w > 52; return '<div title="' + esc(st.label + ": " + rmFmt(ph.start) + " → " + rmFmt(ph.end)) + '" style="position:absolute;left:' + x + 'px;width:' + w + 'px;top:50%;height:18px;transform:translateY(-50%);background:' + st.color + ';opacity:.9;border-radius:5px;overflow:hidden" class="flex items-center">' + (showLbl ? '<span style="color:rgba(10,12,14,.85);font-size:10px;font-weight:600;padding:0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(st.label) + '</span>' : '') + '</div>'; }).join("");
    const marks = (p.milestones || []).map(m => { const mt = mtypes[m.type] || { label: m.type, color: "#e2e8f0", glyph: "diamond" }; return rmMsMark(mt.color, mt.glyph || "diamond", pxFor(+rmDay(m.date)), mt.label + ": " + rmFmt(m.date)); }).join("");
    const stt = RM_STATUS[p.status] || ["—", "bg-white/5 text-slate-400 border-edge"];
    const label = '<div style="width:' + LABELW + 'px" class="shrink-0 pr-3 sticky left-0 z-10 bg-panel flex flex-col justify-center border-r border-edge/60"><div class="text-[13px] font-medium text-white truncate" title="' + esc(p.name) + '">' + esc(p.name) + '</div><div class="mt-0.5"><span class="text-[10px] px-1.5 py-0.5 rounded border ' + stt[1] + '">' + esc(stt[0]) + '</span></div></div>';
    const track = '<div style="position:relative;width:' + trackPx + 'px;height:' + ROWH + 'px" class="shrink-0">' + gridlines + ((nowPx >= 0 && nowPx <= trackPx) ? '<div style="position:absolute;left:' + nowPx + 'px;top:0;bottom:0;width:1.5px;background:rgba(52,211,153,.5);z-index:5"></div>' : '') + bars + marks + '</div>';
    return '<div class="flex items-stretch border-b border-edge/40 hover:bg-white/[.02]" style="height:' + ROWH + 'px">' + label + track + '</div>';
  }).join("");
  const headerRow = '<div class="flex items-stretch border-b border-edge sticky top-0 z-20 bg-panel"><div style="width:' + LABELW + 'px;height:34px" class="shrink-0 sticky left-0 z-10 bg-panel border-r border-edge/60"></div><div style="position:relative;width:' + trackPx + 'px;height:34px" class="shrink-0">' + gridlines + monthLabels + nowHeader + '</div></div>';

  // draftBanner + track container + legend as one injected string (mirrors wrap.innerHTML)
  const injected =
    draftBanner
    + '<div class="rounded-xl border border-edge bg-panel glow overflow-hidden">'
      + '<div class="overflow-x-auto">' + headerRow + '<div>' + rows + '</div></div>'
    + '</div>'
    + '<div class="mt-3 flex items-center gap-x-5 gap-y-2 flex-wrap text-[11px] px-1">' + legStage + '<span class="w-px h-3 bg-edge"></span>' + legMs + '</div>';

  return html`
    <div class="max-w-[1500px]">
      <div class="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div class="flex items-center gap-1 flex-wrap">
          ${chipDefs.map(([k, lbl]) => html`<button key=${k} onClick=${() => setFilter(k)} class=${'px-2.5 py-1 rounded-lg text-xs ' + (rmFilter === k ? "bg-panel2 text-white" : "text-slate-400 hover:text-white")}>${lbl} <span class="font-mono text-[10px] text-slate-500">${counts[k] || 0}</span></button>`)}
        </div>
        <button onClick=${() => copyPrompt(askPrompt)} class="text-xs px-3 py-1.5 rounded-lg border border-edge text-slate-300 hover:text-white hover:bg-panel2 inline-flex items-center gap-1.5">${CHAT_SVG}Discuss roadmap</button>
      </div>
      <div dangerouslySetInnerHTML=${{ __html: injected }}></div>
    </div>`;
}
