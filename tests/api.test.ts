import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../server/app';
import { createNodeDb } from '../server/db/node';
import { calcAverage, calcModuleScore, pointsPerTask } from '../server/lib/scoring';

function extractCookie(res: Response): string {
  const raw = res.headers.get('set-cookie') || '';
  return raw.split(';')[0] || '';
}

describe('Scoring helpers (PRD FR-MOD-02 — Ceiling / Integer Only)', () => {
  it('calculates rounded-up integer weights and scores without decimals', () => {
    expect(pointsPerTask(4)).toBe(25);
    expect(pointsPerTask(6)).toBe(17);
    expect(pointsPerTask(8)).toBe(13);

    expect(calcModuleScore(0, 4)).toBe(0);
    expect(calcModuleScore(3, 4)).toBe(75);
    expect(calcModuleScore(1, 6)).toBe(17);
    expect(calcModuleScore(4, 6)).toBe(67);
    expect(calcModuleScore(6, 6)).toBe(100);
    expect(calcAverage([75, 100])).toBe(88);
    expect(calcAverage([25, 0])).toBe(13);
  });
});

describe('LabCheck Full API (Auth, Isolation, Manual + ICLabs Sync, Board, Recap)', () => {
  let app: ReturnType<typeof createApp>;
  let mockFetch: typeof fetch;

  beforeEach(async () => {
    const { db } = await createNodeDb(':memory:');

    // Mock backend ICLabs API matching rekap-peserta.mjs endpoints
    mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/login') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body || '{}'));
        if (body.identitas === 'asisten@umi.ac.id' && body.password === 'rahasia') {
          return new Response(JSON.stringify({ data: { token: 'iclabs-token-xyz' } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ message: 'Kredensial ICLabs salah' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/praktikum/kelas?') && init?.headers) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id_kelas_kuliah: 101,
                mata_kuliah: { kode: 'IF201', nama: 'Jaringan Komputer' },
                kelompok: { kode: 'A' },
                jumlah_peserta: 2,
              },
              {
                id_kelas_kuliah: 102,
                mata_kuliah: { kode: 'IF201', nama: 'Jaringan Komputer' },
                kelompok: { kode: 'B' },
                jumlah_peserta: 1,
              },
            ],
            meta: { last_page: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/praktikum/kelas/101')) {
        return new Response(
          JSON.stringify({
            data: {
              peserta: [
                { nim: '13020230001', nama: 'Ahmad Fauzi', status: 'AKTIF' },
                { nim: '13020230002', nama: 'Budi Santoso', status: 'AKTIF' },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
    }) as typeof fetch;

    app = createApp({
      dbFactory: () => db,
      fetchFn: mockFetch,
      defaultJwtSecret: 'test-secret-key-for-labcheck-unit-tests-123456',
      defaultIclabsBaseUrl: 'https://iclabs.mock/api/v1',
    });
  });

  async function registerUser(name: string, email: string, password = 'password123') {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    expect(res.status).toBe(201);
    return {
      cookie: extractCookie(res),
      body: (await res.json()) as { user: { id: string; name: string; email: string } },
    };
  }

  it('registers, logs in, checks /me, and isolates workspaces between assistants', async () => {
    const u1 = await registerUser('Asisten Satu', 'satu@lab.ac.id');
    const u2 = await registerUser('Asisten Dua', 'dua@lab.ac.id');

    const meRes = await app.request('/api/auth/me', { headers: { Cookie: u1.cookie } });
    expect(meRes.status).toBe(200);
    expect((await meRes.json()).user.email).toBe('satu@lab.ac.id');

    // User 1 creates a manual class
    const clsRes = await app.request('/api/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: u1.cookie },
      body: JSON.stringify({ title: 'Pemrograman Web — Kelas A' }),
    });
    expect(clsRes.status).toBe(201);
    const createdClass = (await clsRes.json()).class;

    // User 2 cannot access User 1's class
    const forbiddenRes = await app.request(`/api/classes/${createdClass.id}`, {
      headers: { Cookie: u2.cookie },
    });
    expect(forbiddenRes.status).toBe(404);
  });

  it('syncs classes & participants directly from ICLabs and preserves completions on re-sync', async () => {
    const u1 = await registerUser('Asisten ICLabs', 'rafli@lab.ac.id');

    // 1. Preview ICLabs classes
    const prevRes = await app.request('/api/iclabs/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: u1.cookie },
      body: JSON.stringify({ identitas: 'asisten@umi.ac.id', password: 'rahasia' }),
    });
    expect(prevRes.status).toBe(200);
    const preview = await prevRes.json();
    expect(preview.classes).toHaveLength(2);
    expect(preview.classes[0].externalClassId).toBe('101');
    expect(preview.classes[0].alreadySynced).toBe(false);

    // 2. Sync class 101
    const syncRes = await app.request('/api/iclabs/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: u1.cookie },
      body: JSON.stringify({
        iclabsToken: preview.iclabsToken,
        classes: [
          {
            externalClassId: '101',
            title: preview.classes[0].suggestedTitle,
            courseCode: 'IF201',
            groupName: 'A',
          },
        ],
      }),
    });
    expect(syncRes.status).toBe(200);
    const syncData = await syncRes.json();
    expect(syncData.summary.classesCreated).toBe(1);
    expect(syncData.summary.studentsInserted).toBe(2);
    const classId = syncData.syncedClasses[0].id;

    // 3. Create module & check a task for student 1
    const modRes = await app.request(`/api/classes/${classId}/modules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: u1.cookie },
      body: JSON.stringify({ title: 'Modul 1: Subnetting', taskCount: 4 }),
    });
    const modId = (await modRes.json()).module.id;

    const boardRes1 = await app.request(`/api/modules/${modId}/board`, {
      headers: { Cookie: u1.cookie },
    });
    const board1 = await boardRes1.json();
    expect(board1.students).toHaveLength(2);
    const stu1 = board1.students[0];

    await app.request(`/api/modules/${modId}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: u1.cookie },
      body: JSON.stringify({ studentId: stu1.id, taskNumber: 1, completed: true }),
    });

    // 4. Re-sync class 101 -> should update class, NOT delete completions
    const resyncRes = await app.request('/api/iclabs/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: u1.cookie },
      body: JSON.stringify({
        identitas: 'asisten@umi.ac.id',
        password: 'rahasia',
        classes: [{ externalClassId: '101', title: 'IF201 — Jaringan Komputer (A)' }],
      }),
    });
    expect(resyncRes.status).toBe(200);
    const resyncData = await resyncRes.json();
    expect(resyncData.summary.classesUpdated).toBe(1);
    expect(resyncData.summary.studentsInserted).toBe(0);

    const boardRes2 = await app.request(`/api/modules/${modId}/board`, {
      headers: { Cookie: u1.cookie },
    });
    const board2 = await boardRes2.json();
    expect(board2.completions[stu1.id]).toEqual([1]);
  });

  it('handles manual import, idempotent toggle, taskCount shrink pruning, and recaps', async () => {
    const u = await registerUser('Asisten Manual', 'manual@lab.ac.id');

    const clsRes = await app.request('/api/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: u.cookie },
      body: JSON.stringify({ title: 'Basis Data — Kelas B' }),
    });
    const classId = (await clsRes.json()).class.id;

    // Import students with a duplicate NIM
    const impRes = await app.request(`/api/classes/${classId}/students/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: u.cookie },
      body: JSON.stringify({
        students: [
          { nim: '001', name: 'Alya' },
          { nim: '002', name: 'Bima' },
          { nim: '001', name: 'Alya Rahma' },
        ],
      }),
    });
    expect(impRes.status).toBe(200);
    const impData = await impRes.json();
    expect(impData.inserted).toBe(2);

    // Module 1 (6 tasks) & Module 2 (4 tasks)
    const m1 = (
      await (
        await app.request(`/api/classes/${classId}/modules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: u.cookie },
          body: JSON.stringify({ title: 'Modul 1', taskCount: 6 }),
        })
      ).json()
    ).module;

    const m2 = (
      await (
        await app.request(`/api/classes/${classId}/modules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: u.cookie },
          body: JSON.stringify({ title: 'Modul 2', taskCount: 4 }),
        })
      ).json()
    ).module;

    const stuList = (
      await (
        await app.request(`/api/classes/${classId}/students`, { headers: { Cookie: u.cookie } })
      ).json()
    ).students;
    const alya = stuList.find((s: { nim: string }) => s.nim === '001');
    const bima = stuList.find((s: { nim: string }) => s.nim === '002');

    // Complete all 6 tasks for Alya in Modul 1, then shrink Modul 1 to 4 tasks
    await app.request(`/api/modules/${m1.id}/complete-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: u.cookie },
      body: JSON.stringify({ studentId: alya.id, completed: true }),
    });

    // Idempotent duplicate toggle for Bima task 1 & task 5
    await app.request(`/api/modules/${m1.id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: u.cookie },
      body: JSON.stringify({ studentId: bima.id, taskNumber: 1, completed: true }),
    });
    await app.request(`/api/modules/${m1.id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: u.cookie },
      body: JSON.stringify({ studentId: bima.id, taskNumber: 1, completed: true }),
    });
    await app.request(`/api/modules/${m1.id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: u.cookie },
      body: JSON.stringify({ studentId: bima.id, taskNumber: 5, completed: true }),
    });

    // Shrink Modul 1 from 6 tasks to 4 tasks -> task 5 & 6 pruned!
    const patchRes = await app.request(`/api/modules/${m1.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: u.cookie },
      body: JSON.stringify({ taskCount: 4 }),
    });
    expect(patchRes.status).toBe(200);

    // Module 1 recap: Alya 4/4 (100), Bima 1/4 (25) -> avg ceil(62.5) = 63
    const modRecap = await (
      await app.request(`/api/modules/${m1.id}/recap`, { headers: { Cookie: u.cookie } })
    ).json();
    expect(modRecap.summary.completedAllCount).toBe(1);
    expect(modRecap.summary.averageScore).toBe(63);
    expect(modRecap.students.find((s: { nim: string }) => s.nim === '002').score).toBe(25);

    // Module 2: Alya 2/4 (50)
    await app.request(`/api/modules/${m2.id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: u.cookie },
      body: JSON.stringify({ studentId: alya.id, taskNumber: 1, completed: true }),
    });
    await app.request(`/api/modules/${m2.id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: u.cookie },
      body: JSON.stringify({ studentId: alya.id, taskNumber: 2, completed: true }),
    });

    // Class recap: Alya avg(100, 50) = 75, Bima avg(25, 0) = ceil(12.5) = 13 -> class avg ceil(44) = 44
    const clsRecap = await (
      await app.request(`/api/classes/${classId}/recap`, { headers: { Cookie: u.cookie } })
    ).json();
    expect(clsRecap.students.find((s: { nim: string }) => s.nim === '001').finalScore).toBe(75);
    expect(clsRecap.students.find((s: { nim: string }) => s.nim === '002').finalScore).toBe(13);
    expect(clsRecap.summary.classAverage).toBe(44);
  });

  it('handles large bulk student insert (>80) and batch update (>50) cleanly', async () => {
    const u = await registerUser('Asisten Bulk', 'bulk@lab.ac.id');
    const clsRes = await app.request('/api/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: u.cookie },
      body: JSON.stringify({ title: 'Algoritma — Kelas Besar' }),
    });
    const classId = (await clsRes.json()).class.id;

    // Insert 120 students (crosses 80-row insert chunk boundary)
    const initialBatch = Array.from({ length: 120 }, (_, i) => ({
      nim: `1302024${String(i + 1).padStart(4, '0')}`,
      name: `Mahasiswa ${i + 1}`,
      status: 'AKTIF',
    }));
    const imp1 = await app.request(`/api/classes/${classId}/students/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: u.cookie },
      body: JSON.stringify({ students: initialBatch }),
    });
    expect(imp1.status).toBe(200);
    expect(await imp1.json()).toEqual({ inserted: 120, updated: 0, total: 120 });

    // Update 60 existing students (crosses 50-statement batch boundary) + insert 10 new
    const secondBatch = [
      ...Array.from({ length: 60 }, (_, i) => ({
        nim: `1302024${String(i + 1).padStart(4, '0')}`,
        name: `Mahasiswa Baru ${i + 1}`,
        status: 'AKTIF',
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        nim: `1302024${String(121 + i).padStart(4, '0')}`,
        name: `Mahasiswa ${121 + i}`,
        status: 'AKTIF',
      })),
    ];
    const imp2 = await app.request(`/api/classes/${classId}/students/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: u.cookie },
      body: JSON.stringify({ students: secondBatch }),
    });
    expect(imp2.status).toBe(200);
    expect(await imp2.json()).toEqual({ inserted: 10, updated: 60, total: 70 });

    const listRes = await app.request(`/api/classes/${classId}/students`, {
      headers: { Cookie: u.cookie },
    });
    const listData = await listRes.json();
    expect(listData.students).toHaveLength(130);
    expect(listData.students[0].name).toBe('Mahasiswa Baru 1');
  });
});
