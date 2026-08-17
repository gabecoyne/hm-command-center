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
import { Cro } from './views/Cro.js';

const TITLES = { dashboard: 'Dashboard', feedback: 'Feedback', attention: 'Feedback', tasks: 'Priorities', schedule: 'Schedule', agents: 'Agents', activity: 'Activity', reports: 'Reports', roadmap: 'Product Roadmap', cro: 'CRO' };
// `attention` kept as an alias so any old link/persisted state still resolves to Feedback.
const VIEWS = { dashboard: Dashboard, feedback: Feedback, attention: Feedback, tasks: Tasks, agents: Agents, activity: Activity, schedule: Schedule, reports: Reports, roadmap: Roadmap, cro: Cro };

function App() {
  const s = useStore();
  const [view, setView] = useState('dashboard');
  const [nav, setNav] = useState(false);            // mobile drawer open
  const View = VIEWS[view] || Dashboard;
  const go = (v) => { setView(v); setNav(false); };  // pick a view, close the drawer on mobile

  /* The Feedback badge answers "how much is waiting on ME", so it follows the Reviewing-as
     selection rather than counting the whole estate's queue. A number that never changes when
     you switch reviewer isn't telling either person anything actionable. */
  const mine = liveItems(s.attn.items).filter(i => String(i.owner || '').toLowerCase() === s.user);
  const badges = {
    q: mine.length,
    r: (s.reports.items || []).filter(r => !r.read).length,
    a: (s.roster.agents || []).length,
    s: (s.sched && s.sched.tasks ? s.sched.tasks.length : 0),
    // CRO badge counts tests at significance (a decision is waiting) and falls
    // back to the running count when nothing is callable yet.
    c: (s.cro && s.cro.summary ? (s.cro.summary.significant || s.cro.summary.running || 0) : 0),
  };

  return html`
    <${Sidebar} view=${view} setView=${go} user=${s.user} setUser=${setUser} connected=${s.connected} loading=${s.loading} badges=${badges} open=${nav} onClose=${() => setNav(false)}/>
    <div class="md:ml-[220px]">
      <${Header} title=${TITLES[view]} onMenu=${() => setNav(true)}/>
      <main class="p-3 md:p-6">
        <div class="fade" key=${view}><${View}/></div>
      </main>
    </div>
    <${Toasts}/>`;
}

render(html`<${App}/>`, document.getElementById('app'));
boot();
