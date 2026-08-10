// Placeholder views — each is being ported to a real Preact component in its
// own file (see WORKFLOW.md / migration plan). Until then they mount cleanly so
// the shell, router, data layer, and nav are fully exercised.
import { html } from '../html.js';

function Stub(name, note) {
  const C = () => html`
    <div class="rounded-xl border border-dashed border-edge bg-panel/60 p-10 text-center">
      <div class="text-white font-semibold text-[15px] mb-1">${name}</div>
      <div class="text-[12px] text-slate-400">Preact port in progress — this view still mounts on the new foundation.</div>
      ${note ? html`<div class="text-[11px] text-slate-500 mt-2">${note}</div>` : null}
    </div>`;
  C.displayName = name;
  return C;
}

export const Dashboard = Stub('Dashboard', 'KPIs, revenue/ROAS/cash charts, inventory — ported last (Chart.js wrapper).');
export const Attention = Stub('Attention', 'Approval + alert queue and decision log.');
export const Tasks = Stub('Priorities', 'Draggable task board.');
export const Agents = Stub('Agents', 'Agent org roster + drawers.');
export const Activity = Stub('Activity', 'Event-log feed with chips + filter.');
export const Schedule = Stub('Schedule', 'Scheduled-task agent tiles + full table.');
export const Roadmap = Stub('Product Roadmap', 'Gantt with Freight / Ready-to-ship (e955610).');
