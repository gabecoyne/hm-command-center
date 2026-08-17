// Dashboard view — the command center's headline KPIs, marketing/cash/inventory
// charts, and the analyst-write-up drawer. Ported faithfully from the monolith's
// renderDash/renderTiles/renderMktgCharts/renderChannel/renderEmailSms/
// renderFinance/renderInv + openGraphDrawer. Chart.js is a global (window.Chart);
// each canvas is driven by the <ChartCanvas/> wrapper below.
import { html } from '../html.js';
import { useState, useEffect, useRef, useMemo } from 'preact/hooks';
import { useStore, getState, currentUser } from '../state.js';
import { esc, usd, fmtpct, cap, mdToHtml, nowCT } from '../lib/format.js';
import { banner, copyPrompt } from '../components/Toasts.js';
import { AskButton, CHAT_SVG } from '../components/AskButton.js';
import { mkAsk, dsnap } from '../lib/prompts.js';

// --- small shared bits -------------------------------------------------------
// The card icon-button class (matches the monolith's chat/analysis buttons).
const ICON_CLS = 'h-6 w-6 grid place-items-center rounded-md text-slate-400 hover:text-white hover:bg-white/10 opacity-70 hover:opacity-100 transition';
// String form of the chat SVG for HTML-string builders (kpi/askBtn). The
// imported CHAT_SVG is an htm vnode and can't be concatenated into a string.
const CHAT_SVG_STR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
// The analyst write-up (file) icon, as an htm vnode for real Preact buttons.
const ANALYSIS_SVG = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>`;

// askBtn — verbatim from the monolith (line 240), with CHAT_SVG as a string.
// Embedded inside kpi()'s HTML string; delegated via the #d-kpis onClick below.
function askBtn(prompt){return '<button type="button" data-ask="'+esc(prompt||"")+'" title="Chat about this" aria-label="Chat" class="absolute top-2 right-2 z-[2] h-6 w-6 grid place-items-center rounded-md text-slate-400 hover:text-white hover:bg-white/10 opacity-70 hover:opacity-100 transition">'+CHAT_SVG_STR+'</button>';}

// --- verbatim helpers (monolith lines 403–406, 244, 500) ---------------------
function kpi(label,val,sub,tone){return `<div class="relative rounded-xl border border-edge bg-panel glow p-4 overflow-hidden"><div class="absolute left-0 top-0 h-full w-0.5 ${tone||'bg-slate-600'}"></div>${askBtn(mkAsk('the "'+label+'" KPI','Current: '+(val==null?'—':val)+(sub?(' ('+sub+')'):'')+'.'))}<div class="text-[11px] uppercase tracking-widest text-slate-400 pr-6">${label}</div><div class="mt-1.5 text-2xl font-semibold font-mono text-white">${val}</div><div class="text-[11px] text-slate-400 mt-0.5">${sub||""}</div></div>`;}
function toneCls(good){return good?'bg-accent':'bg-rose-500';}
function ymNow(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
// monthGoal takes `model` as a param (the monolith read a module global).
function monthGoal(model){const m=model&&model.data;if(!m)return null;const v=(m.revenue_target_by_month||{})[ymNow()];return (v==null?null:v);}
const GRAPHS={rev:"Revenue vs Spend (14d)",roas:"Blended ROAS (14d, gross sales / paid spend — matches Triple Whale)",chan:"Channel spend & ROAS (7d)",pace:"Pacing to daily spend floor",emailsms:"Email/SMS % of revenue"};
function gopt(extra={}){return {responsive:true,interaction:{mode:'index',intersect:false},hover:{mode:'index',intersect:false},plugins:{legend:{labels:{color:'#94a3b8',boxWidth:10,font:{size:10}}},tooltip:{enabled:true,mode:'index',intersect:false,backgroundColor:'rgba(15,23,42,.95)',borderColor:'#334155',borderWidth:1,titleColor:'#e2e8f0',bodyColor:'#cbd5e1',padding:8,titleFont:{size:10},bodyFont:{size:11},displayColors:true,boxWidth:8,boxHeight:8,callbacks:{label:(c)=>{const v=c.parsed.y;const n=(typeof v==='number')?(Number.isInteger(v)?v.toLocaleString():v.toLocaleString(undefined,{maximumFractionDigits:2})):v;return (c.dataset.label?c.dataset.label+': ':'')+n;}}}},scales:{x:{ticks:{color:'#64748b',font:{size:9}},grid:{color:'#1c2634'}},y:{ticks:{color:'#64748b',font:{size:9}},grid:{color:'#1c2634'}},...extra}};}

// --- section builders (return HTML strings / chart configs / ask prompts) -----
// renderTiles (line 411)
function buildKpisHtml(dash, model, loading){
  // Cold D1 reads take a few seconds. Saying "no dashboard.json yet — run the script" during that
  // window sent people off to debug a feeder that was working (2026-08-17). Say "loading" instead,
  // and only claim the snapshot is missing once the load has actually finished.
  if(!dash) return loading
    ? `<div class="col-span-full text-slate-400 text-sm animate-pulse">Loading the latest snapshot…</div>`
    : `<div class="col-span-full text-slate-400 text-sm">No <code>dashboard.json</code> yet — run <code>build_dashboard_snapshot.py</code>.</div>`;
  const k=dash.kpis,t=dash.targets||{};
  const goal=monthGoal(model);
  const now=new Date(),dom=now.getDate(),dim=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  const expToDate=goal?goal*dom/dim:null;
  const pace=(goal&&expToDate)?Math.round((k.gross_mtd/expToDate)*100):null;
  const md=model&&model.data,cm=ymNow();
  const endCash=md?((md.ending_cash_by_month||{})[cm]):null;
  const netCh=md?((md.net_change_by_month||{})[cm]):null;
  const tiles=[
    kpi("Revenue MTD → goal",usd(k.gross_mtd),goal?("of "+usd(goal)+" · pace "+pace+"%"):"no model goal set",goal?toneCls(pace>=100):'bg-slate-500'),
    kpi("Blended ROAS 7d",k.blended_roas_7d?.toFixed(2),`target ${t.blended_roas} · 30d ${k.blended_roas_30d}`+(k.attributed_roas_7d!=null?` · attr ${k.attributed_roas_7d}`:``),toneCls(k.blended_roas_7d>=t.blended_roas)),
    kpi("Spend / day 7d",usd(k.spend_day_7d),`floor ${usd(t.spend_floor_day)}`,toneCls(k.spend_day_7d>=t.spend_floor_day)),
    kpi("Cash · forecast EOM",endCash!=null?usd(endCash):"—",netCh!=null?("net "+(netCh>=0?'+':'')+usd(netCh)+" this mo"):("model V"+(md?md.model_version:"?")),endCash==null?'bg-slate-500':toneCls((netCh||0)>=0)),
    kpi("Meta ROAS 7d",k.meta_roas_7d?.toFixed(2),usd(k.meta_spend_7d)+" spend",toneCls(k.meta_roas_7d>=t.blended_roas)),
    kpi("Google ROAS 7d",k.google_roas_7d?.toFixed(2),usd(k.google_spend_7d)+" spend",toneCls(k.google_roas_7d>=t.blended_roas)),
  ];
  return tiles.join("");
}

// renderMktgCharts (line 431) — 4 chart configs + 4 ask prompts.
function buildMktg(dash, model){
  if(!dash) return {goal:null,rev:null,roas:null,askGoal:'',askRev:'',askRoas:''};
  const k=dash.kpis,t=dash.targets||{},tr=dash.trend||{dates:[],revenue:[],spend:[],roas:[]};
  const goal=monthGoal(model);
  const now=new Date(),cmNum=now.getMonth()+1,dim=new Date(now.getFullYear(),now.getMonth()+1,0).getDate(),today=now.getDate();
  const dayRev={};(tr.dates||[]).forEach((d,i)=>{const pr=String(d).split('-');const mm=+pr[0],dd=+pr[1];if(mm===cmNum)dayRev[dd]=(tr.revenue||[])[i]||0;});
  const labels=[],expected=[],actual=[];let cum=0,haveAny=false;
  for(let i=1;i<=dim;i++){labels.push(i);expected.push(goal?Math.round(goal*i/dim):null);
    if(i<=today){if(dayRev[i]!=null){cum+=dayRev[i];haveAny=true;}actual.push(haveAny?cum:null);}else actual.push(null);}
  const goalCfg={type:"line",data:{labels,datasets:[
    {label:"Actual (MTD)",data:actual,borderColor:'#34d399',backgroundColor:'rgba(52,211,153,.12)',fill:true,tension:.25,pointRadius:0,spanGaps:true},
    {label:"Plan to goal",data:expected,borderColor:'#64748b',borderDash:[5,4],pointRadius:0,tension:0}]},options:gopt()};
  const revCfg={type:"line",data:{labels:tr.dates,datasets:[{label:"Revenue",data:tr.revenue,borderColor:'#34d399',backgroundColor:'rgba(52,211,153,.1)',fill:true,tension:.3,pointRadius:0},{label:"Spend",data:tr.spend,borderColor:'#818cf8',tension:.3,pointRadius:0}]},options:gopt()};
  const target=(tr.dates||[]).map(()=>t.blended_roas);
  const roasDs=[{label:"Blended (TW)",data:tr.roas,borderColor:'#fbbf24',backgroundColor:'rgba(251,191,36,.08)',fill:true,tension:.3,pointRadius:0}];
  if((tr.attr_roas||[]).length) roasDs.push({label:"Paid-attributed",data:tr.attr_roas,borderColor:'#818cf8',borderDash:[3,3],fill:false,tension:.3,pointRadius:0});
  roasDs.push({label:"target",data:target,borderColor:'#64748b',borderDash:[5,4],pointRadius:0});
  const roasCfg={type:"line",data:{labels:tr.dates,datasets:roasDs},options:gopt()};
  const _sum=a=>(a||[]).reduce((x,y)=>x+(+y||0),0);
  const askGoal=mkAsk("revenue pacing to the monthly goal",goal?("MTD "+usd(k.gross_mtd)+" of "+usd(goal)+" goal; "+Math.round((k.gross_mtd/(goal*today/dim))*100)+"% of plan-to-date on day "+today+"/"+dim+"."):("No model revenue goal for "+ymNow()+"."));
  const askRev=mkAsk("the Revenue vs Spend trend (14d)","Latest ("+((tr.dates||[]).at(-1)||"n/a")+"): rev "+usd((tr.revenue||[]).at(-1))+", spend "+usd((tr.spend||[]).at(-1))+"; 14d totals rev "+usd(_sum(tr.revenue))+" / spend "+usd(_sum(tr.spend))+".");
  const askRoas=mkAsk("the Blended ROAS trend (14d) vs target","Blended ROAS here = gross sales / paid spend, the same basis Triple Whale's dashboard uses (totalRoas). Target "+t.blended_roas+"; latest "+(((tr.roas||[]).at(-1))??"n/a")+"; 7d "+k.blended_roas_7d+"; 30d "+k.blended_roas_30d+". Paid-attributed (platform-reported conversion value / spend) 7d: "+(k.attributed_roas_7d??"n/a")+".");
  return {goal:goalCfg,rev:revCfg,roas:roasCfg,askGoal,askRev,askRoas};
}

// 12-week (~90-day) forward cash-flow forecast, weekly cadence. The model carries
// MONTHLY ending-cash only, so this interpolates that monthly curve to weekly points
// on a single, consistent basis (model ending cash). Purely forward-looking from today.
function buildCashFcst(model){
  const none=(msg)=>({cfg:null,ask:mkAsk("the 12-week cash-flow forecast",msg),has:false});
  if(!(model&&model.data)) return none("model.json not loaded.");
  const md=model.data, months=md.months||[], ec=md.ending_cash_by_month||{};
  const meEnd=(ym)=>{const p=String(ym).split('-');return new Date(+p[0],+p[1],0).getTime();}; // last day of that month
  const anchors=[]; months.forEach(m=>{ if(ec[m]!=null) anchors.push([meEnd(m),ec[m]]); });
  anchors.sort((a,b)=>a[0]-b[0]);
  if(anchors.length<2) return none("Not enough model months to project.");
  const interp=(t)=>{ if(t<=anchors[0][0])return anchors[0][1]; if(t>=anchors[anchors.length-1][0])return anchors[anchors.length-1][1];
    for(let i=1;i<anchors.length;i++){ if(t<=anchors[i][0]){const a=anchors[i-1],b=anchors[i];return a[1]+(b[1]-a[1])*((t-a[0])/(b[0]-a[0]));} } return anchors[anchors.length-1][1]; };
  const start=new Date(); start.setHours(0,0,0,0);
  const labels=[],data=[];
  for(let i=0;i<=12;i++){const d=new Date(start.getTime()+i*7*86400000);labels.push((d.getMonth()+1)+'/'+d.getDate());data.push(Math.round(interp(d.getTime())));}
  const cfg={type:"line",data:{labels,datasets:[
    {label:"Forecast cash",data,borderColor:'#38bdf8',backgroundColor:'rgba(56,189,248,.10)',fill:true,tension:.25,pointRadius:labels.map((_,i)=>i===0?4:0),pointBackgroundColor:'#38bdf8'}]},options:gopt()};
  const ask=mkAsk("the 12-week (90-day) cash-flow forecast","Model V"+md.model_version+" weekly ending-cash projection: "+usd(data[0])+" now \u2192 "+usd(data[data.length-1])+" in 12 weeks. Weekly points interpolated from the model's monthly ending-cash curve (the model carries monthly cadence only).");
  return {cfg, ask, has:true};
}

// renderChannel (line 458)
function buildChannel(dash){
  const ch=(dash&&dash.channels)||[],t=(dash&&dash.targets)||{};
  const body=ch.length?`<div class="grid grid-cols-2 gap-3">`+ch.map(c=>{const good=c.roas>=(t.blended_roas||0);const w=Math.min(100,Math.round((c.roas/((t.blended_roas||1)*1.5))*100));return `<div class="rounded-lg border border-edge bg-panel2/40 p-3"><div class="flex items-center justify-between"><span class="text-[12px] text-white font-medium">${esc(c.name)}</span><span class="font-mono text-[12px] ${good?'text-emerald-300':'text-rose-300'}">${(c.roas??0).toFixed(2)}x</span></div><div class="mt-0.5 text-[11px] text-slate-400">${usd(c.spend)} spend</div><div class="mt-2 h-1.5 rounded bg-ink overflow-hidden"><div class="h-full ${good?'bg-accent':'bg-rose-500'}" style="width:${w}%"></div></div></div>`;}).join("")+`</div><div class="text-[10px] text-slate-500 mt-2">bar = ROAS vs ${t.blended_roas} target</div>`:`<div class="text-slate-400 text-sm">No channel data.</div>`;
  const ask=mkAsk("channel spend & ROAS (7d)",(ch.map(c=>c.name+": "+usd(c.spend)+" @ "+c.roas).join("; "))||"(no channel data)");
  return {body, ask};
}

// renderEmailSms (line 463)
function buildEmailSms(life, dash){
  const lt=(life&&life.trend)||{dates:[],klaviyo:[],tw:[]},tr=(dash&&dash.trend)||{dates:[]};
  const cfg={type:"line",data:{labels:(lt.dates&&lt.dates.length)?lt.dates:tr.dates,datasets:[{label:"Klaviyo % rev",data:lt.klaviyo||[],borderColor:'#a78bfa',backgroundColor:'rgba(167,139,250,.10)',fill:true,tension:.3,pointRadius:0}]},options:gopt()};
  const ask=mkAsk("Email/SMS % of revenue (Klaviyo attribution)",(life&&life.email_sms_pct_rev)?("Klaviyo "+fmtpct(life.email_sms_pct_rev.klaviyo)+" of revenue over 30d (Klaviyo is the attribution standard)."):"Awaiting the Klaviyo pull (build_lifecycle_snapshot.py).");
  return {cfg, ask};
}

// renderFinance (line 468)
function buildFinance(cash){
  const c=cash&&cash.data;
  const cashNote=(cash&&cash.ok&&c&&c.as_of)?("as of "+c.as_of):((cash&&cash.error)?cash.error:"awaiting first cash sync");
  let balancesHtml;
  {const defs=(c&&c.line_defs)||[],byKey={};((c&&c.balances)||[]).forEach(b=>byKey[b.key]=b);
    balancesHtml=defs.length?(defs.map(d=>{const b=byKey[d.key],amt=b?b.amount:null,isDebt=d.kind==='debt';return `<div class="flex items-center justify-between py-1.5 border-b border-edge/50 last:border-0"><span class="text-[12px] text-slate-300">${esc(d.label)}${isDebt?' <span class="text-[9px] text-slate-500 uppercase">debt</span>':''}</span><span class="font-mono text-[12px] ${amt==null?'text-slate-500':(isDebt?'text-rose-300':'text-slate-100')}">${amt==null?'—':(isDebt?'-'+usd(Math.abs(amt)):usd(amt))}</span></div>`;}).join("")+((c&&c.net!=null)?`<div class="flex items-center justify-between pt-2 mt-1"><span class="text-[12px] text-white font-medium">Net position</span><span class="font-mono text-[13px] ${c.net>=0?'text-emerald-300':'text-rose-300'}">${usd(c.net)}</span></div>`:`<div class="text-[11px] text-slate-500 mt-2">Awaiting first sync — net = cash (lines 1–3) minus financing (4–6).</div>`)):`<div class="text-slate-400 text-sm">No <code>cash.json</code> yet.</div>`;
  }
  const hist=(c&&c.history)||[];
  const hasHist=hist.length>0;
  let cashtrendCfg=null;
  if(hist.length){cashtrendCfg={type:"line",data:{labels:hist.map(h=>String(h.date).slice(5)),datasets:[
    {label:"Cash (net)",data:hist.map(h=>h.net),borderColor:'#34d399',backgroundColor:'rgba(52,211,153,.10)',fill:true,tension:.25,pointRadius:0},
    {label:"Payables",data:hist.map(h=>h.ap_total),borderColor:'#fb7185',tension:.25,pointRadius:0}]},options:gopt()};
  }
  let payablesHtml;
  {const items=(c&&c.ap_items)||[];
    payablesHtml=`<div class="flex items-center justify-between mb-2"><span class="text-[11px] uppercase tracking-widest text-slate-400">Short-term payables</span>${(c&&c.ap_total!=null)?`<span class="font-mono text-[12px] text-rose-300">${usd(c.ap_total)}</span>`:''}</div>`+(items.length?items.map(it=>`<div class="flex items-center justify-between py-1.5 border-b border-edge/50 last:border-0"><div class="min-w-0"><div class="text-[12px] text-slate-200 truncate">${esc(it.vendor||it.name||'—')}</div><div class="text-[10px] text-slate-500">${esc(it.due_date||it.due||'')}${it.status?' · '+esc(it.status):''}</div></div><span class="font-mono text-[12px] text-slate-200 shrink-0">${usd(it.amount)}</span></div>`).join(""):`<div class="text-slate-400 text-sm">${(cash&&cash.ok)?'No open payables.':'Awaiting first cash sync — A/P from daily-finance’s QBO scan, moving to the BI collector.'}</div>`);
  }
  const ask=mkAsk("the cash & payables trend",hist.length?("Latest net "+usd(hist.at(-1).net)+", payables "+usd(hist.at(-1).ap_total)+" over "+hist.length+" days."):"No cash history yet — awaiting the daily cash collector.");
  return {cashNote, balancesHtml, cashtrendCfg, payablesHtml, ask, hasHist};
}

// renderInv (line 488). Note: the monolith's #d-ship block is guarded and not in
// the dashboard markup, so it renders nothing here — omitted.
function buildInv(inv){
  const invNote=(inv&&inv.cover_note)||"";
  if(!inv){const msg=`<div class="text-slate-400 text-sm">No <code>inventory.json</code> yet — run <code>build_inventory_snapshot.py</code>.</div>`;return {invNote, topHtml:msg, coverHtml:msg, skuCfg:null};}
  const wow=v=>v==null?`<span class="text-slate-400">—</span>`:`<span class="${v>=0?'text-emerald-400':'text-rose-400'}">${v>=0?'+':''}${v}%</span>`;
  const topHtml=`<table class="w-full text-sm"><thead><tr class="text-[10px] uppercase tracking-widest text-slate-400 text-left"><th class="font-normal py-1 pr-3">SKU</th><th class="font-normal pr-3">7d</th><th class="font-normal pr-3">30d</th><th class="font-normal pr-3">WoW</th><th class="font-normal pr-3">Units/day</th></tr></thead><tbody>${(inv.top_skus||[]).map(s=>`<tr class="border-t border-edge/60"><td class="py-1.5 pr-3"><div class="font-mono text-[12px] text-white">${esc(s.sku)}</div><div class="text-[11px] text-slate-400">${esc(s.title||"")}</div></td><td class="pr-3 font-mono text-slate-200">${s.units_7d}</td><td class="pr-3 font-mono text-slate-400">${s.units_30d}</td><td class="pr-3 font-mono">${wow(s.wow_pct)}</td><td class="pr-3 font-mono text-slate-300">${s.velocity_day}</td></tr>`).join("")}</tbody></table>`;
  const cov=inv.cover||[];
  const coverHtml=cov.length?cov.map(c=>{const pct=Math.min(100,Math.round((c.weeks_cover/12)*100));const bar=c.low?"bg-rose-500":c.weeks_cover<6?"bg-amber-400":"bg-accent";return `<div class="py-1.5 border-b border-edge/50 last:border-0"><div class="flex items-center justify-between text-[12px]"><span class="font-mono text-slate-200">${esc(c.sku)}</span><span class="font-mono ${c.low?'text-rose-300':'text-slate-300'}">${c.weeks_cover}w${c.low?' · low':''}</span></div><div class="mt-1 h-1.5 rounded bg-ink overflow-hidden"><div class="h-full ${bar}" style="width:${pct}%"></div></div><div class="text-[10px] text-slate-400 mt-0.5">${c.on_hand} on hand</div></div>`;}).join(""):`<div class="text-slate-400 text-sm">No positive tracked on-hand (bundle SKUs decrement components; ShipBob authoritative).</div>`;
  const tr=inv.trend||{dates:[],series:[]},pal=['#34d399','#818cf8','#fbbf24','#38bdf8','#f472b6'];
  const skuCfg={type:"line",data:{labels:tr.dates,datasets:(tr.series||[]).map((s,i)=>({label:s.sku,data:s.data,borderColor:pal[i%pal.length],backgroundColor:'transparent',tension:.3,pointRadius:0,borderWidth:2}))},options:gopt()};
  return {invNote, topHtml, coverHtml, skuCfg};
}

// #d-updated footer line (line 409)
function buildUpdated(dash, model, cash, inv){
  return [dash&&"marketing "+(dash.updated||"").slice(0,16).replace("T"," "),(model&&model.data)&&"model V"+model.data.model_version,(cash&&cash.ok&&cash.data)&&("cash "+(cash.data.as_of||"")),inv&&"inventory "+(inv.updated||"").slice(0,16).replace("T"," ")].filter(Boolean).map(s=>"· "+s).join(" ")+" · snapshots by the feeders";
}

// --- Chart.js canvas wrapper -------------------------------------------------
// Creates `new window.Chart(canvas, config)` on mount / when config changes and
// destroys it on cleanup. Guards against a missing CDN (window.Chart undefined)
// and a null config (chart intentionally absent, e.g. no model / no cash history).
function ChartCanvas({ id, height, config }){
  const ref=useRef(null);
  useEffect(()=>{
    if(!config||!ref.current) return;
    if(typeof window==='undefined'||!window.Chart) return;
    let chart;
    try{ chart=new window.Chart(ref.current, config); }
    catch(e){ return; }
    return ()=>{ try{ chart&&chart.destroy(); }catch(e){} };
  },[config]);
  return html`<canvas id=${id} height=${height} ref=${ref}></canvas>`;
}

// --- analyst write-up drawer (openGraphDrawer, line 246 + markup line 959) ----
function GraphDrawer({ gkey, analysis, onClose }){
  useEffect(()=>{
    const h=e=>{ if(e.key==='Escape') onClose(); };
    document.addEventListener('keydown',h);
    return ()=>document.removeEventListener('keydown',h);
  },[onClose]);
  if(!gkey) return null;
  const a=((analysis&&analysis.items)||{})[gkey]||null;
  const title=GRAPHS[gkey]||gkey;
  const meta=a?((a.author||"analyst")+" · "+((a.updated||"").slice(0,16).replace("T"," "))+(a.trend?(" · "+a.trend):"")):"no write-up yet";
  const body=a?(a.narrative||"(empty)"):"No analysis yet for this graph.\n\nAn analyst agent will post a daily/weekly narrative here (analysis.json). Until then, start a chat below to dig in live.";
  const chat=()=>copyPrompt(mkAsk(title,(a&&a.narrative)?("Analyst write-up:\n"+a.narrative):"(No analyst write-up yet.)"));
  return html`
    <div class="fixed inset-0 z-30">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick=${onClose}></div>
      <aside class="absolute right-0 top-0 h-full w-full sm:max-w-[520px] bg-panel border-l border-edge overflow-y-auto flex flex-col">
        <div class="sticky top-0 flex items-center justify-between px-5 h-14 border-b border-edge bg-panel/95 backdrop-blur z-10">
          <span class="text-white font-semibold">${title}</span>
          <button class="text-slate-400 hover:text-white text-lg leading-none" onClick=${onClose}>✕</button>
        </div>
        <div class="p-5 flex-1">
          <div class="text-[11px] font-mono text-slate-400 mb-3">${meta}</div>
          <div class="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">${body}</div>
        </div>
        <div class="p-4 border-t border-edge">
          <button onClick=${chat} class="w-full px-3 py-2 rounded-lg bg-accent/15 border border-accent/30 text-emerald-300 text-sm font-semibold hover:bg-accent/25">Continue in Claude →</button>
        </div>
      </aside>
    </div>`;
}

// --- the view ----------------------------------------------------------------
export function Dashboard(props){
  const s = useStore();
  const dash = s.dash, model = s.model, cash = s.cash, inv = s.inv, analysis = s.analysis, life = s.life;
  const [gkey, setGkey] = useState(null);

  // Build all section content; memoized on the state slices each one reads so a
  // drawer open/close doesn't needlessly destroy & recreate the charts.
  const kpisHtml = useMemo(()=>buildKpisHtml(dash, model, s.loading), [dash, model, s.loading]);
  const mktg     = useMemo(()=>buildMktg(dash, model), [dash, model]);
  const cashfcst = useMemo(()=>buildCashFcst(model), [model]);
  const channel  = useMemo(()=>buildChannel(dash), [dash]);
  const emailsms = useMemo(()=>buildEmailSms(life, dash), [life, dash]);
  const finance  = useMemo(()=>buildFinance(cash), [cash]);
  const inventory= useMemo(()=>buildInv(inv), [inv]);
  const updated  = useMemo(()=>buildUpdated(dash, model, cash, inv), [dash, model, cash, inv]);

  // KPI cards carry their ask buttons inside an HTML string (kpi/askBtn); mirror
  // the monolith's delegated [data-ask] → copyPrompt handler, scoped to #d-kpis.
  const onKpiAsk = e => {
    const q = e.target.closest && e.target.closest('[data-ask]');
    if(q && q.dataset.ask){ e.preventDefault(); e.stopPropagation(); copyPrompt(q.dataset.ask); }
  };

  return html`
    <div>
      <div class="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-5" id="d-kpis" onClick=${onKpiAsk} dangerouslySetInnerHTML=${{ __html: kpisHtml }}></div>
      <div class="grid lg:grid-cols-2 xl:grid-cols-4 gap-4">
        <div class="rounded-xl border border-edge bg-panel glow p-4 xl:col-span-2 relative">
          <div class="absolute top-2 right-2 z-[2] flex items-center gap-1"><${AskButton} prompt=${mktg.askGoal} class=${ICON_CLS}/></div>
          <div class="text-xs text-slate-400 mb-2 pr-14">Revenue → monthly goal · MTD vs plan</div>
          <${ChartCanvas} id="c-goal" height=${150} config=${mktg.goal}/>
        </div>
        <div class="rounded-xl border border-edge bg-panel glow p-4 xl:col-span-2 relative">
          <div class="absolute top-2 right-2 z-[2] flex items-center gap-1"><${AskButton} prompt=${emailsms.ask} class=${ICON_CLS}/></div>
          <div class="text-xs text-slate-400 mb-2 pr-14">Email/SMS % of revenue · trend</div>
          <${ChartCanvas} id="c-emailsms" height=${150} config=${emailsms.cfg}/>
        </div>
        <div class="rounded-xl border border-edge bg-panel glow p-4 xl:col-span-2 relative">
          <div class="absolute top-2 right-2 z-[2] flex items-center gap-1">
            <button type="button" onClick=${()=>setGkey('rev')} title="Analyst write-up" aria-label="Analysis" class=${ICON_CLS}>${ANALYSIS_SVG}</button>
            <${AskButton} prompt=${mktg.askRev} class=${ICON_CLS}/>
          </div>
          <div class="text-xs text-slate-400 mb-2 pr-14">Revenue vs Spend · 14d</div>
          <${ChartCanvas} id="c-rev" height=${150} config=${mktg.rev}/>
        </div>
        <div class="rounded-xl border border-edge bg-panel glow p-4 xl:col-span-2 relative">
          <div class="absolute top-2 right-2 z-[2] flex items-center gap-1">
            <button type="button" onClick=${()=>setGkey('roas')} title="Analyst write-up" aria-label="Analysis" class=${ICON_CLS}>${ANALYSIS_SVG}</button>
            <${AskButton} prompt=${mktg.askRoas} class=${ICON_CLS}/>
          </div>
          <div class="text-xs text-slate-400 mb-2 pr-14">Blended ROAS · 14d <span class="text-slate-500">— gross sales / paid spend, same basis as Triple Whale</span></div>
          <${ChartCanvas} id="c-roas" height=${150} config=${mktg.roas}/>
        </div>
      </div>
      <div class="grid gap-4 mt-4">
        <div class="rounded-xl border border-edge bg-panel glow p-4 relative">
          <div class="absolute top-2 right-2 z-[2] flex items-center gap-1"><${AskButton} prompt=${channel.ask} class=${ICON_CLS}/></div>
          <div class="text-xs text-slate-400 mb-2 pr-14">Channel spend & ROAS · 7d</div>
          <div id="d-chan" dangerouslySetInnerHTML=${{ __html: channel.body }}></div>
        </div>
      </div>

      <div class="flex items-center gap-3 mt-7 mb-3"><h2 class="text-sm font-semibold text-white">Cash & payables</h2><span class="text-[11px] text-slate-400" id="cash-note">${finance.cashNote}</span></div>
      <div class="grid gap-4 mb-4">
        <div class="rounded-xl border border-edge bg-panel glow p-4 relative">
          <div class="absolute top-2 right-2 z-[2] flex items-center gap-1"><${AskButton} prompt=${cashfcst.ask} class=${ICON_CLS}/></div>
          <div class="text-xs text-slate-400 mb-2 pr-14">Cash-flow forecast · 12-week (90-day) forward, weekly</div>
          <${ChartCanvas} id="c-cashfcst" height=${140} config=${cashfcst.cfg}/>
          ${cashfcst.has ? '' : html`<div class="text-[12px] text-slate-500 mt-2">Forecast unavailable — <code>model.json</code> not loaded.</div>`}
        </div>
      </div>
      <div class="grid lg:grid-cols-3 gap-4">
        <div class="rounded-xl border border-edge bg-panel glow p-4"><div class="text-xs text-slate-400 mb-2">Current balances</div><div id="d-balances" dangerouslySetInnerHTML=${{ __html: finance.balancesHtml }}></div></div>
        <div class="rounded-xl border border-edge bg-panel glow p-4 lg:col-span-2 relative">
          <div class="absolute top-2 right-2 z-[2] flex items-center gap-1"><${AskButton} prompt=${finance.ask} class=${ICON_CLS}/></div>
          <div class="text-xs text-slate-400 mb-2 pr-14">Cash (net) & payables · daily trend</div>
          <${ChartCanvas} id="c-cashtrend" height=${120} config=${finance.cashtrendCfg}/>
          <div id="cashtrend-empty" class="text-[12px] text-slate-500 mt-2" style=${{ display: finance.hasHist ? 'none' : '' }}>Only one snapshot so far (bootstrap) — the daily cash collector runs on-machine (Collin, QBO+Shopify) and will fill in this daily trend.</div>
        </div>
      </div>
      <div class="grid gap-4 mt-4">
        <div class="rounded-xl border border-edge bg-panel glow p-4"><div id="d-payables" dangerouslySetInnerHTML=${{ __html: finance.payablesHtml }}></div></div>
      </div>

      <div class="flex items-center gap-3 mt-7 mb-3"><h2 class="text-sm font-semibold text-white">Inventory & movement</h2><span class="text-[11px] text-slate-400" id="inv-note">${inventory.invNote}</span></div>
      <div class="grid lg:grid-cols-3 gap-4">
        <div class="rounded-xl border border-edge bg-panel glow p-4 lg:col-span-2"><div class="text-xs text-slate-400 mb-2">Top SKUs & movement</div><div id="inv-top" class="overflow-x-auto" dangerouslySetInnerHTML=${{ __html: inventory.topHtml }}></div></div>
        <div class="rounded-xl border border-edge bg-panel glow p-4"><div class="text-xs text-slate-400 mb-2">Weeks of cover <span class="text-slate-400">(low ${'<'} 3w)</span></div><div id="inv-cover" dangerouslySetInnerHTML=${{ __html: inventory.coverHtml }}></div></div>
      </div>
      <div class="rounded-xl border border-edge bg-panel glow p-4 mt-4"><div class="text-xs text-slate-400 mb-2">SKU units / day · 14d (top movers)</div><${ChartCanvas} id="c-sku" height=${90} config=${inventory.skuCfg}/></div>

      <p class="text-[11px] text-slate-400 mt-4" id="d-updated">${updated}</p>

      <${GraphDrawer} gkey=${gkey} analysis=${analysis} onClose=${()=>setGkey(null)}/>
    </div>`;
}
