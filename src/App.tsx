import Dashboard from './pages/Dashboard';
import EngineSandboxPage from './pages/dev/EngineSandboxPage';
import SelfTestPage from './pages/dev/SelfTestPage';
import PlaygroundSnapshot from './pages/PlaygroundSnapshot';
import CompanyProjectsEditorPage from './pages/CompanyProjectsEditorPage';
import ProjectsPage from './pages/ProjectsPage';

export default function App() {
  const pathname = window.location.pathname.replace(/\/$/, '') || '/';

  if (pathname === '/dev/engine-sandbox') {
    return <EngineSandboxPage />;
  }

  if (pathname === '/dev/self-test') {
    return <SelfTestPage />;
  }

  if (pathname === '/playground' || pathname === '/playground/snapshot') {
    return <PlaygroundSnapshot />;
  }

  if (/^\/company\/[^/]+\/projects\/?$/i.test(pathname)) {
    return <CompanyProjectsEditorPage />;
  }

  if (pathname === '/projects' || /^\/projects\/[^/]+\/?$/i.test(pathname)) {
    return <ProjectsPage />;
  }

  return <Dashboard />;
}
