export const DEFAULT_ICLABS_BASE_URL = 'https://iclabs.fikom.umi.ac.id/api/v1';

export interface IclabsClassItem {
  id_kelas_kuliah: number | string;
  mata_kuliah?: {
    kode?: string;
    nama?: string;
  };
  kelompok?: {
    kode?: string;
    nama?: string;
  };
  periode_akademik?: {
    id?: number | string;
    nama?: string;
  };
  jumlah_peserta?: number;
}

export interface IclabsParticipant {
  nim: string;
  nama: string;
  status?: string;
}

export interface NormalizedIclabsClass {
  externalClassId: string;
  courseCode: string;
  courseName: string;
  groupName: string;
  suggestedTitle: string;
  participantCountHint: number | null;
}

export class IclabsApiError extends Error {
  status: number;
  errors?: unknown;

  constructor(message: string, status: number, errors?: unknown) {
    super(message);
    this.name = 'IclabsApiError';
    this.status = status;
    this.errors = errors;
  }
}

type FetchLike = typeof fetch;

async function iclabsRequest<T>(
  baseUrl: string,
  urlPath: string,
  options: {
    method?: string;
    token?: string;
    body?: unknown;
    retries?: number;
    fetchFn?: FetchLike;
  } = {}
): Promise<T> {
  const { method = 'GET', token, body, retries = 2, fetchFn = fetch } = options;
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetchFn(`${cleanBase}${urlPath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new IclabsApiError(
      `Tidak dapat terhubung ke server ICLabs (${err instanceof Error ? err.message : 'network error'})`,
      502
    );
  }

  if (res.status === 429 && retries > 0) {
    const waitSec = Math.min(Number(res.headers.get('retry-after') || 2), 10);
    await new Promise((r) => setTimeout(r, (waitSec + 1) * 1000));
    return iclabsRequest<T>(baseUrl, urlPath, { method, token, body, retries: retries - 1, fetchFn });
  }

  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    throw new IclabsApiError(
      `Respons ICLabs tidak valid (HTTP ${res.status}): ${text.slice(0, 120)}`,
      res.status >= 400 ? res.status : 502
    );
  }

  if (!res.ok) {
    const msg =
      (typeof json?.message === 'string' && json.message) || `Permintaan ICLabs gagal (HTTP ${res.status})`;
    throw new IclabsApiError(msg, res.status, json?.errors);
  }

  return json as T;
}

export async function iclabsLogin(
  baseUrl: string,
  identitas: string,
  password: string,
  namaPerangkat = 'labcheck-web',
  fetchFn: FetchLike = fetch
): Promise<string> {
  const json = await iclabsRequest<{ data?: { token?: string } }>(baseUrl, '/auth/login', {
    method: 'POST',
    body: {
      identitas,
      password,
      nama_perangkat: namaPerangkat,
    },
    fetchFn,
  });
  const token = json?.data?.token;
  if (!token) {
    throw new IclabsApiError('Login ICLabs berhasil tetapi token tidak ditemukan di respons.', 502);
  }
  return token;
}

export function normalizeIclabsClass(cls: IclabsClassItem): NormalizedIclabsClass {
  const externalClassId = String(cls.id_kelas_kuliah);
  const courseCode = (cls.mata_kuliah?.kode ?? '').trim();
  const courseName = (cls.mata_kuliah?.nama ?? '').trim();
  const groupName = (cls.kelompok?.kode ?? cls.kelompok?.nama ?? '').trim();

  const mainLabel = courseName || courseCode || `Kelas #${externalClassId}`;
  const withCode = courseCode && courseName ? `${courseCode} — ${courseName}` : mainLabel;
  const suggestedTitle = groupName ? `${withCode} (${groupName})` : withCode;

  return {
    externalClassId,
    courseCode,
    courseName,
    groupName,
    suggestedTitle,
    participantCountHint: typeof cls.jumlah_peserta === 'number' ? cls.jumlah_peserta : null,
  };
}

export async function iclabsGetClasses(
  baseUrl: string,
  token: string,
  periode?: string,
  fetchFn: FetchLike = fetch
): Promise<NormalizedIclabsClass[]> {
  const items: IclabsClassItem[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const qs = new URLSearchParams({ per_page: '100', page: String(page) });
    if (periode && periode.trim()) {
      qs.set('id_periode_akademik', periode.trim());
    }
    const json = await iclabsRequest<{
      data?: IclabsClassItem[];
      meta?: { last_page?: number };
    }>(baseUrl, `/praktikum/kelas?${qs.toString()}`, {
      token,
      fetchFn,
    });
    items.push(...(json.data || []));
    const lastPage = json.meta?.last_page ?? 1;
    if (page >= lastPage) break;
  }
  return items.map(normalizeIclabsClass);
}

export async function iclabsGetParticipants(
  baseUrl: string,
  token: string,
  classId: string,
  fetchFn: FetchLike = fetch
): Promise<IclabsParticipant[]> {
  const json = await iclabsRequest<{ data?: { peserta?: IclabsParticipant[] } }>(
    baseUrl,
    `/praktikum/kelas/${encodeURIComponent(classId)}`,
    { token, fetchFn }
  );
  const list = json?.data?.peserta || [];
  return list
    .map((p) => ({
      nim: String(p.nim ?? '').trim(),
      nama: String(p.nama ?? '').trim(),
      status: String(p.status ?? 'AKTIF').trim() || 'AKTIF',
    }))
    .filter((p) => p.nim.length > 0 && p.nama.length > 0);
}
