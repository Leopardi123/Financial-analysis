import Dashboard from './pages/Dashboard';
import EngineSandboxPage from './pages/dev/EngineSandboxPage';
import SelfTestPage from './pages/dev/SelfTestPage';

export default function App() {
  const pathname = window.location.pathname;

  if (pathname === '/dev/engine-sandbox') {
    return <EngineSandboxPage />;
  }

  if (pathname === '/dev/self-test') {
    return <SelfTestPage />;
  }

  return <Dashboard />;
}
