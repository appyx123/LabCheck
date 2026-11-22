import type {
  BoardData,
  ClassItem,
  ClassRecapData,
  IclabsPreviewClass,
  IclabsSyncResponse,
  ModuleItem,
  ModuleRecapData,
  StudentItem,
  User,
} from '../types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    if (!res.ok) throw new ApiError(`Kesalahan server (HTTP ${res.status})`, res.status);
  }

  if (!res.ok) {
    const errMsg =
      (typeof json?.error === 'string' && json.error) ||
      (typeof json?.message === 'string' && json.message) ||
      `Permintaan gagal (HTTP ${res.status})`;
    throw new ApiError(errMsg, res.status);
  }

  return json as T;
}

async function apiFetchWithRetry<T>(path: string, options: RequestInit, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await apiFetch<T>(path, options);
    } catch (err) {
      lastErr = err;
      if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 429) {
        throw err;
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 450 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

export const api = {
  // Auth
  me: () => apiFetch<{ user: User }>('/api/auth/me'),
  register: (body: { name: string; email: string; password: string }) =>
    apiFetch<{ user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    apiFetch<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  // Classes
  getClasses: () => apiFetch<{ classes: ClassItem[] }>('/api/classes'),
  getClass: (id: string) =>
    apiFetch<{ class: ClassItem; modules: ModuleItem[] }>(`/api/classes/${id}`),
  createClass: (body: { title: string; description?: string }) =>
    apiFetch<{ class: ClassItem }>('/api/classes', { method: 'POST', body: JSON.stringify(body) }),
  updateClass: (id: string, body: { title?: string; description?: string | null }) =>
    apiFetch<{ class: ClassItem }>(`/api/classes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteClass: (id: string) => apiFetch<{ ok: boolean }>(`/api/classes/${id}`, { method: 'DELETE' }),

  // ICLabs Direct Sync
  iclabsPreview: (body: { identitas: string; password: string; periode?: string }) =>
    apiFetch<{ iclabsToken: string; classes: IclabsPreviewClass[] }>('/api/iclabs/preview', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  iclabsSync: (body: {
    iclabsToken?: string;
    identitas?: string;
    password?: string;
    periode?: string;
    classes: Array<{
      externalClassId: string;
      title: string;
      courseCode?: string;
      groupName?: string;
    }>;
  }) =>
    apiFetch<IclabsSyncResponse>('/api/iclabs/sync', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Students
  getStudents: (classId: string) =>
    apiFetch<{ students: StudentItem[] }>(`/api/classes/${classId}/students`),
  createStudent: (classId: string, body: { nim: string; name: string; status?: string }) =>
    apiFetch<{ student: StudentItem }>(`/api/classes/${classId}/students`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  importStudents: (
    classId: string,
    students: Array<{ nim: string; name: string; status?: string }>
  ) =>
    apiFetch<{ inserted: number; updated: number; total: number }>(
      `/api/classes/${classId}/students/import`,
      { method: 'POST', body: JSON.stringify({ students }) }
    ),
  updateStudent: (id: string, body: { nim?: string; name?: string; status?: string }) =>
    apiFetch<{ student: StudentItem }>(`/api/students/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteStudent: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/students/${id}`, { method: 'DELETE' }),

  // Modules
  getModules: (classId: string) =>
    apiFetch<{ modules: ModuleItem[] }>(`/api/classes/${classId}/modules`),
  createModule: (classId: string, body: { title: string; taskCount: number }) =>
    apiFetch<{ module: ModuleItem }>(`/api/classes/${classId}/modules`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateModule: (id: string, body: { title?: string; taskCount?: number }) =>
    apiFetch<{ module: ModuleItem }>(`/api/modules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteModule: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/modules/${id}`, { method: 'DELETE' }),

  // Board Checklist (with automatic network retry)
  getBoard: (moduleId: string) => apiFetch<BoardData>(`/api/modules/${moduleId}/board`),
  toggleTask: (
    moduleId: string,
    body: { studentId: string; taskNumber: number; completed: boolean }
  ) =>
    apiFetchWithRetry<{ ok: boolean }>(`/api/modules/${moduleId}/toggle`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  completeAllTasks: (moduleId: string, body: { studentId: string; completed: boolean }) =>
    apiFetchWithRetry<{ ok: boolean }>(`/api/modules/${moduleId}/complete-all`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Recaps
  getModuleRecap: (moduleId: string) =>
    apiFetch<ModuleRecapData>(`/api/modules/${moduleId}/recap`),
  getClassRecap: (classId: string) => apiFetch<ClassRecapData>(`/api/classes/${classId}/recap`),
};
