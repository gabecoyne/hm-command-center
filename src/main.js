// App root: layout + router + store wiring. Entry point loaded by index.html.
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { html } from './html.js';
import { useStore, setUser } from './state.js';
import { boot } from './data.js';
import { liveItems } from './lib/attention.js';
import { Sidebar } from './components/Sidebar.js';
import { Header } from './components/Header.js';
import { Toasts } from './components/Toasts.js';
import { Reports } from './views/Reports.js';
import { Dashboard } from './views/Dashboard.js';
import { Feedback } from './views/Feedback.js';
import { Tasks } from './views/Tasks.js';
import { Agents } from './views/Agents.js';
import { Activity } from './views/Activity.js';
import { Schedule } from './views/Schedule.js';
import { Roadmap } from './views/Roadmap.js';

const TITLES = { dashboard: 'Dashboard', feedback: 'Feedback', attention: 'Feedback', tasks: 'Priorities', schedule: 'Schedule', agents: 'Agents', activity: 'Activity', reports: 'Reports', roadmap: 'Product Roadmap' };
// `attention` kept as an alias so any old link/persisted state still resolves to Feedback.
const VIEWS = { dashboard: Dashboard, feedback: Feedback, attention: Feedback, tasks: Tasks, agents: Agents, activity: Activity, schedule: Schedule, reports: Reports, roadmap: Roadmap };

function App() {
  const s = useStore();
  const [view, setView] = useState('dashboard');
  const [who, setWho] = useState('all');
  const View = VIEWS[view] || Dashboard;

  const badges = {
    q: liveItems(s.attn.items).length,
    r: (s.reports.items || []).filter(r => !r.read).length,
    a: (s.roster.agents || []).length,
    s: (s.sched && s.sched.tasks ? s.sched.tasks.length : 0),
  };

  return html`
    <${Sidebar} view=${view} setView=${setView} user=${s.user} setUser=${setUser} connected=${s.connected} badges=${badges}/>
    <div class="ml-[220px]">
      <${Header} title=${TITLES[view]} showWho=${view === 'feedback' || view === 'attention'} who=${who} setWho=${setWho}/>
      <main class="p-6">
        <div class="fade" key=${view}><${View} who=${who}/></div>
      </main>
    </div>
    <${Toasts}/>`;
}

render(html`<${App}/>`, document.getElementById('app'));
boot();
