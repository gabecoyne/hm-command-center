// Tasks view — the draggable priority board.
// Ported from the monolith's renderBoard/wireDnD/persistBoard/openTask/saveTask.
import { html } from '../html.js';
import { useState, useRef } from 'preact/hooks';
import { useStore, getState, currentUser } from '../state.js';
import { putTasks } from '../data.js';
import { esc, cap } from '../lib/format.js';
import { banner } from '../components/Toasts.js';

const COLS = { backlog: 'Backlog', scheduled: 'Planned', in_progress: 'Current focus', done: 'Done' };
const PRI = { urgent: 'bg-rose-500 ring-2 ring-rose-400/40', high: 'bg-rose-500', normal: 'bg-slate-600', med: 'bg-amber-400', low: 'bg-slate-600' };
const DEFAULT_COLS = ['backlog', 'scheduled', 'in_progress', 'done'];

// ---- verbatim view-specific helpers ----
function dueChip(t){if(!t.due)return"";const today=new Date().toISOString().slice(0,10);const overdue=t.due<today&&t.status!=="done";return `<span class="px-1.5 rounded ${overdue?'bg-rose-500/20 text-rose-300':'bg-white/5 text-slate-400'}">${overdue?'⚠ ':''}${esc(t.due.slice(5))}</span>`;}
// afterEl — verbatim reorder helper: which .task the drop should land before.
function afterEl(col,y){const els=[...col.querySelectorAll(".task:not(.drag)")];return els.reduce((closest,child)=>{const box=child.getBoundingClientRect();const off=y-box.top-box.height/2;return off<0&&off>closest.offset?{offset:off,element:child}:closest;},{offset:-Infinity,element:null}).element;}

// Persist helper mirrors the monolith's putTasks(): stamp `updated`, write, toast on failure.
async function save(tasksObj){
  try { await putTasks({ ...tasksObj, updated: new Date().toISOString() }); }
  catch (e) { banner('err', 'Task save failed. ' + esc(e.message)); }
}

function Card({ t, dragging, onDragStart, onDragEnd, onOpen }) {
  return html`
    <div class="task rounded-lg border border-edge bg-panel glow p-2.5 cursor-pointer hover:border-slate-500 ${dragging ? 'drag' : ''}"
         draggable="true" data-id=${t.id}
         onDragStart=${onDragStart} onDragEnd=${onDragEnd} onClick=${onOpen}>
      <div class="flex items-start gap-2">
        <span class="mt-1 h-2 w-2 rounded-full ${PRI[t.priority] || 'bg-slate-600'} shrink-0"></span>
        <div class="flex-1 min-w-0">
          <div class="text-sm text-white leading-snug">${t.title}</div>
          <div class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-slate-400">
            <span class="px-1.5 rounded bg-white/5 text-slate-300">${cap(t.owner) || '—'}</span>
            ${t.due ? html`<span dangerouslySetInnerHTML=${{ __html: dueChip(t) }}></span>` : null}
            ${t.description ? html`<span class="text-slate-400" title="has notes">📝</span>` : null}
          </div>
        </div>
        <span class="text-slate-400 text-xs shrink-0">✎</span>
      </div>
    </div>`;
}

const segCls = on => 'seg flex-1 text-xs py-1.5 rounded-lg ' + (on ? 'bg-panel2 text-white' : 'text-slate-400 hover:text-white border border-edge');

function Seg({ value, opts, onChange }) {
  return html`
    <div class="flex gap-1 mt-1">
      ${opts.map(o => html`<button key=${o.v} class=${segCls(o.v === value)} onClick=${() => onChange(o.v)}>${o.l}</button>`)}
    </div>`;
}

function TaskDrawer({ t, columns, onClose, onSave, onDelete }) {
  const [title, setTitle] = useState(t.title || '');
  const [desc, setDesc] = useState(t.description || '');
  const [owner, setOwner] = useState((t.owner || 'gabe').toLowerCase());
  const [due, setDue] = useState(t.due || '');
  const [priority, setPriority] = useState(t.priority || 'med');
  const [status, setStatus] = useState(t.status);
  const lbl = 'text-[10px] uppercase tracking-widest text-slate-400';

  return html`
    <div class="fixed inset-0 z-30">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick=${onClose}></div>
      <aside class="absolute right-0 top-0 h-full w-full sm:max-w-[480px] bg-panel border-l border-edge overflow-y-auto slidein">
        <div class="sticky top-0 flex items-center justify-between px-5 h-14 border-b border-edge bg-panel/95 backdrop-blur z-10">
          <span class="text-white font-semibold">Edit task</span>
          <button class="text-slate-400 hover:text-white text-lg leading-none" onClick=${onClose}>✕</button>
        </div>
        <div class="p-5 space-y-4">
          <div><label class=${lbl}>Title</label><input value=${title} onInput=${e => setTitle(e.target.value)} class="w-full mt-1 bg-ink border border-edge rounded-lg px-3 py-2 text-sm text-white"/></div>
          <div><label class=${lbl}>Description / notes</label><textarea rows="6" value=${desc} onInput=${e => setDesc(e.target.value)} class="w-full mt-1 bg-ink border border-edge rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-400" placeholder="Longer context, links, acceptance criteria…"></textarea></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class=${lbl}>Owner</label><${Seg} value=${owner} onChange=${setOwner} opts=${[{ v: 'gabe', l: 'Gabe' }, { v: 'collin', l: 'Collin' }]}/></div>
            <div><label class=${lbl}>Due date</label><input type="date" value=${due} onInput=${e => setDue(e.target.value)} onClick=${e => { try { e.target.showPicker && e.target.showPicker(); } catch {} }} class="w-full mt-1 bg-ink border border-edge rounded-lg px-3 py-2 text-sm text-slate-200"/></div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class=${lbl}>Priority</label><${Seg} value=${priority} onChange=${setPriority} opts=${[{ v: 'high', l: 'High' }, { v: 'med', l: 'Med' }, { v: 'low', l: 'Low' }]}/></div>
            <div><label class=${lbl}>Status</label>
              <select value=${status} onChange=${e => setStatus(e.target.value)} class="w-full mt-1 bg-ink border border-edge rounded-lg px-3 py-2 text-sm text-slate-200">
                ${(columns || []).map(c => html`<option key=${c} value=${c}>${COLS[c] || c}</option>`)}
              </select>
            </div>
          </div>
          <div class="flex items-center gap-2 pt-2">
            <button onClick=${() => onSave({ title: title.trim() || t.title, description: desc.trim(), owner, due: due || '', priority, status })} class="px-4 py-2 rounded-lg bg-accent text-ink text-sm font-semibold">Save</button>
            <button onClick=${onDelete} class="px-4 py-2 rounded-lg border border-edge text-rose-300 hover:border-rose-500/60 text-sm ml-auto">Delete</button>
          </div>
          <div class="text-[10px] font-mono text-slate-400">source: ${t.source || 'human'}${t.updated ? ' · updated ' + String(t.updated).slice(0, 16).replace('T', ' ') : ''}</div>
        </div>
      </aside>
    </div>`;
}

export function Tasks(props) {
  const s = useStore();
  const [newText, setNewText] = useState('');
  const [openId, setOpenId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dropCol, setDropCol] = useState(null);
  const dragId = useRef(null);
  const justDragged = useRef(false);

  const cols = s.tasks.columns || DEFAULT_COLS;
  const allTasks = s.tasks.tasks || [];

  function addTask() {
    const v = newText.trim(); if (!v) return;
    const id = 't-' + Date.now().toString(36);
    const t = { id, title: v, status: 'backlog', priority: 'med', owner: currentUser(), source: 'human', description: '', due: '' };
    setNewText('');
    save({ ...s.tasks, tasks: [...allTasks, t] });
  }

  function onDrop(e, col) {
    e.preventDefault();
    setDropCol(null);
    const id = dragId.current;
    dragId.current = null; setDraggingId(null);
    if (!id) return;
    const after = afterEl(e.currentTarget, e.clientY);       // element to insert before, or null → append
    const afterId = after ? after.dataset.id : null;
    const all = getState().tasks.tasks || [];
    const dragged = all.find(x => x.id === id);
    if (!dragged) return;
    // Rebuild grouped-by-column order, mirroring the monolith's persistBoard.
    const order = [];
    cols.forEach(c => {
      const items = all.filter(x => x.status === c && x.id !== id);
      if (c === col) {
        const moved = { ...dragged, status: col };
        if (afterId == null) { items.forEach(x => order.push(x)); order.push(moved); }
        else items.forEach(x => { if (x.id === afterId) order.push(moved); order.push(x); });
      } else items.forEach(x => order.push(x));
    });
    const seen = new Set(order.map(x => x.id));
    all.forEach(x => { if (!seen.has(x.id)) order.push(x); });
    if (JSON.stringify(order) !== JSON.stringify(all)) save({ ...getState().tasks, tasks: order });
  }

  async function saveTask(id, patch) {
    const all = getState().tasks.tasks || [];
    const i = all.findIndex(x => x.id === id); if (i < 0) return;
    const next = all.slice(); next[i] = { ...next[i], ...patch, updated: new Date().toISOString() };
    setOpenId(null);
    await save({ ...getState().tasks, tasks: next });
    banner('ok', 'Task saved.');
  }

  async function delTask(id) {
    const next = (getState().tasks.tasks || []).filter(x => x.id !== id);
    setOpenId(null);
    await save({ ...getState().tasks, tasks: next });
    banner('ok', 'Task deleted.');
  }

  const openTask = allTasks.find(x => x.id === openId) || null;

  return html`
    <section>
      <div class="flex gap-2 mb-4 max-w-[520px]">
        <input value=${newText} onInput=${e => setNewText(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') addTask(); }} class="flex-1 bg-ink border border-edge rounded-lg px-3 py-2 text-sm" placeholder="Add a task…"/>
        <button onClick=${addTask} class="px-3.5 py-2 rounded-lg bg-accent text-ink text-sm font-semibold">Add</button>
      </div>
      <p class="text-[11px] text-slate-400 mb-2">Drag cards between columns to change status, or within a column to prioritize. Click a card to edit.</p>
      <div class="grid md:grid-cols-4 gap-3">
        ${cols.map(col => {
          const items = allTasks.filter(t => t.status === col);
          return html`
            <div key=${col} class="rounded-xl border border-edge bg-panel/50 p-2.5">
              <div class="flex items-center justify-between px-1 mb-2">
                <span class="text-xs font-semibold text-slate-300">${COLS[col] || col}</span>
                <span class="text-[11px] font-mono text-slate-400">${items.length}</span>
              </div>
              <div class="col space-y-2 min-h-[60px] ${dropCol === col ? 'dropok' : ''}" data-col=${col}
                   onDragOver=${e => { e.preventDefault(); if (!dragId.current) return; setDropCol(col); }}
                   onDragLeave=${e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropCol(c => (c === col ? null : c)); }}
                   onDrop=${e => onDrop(e, col)}>
                ${items.length ? items.map(t => html`
                  <${Card} key=${t.id} t=${t} dragging=${draggingId === t.id}
                    onDragStart=${() => { dragId.current = t.id; setDraggingId(t.id); }}
                    onDragEnd=${() => { dragId.current = null; setDraggingId(null); setDropCol(null); justDragged.current = true; setTimeout(() => { justDragged.current = false; }, 180); }}
                    onOpen=${() => { if (!justDragged.current) setOpenId(t.id); }}/>`)
                  : html`<div class="empty text-[11px] text-slate-400 px-1 py-3 text-center">Drop here</div>`}
              </div>
            </div>`;
        })}
      </div>
      ${openTask ? html`<${TaskDrawer} key=${openTask.id} t=${openTask} columns=${cols} onClose=${() => setOpenId(null)} onSave=${p => saveTask(openTask.id, p)} onDelete=${() => delTask(openTask.id)}/>` : null}
    </section>`;
}
