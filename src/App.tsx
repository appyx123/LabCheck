import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from './lib/api';
import type { User } from './types';
import { AuthView } from './components/AuthView';
import { ClassesDashboard } from './components/ClassesDashboard';
import { ClassWorkspace } from './components/ClassWorkspace';
import { BoardChecklist } from './components/BoardChecklist';
import { ModuleRecapView } from './components/ModuleRecapView';

type Route =
  | { name: 'dashboard' }
  | { name: 'class'; classId: string }
  | { name: 'board'; moduleId: string }
  | { name: 'module-recap'; moduleId: string };

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const classMatch = raw.match(/^\/classes\/([^/]+)$/);
  if (classMatch) return { name: 'class', classId: decodeURIComponent(classMatch[1]) };

  const boardMatch = raw.match(/^\/modules\/([^/]+)\/board$/);
  if (boardMatch) return { name: 'board', moduleId: decodeURIComponent(boardMatch[1]) };

  const recapMatch = raw.match(/^\/modules\/([^/]+)\/recap$/);
  if (recapMatch) return { name: 'module-recap', moduleId: decodeURIComponent(recapMatch[1]) };

  return { name: 'dashboard' };
}

function navigate(path: string) {
  window.location.hash = path;
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [route, setRoute] = useState<Route>(() => parseHash());

  useEffect(() => {
    api
      .me()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  async function handleLogout() {
    await api.logout().catch(() => undefined);
    setUser(null);
    navigate('/');
  }

  if (authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#fafafa]">
        <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <AuthView
        onSuccess={(u) => {
          setUser(u);
          navigate('/');
        }}
      />
    );
  }

  if (route.name === 'board') {
    return (
      <BoardChecklist
        moduleId={route.moduleId}
        onBackToClass={(classId) => navigate(`/classes/${encodeURIComponent(classId)}`)}
        onOpenRecap={(moduleId) => navigate(`/modules/${encodeURIComponent(moduleId)}/recap`)}
      />
    );
  }

  if (route.name === 'module-recap') {
    return (
      <ModuleRecapView
        moduleId={route.moduleId}
        onBackToBoard={(moduleId) => navigate(`/modules/${encodeURIComponent(moduleId)}/board`)}
        onBackToClass={(classId) => navigate(`/classes/${encodeURIComponent(classId)}`)}
      />
    );
  }

  if (route.name === 'class') {
    return (
      <ClassWorkspace
        classId={route.classId}
        onBack={() => navigate('/')}
        onOpenBoard={(moduleId) => navigate(`/modules/${encodeURIComponent(moduleId)}/board`)}
        onOpenModuleRecap={(moduleId) =>
          navigate(`/modules/${encodeURIComponent(moduleId)}/recap`)
        }
      />
    );
  }

  return (
    <ClassesDashboard
      user={user}
      onLogout={handleLogout}
      onOpenClass={(classId) => navigate(`/classes/${encodeURIComponent(classId)}`)}
    />
  );
}
export default App;
