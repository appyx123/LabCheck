import { lazy, Suspense, useEffect, useState } from 'react';
import { api, isAbortError } from './lib/api';
import type { User } from './types';
import {
  AuthSkeleton,
  BoardSkeleton,
  DashboardSkeleton,
  RecapSkeleton,
  WorkspaceSkeleton,
} from './components/PageSkeletons';

const AuthView = lazy(() =>
  import('./components/AuthView').then((m) => ({ default: m.AuthView }))
);
const ClassesDashboard = lazy(() =>
  import('./components/ClassesDashboard').then((m) => ({ default: m.ClassesDashboard }))
);
const ClassWorkspace = lazy(() =>
  import('./components/ClassWorkspace').then((m) => ({ default: m.ClassWorkspace }))
);
const BoardChecklist = lazy(() =>
  import('./components/BoardChecklist').then((m) => ({ default: m.BoardChecklist }))
);
const ModuleRecapView = lazy(() =>
  import('./components/ModuleRecapView').then((m) => ({ default: m.ModuleRecapView }))
);

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

function RouteFallback({ route }: { route: Route }) {
  if (route.name === 'board') return <BoardSkeleton />;
  if (route.name === 'module-recap') return <RecapSkeleton />;
  if (route.name === 'class') return <WorkspaceSkeleton />;
  return <DashboardSkeleton />;
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [route, setRoute] = useState<Route>(() => parseHash());

  useEffect(() => {
    const controller = new AbortController();
    api
      .me(controller.signal)
      .then((res) => setUser(res.user))
      .catch((err) => {
        if (!isAbortError(err)) setUser(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setAuthLoading(false);
      });
    return () => controller.abort();
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
    return <RouteFallback route={route} />;
  }

  if (!user) {
    return (
      <Suspense fallback={<AuthSkeleton />}>
        <AuthView
          onSuccess={(u) => {
            setUser(u);
            navigate('/');
          }}
        />
      </Suspense>
    );
  }

  if (route.name === 'board') {
    return (
      <Suspense fallback={<BoardSkeleton />}>
        <BoardChecklist
          moduleId={route.moduleId}
          onBackToClass={(classId) => navigate(`/classes/${encodeURIComponent(classId)}`)}
          onOpenRecap={(moduleId) => navigate(`/modules/${encodeURIComponent(moduleId)}/recap`)}
        />
      </Suspense>
    );
  }

  if (route.name === 'module-recap') {
    return (
      <Suspense fallback={<RecapSkeleton />}>
        <ModuleRecapView
          moduleId={route.moduleId}
          onBackToBoard={(moduleId) => navigate(`/modules/${encodeURIComponent(moduleId)}/board`)}
          onBackToClass={(classId) => navigate(`/classes/${encodeURIComponent(classId)}`)}
        />
      </Suspense>
    );
  }

  if (route.name === 'class') {
    return (
      <Suspense fallback={<WorkspaceSkeleton />}>
        <ClassWorkspace
          classId={route.classId}
          onBack={() => navigate('/')}
          onOpenBoard={(moduleId) => navigate(`/modules/${encodeURIComponent(moduleId)}/board`)}
          onOpenModuleRecap={(moduleId) =>
            navigate(`/modules/${encodeURIComponent(moduleId)}/recap`)
          }
        />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <ClassesDashboard
        user={user}
        onLogout={handleLogout}
        onOpenClass={(classId) => navigate(`/classes/${encodeURIComponent(classId)}`)}
      />
    </Suspense>
  );
}
export default App;
