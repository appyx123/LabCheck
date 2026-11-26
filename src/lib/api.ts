import type {
  BoardData,
  ClassItem,
  ClassRecapData,
  IclabsPreviewClass,
  IclabsSyncResponse,
  JoinClassResponse,
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

export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  return (err as { name?: string }).name === 'AbortError';
}

interface FetchOptions extends RequestInit {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const ICLABS_TIMEOUT_MS = 35_000;

async function fetchWithTimeout(path: string, options: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal, ...rest } = options;
  const controller = new AbortController();
  let timedOut = false;

  const onCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
  }

  const timer =
    timeoutMs > 0
      ? globalThis.setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;

  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      ...(rest.headers as Record<string, string> | undefined),
    };

    return await fetch(path, {
      ...rest,
      headers,
      credentials: 'include',
      signal: controller.signal,
    });
  } catch (err) {
    if (timedOut && !callerSignal?.aborted) {
      throw new ApiError('Koneksi timeout. Periksa jaringan lalu coba lagi.', 408);
    }
    throw err;
  } finally {
    if (timer !== null) globalThis.clearTimeout(timer);
    if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
  }
}

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const res = await fetchWithTimeout(path, options);
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

async function apiFetchWithRetry<T>(path: string, options: FetchOptions, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await apiFetch<T>(path, options);
    } catch (err) {
      lastErr = err;
      if (isAbortError(err)) throw err;
      if (
        err instanceof ApiError &&
        err.status >= 400 &&
        err.status < 500 &&
        err.status !== 408 &&
        err.status !== 429
      ) {
        throw err;
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 450 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

export type BoardFetchResult =
  | { notModified: true; etag: string }
  | { notModified: false; data: BoardData; etag: string | null };

export const api = {
  // Auth
  me: (signal?: AbortSignal) => apiFetch<{ user: User }>('/api/auth/me', { signal }),
  register: (body: { name: string; email: string; password: string }) =>
    apiFetch<{ user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    apiFetch<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  // Classes
  getClasses: (signal?: AbortSignal) =>
    apiFetch<{ classes: ClassItem[] }>('/api/classes', { signal }),
  getClass: (id: string, signal?: AbortSignal) =>
    apiFetch<{ class: ClassItem; modules: ModuleItem[] }>(`/api/classes/${id}`, { signal }),
  createClass: (body: { title: string; description?: string }) =>
    apiFetch<{ class: ClassItem }>('/api/classes', { method: 'POST', body: JSON.stringify(body) }),
  joinClass: (code: string) =>
    apiFetch<JoinClassResponse>('/api/classes/join', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  leaveClass: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/classes/${id}/leave`, { method: 'POST' }),
  updateClass: (id: string, body: { title?: string; description?: string | null }) =>
    apiFetch<{ class: ClassItem }>(`/api/classes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteClass: (id: string) => apiFetch<{ ok: boolean }>(`/api/classes/${id}`, { method: 'DELETE' }),

  // ICLabs Direct Sync (longer timeout for remote campus API)
  iclabsPreview: (body: { identitas: string; password: string; periode?: string }) =>
    apiFetch<{ iclabsToken: string; classes: IclabsPreviewClass[] }>('/api/iclabs/preview', {
      method: 'POST',
      body: JSON.stringify(body),
      timeoutMs: ICLABS_TIMEOUT_MS,
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
      timeoutMs: ICLABS_TIMEOUT_MS,
    }),

  // Students
  getStudents: (classId: string, signal?: AbortSignal) =>
    apiFetch<{ students: StudentItem[] }>(`/api/classes/${classId}/students`, { signal }),
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
      { method: 'POST', body: JSON.stringify({ students }), timeoutMs: 25_000 }
    ),
  updateStudent: (id: string, body: { nim?: string; name?: string; status?: string }) =>
    apiFetch<{ student: StudentItem }>(`/api/students/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteStudent: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/students/${id}`, { method: 'DELETE' }),

  // Modules
  getModules: (classId: string, signal?: AbortSignal) =>
    apiFetch<{ modules: ModuleItem[] }>(`/api/classes/${classId}/modules`, { signal }),
  createModule: (
    classId: string,
    body: { title: string; taskCount: number; moduleDate?: string | null }
  ) =>
    apiFetch<{ module: ModuleItem }>(`/api/classes/${classId}/modules`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateModule: (
    id: string,
    body: { title?: string; taskCount?: number; moduleDate?: string | null }
  ) =>
    apiFetch<{ module: ModuleItem }>(`/api/modules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteModule: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/modules/${id}`, { method: 'DELETE' }),

  // Board Checklist (ETag 304 conditional fetch + automatic network retry on mutations)
  getBoard: async (
    moduleId: string,
    opts?: { etag?: string | null; signal?: AbortSignal }
  ): Promise<BoardFetchResult> => {
    const headers: Record<string, string> = {};
    if (opts?.etag) headers['If-None-Match'] = opts.etag;

    const res = await fetchWithTimeout(`/api/modules/${moduleId}/board`, {
      headers,
      signal: opts?.signal,
    });
    const etag = res.headers.get('etag');

    if (res.status === 304) {
      return { notModified: true, etag: etag || opts?.etag || '' };
    }

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

    return { notModified: false, data: json as unknown as BoardData, etag };
  },
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
  getModuleRecap: (moduleId: string, signal?: AbortSignal) =>
    apiFetch<ModuleRecapData>(`/api/modules/${moduleId}/recap`, { signal }),
  getClassRecap: (classId: string, signal?: AbortSignal) =>
    apiFetch<ClassRecapData>(`/api/classes/${classId}/recap`, { signal }),
};
