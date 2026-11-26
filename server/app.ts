import { Hono, type MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import {
  users,
  classes,
  classMembers,
  students,
  modules,
  taskCompletions,
} from './db/schema';
import type { AppDb } from './db/client';
import { createWebDb } from './db/web';
import {
  hashPassword,
  verifyPassword,
  signJwt,
  verifyJwt,
  newId,
  generateSyncCode,
  normalizeSyncCode,
} from './lib/crypto';
import { calcAverage, calcModuleScore, pointsPerTask, roundScore } from './lib/scoring';
import {
  DEFAULT_ICLABS_BASE_URL,
  IclabsApiError,
  iclabsGetClasses,
  iclabsGetParticipants,
  iclabsLogin,
} from './lib/iclabs';

export interface AppBindings {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  JWT_SECRET?: string;
  ICLABS_BASE_URL?: string;
}

interface AuthUser {
  id: string;
  name: string;
  email: string;
}

interface AppVariables {
  db: AppDb;
  user: AuthUser;
}

export interface CreateAppOptions {
  dbFactory?: (env: AppBindings) => AppDb;
  fetchFn?: typeof fetch;
  defaultJwtSecret?: string;
  defaultIclabsBaseUrl?: string;
}

const SESSION_COOKIE = 'labcheck_session';

function getJwtSecret(env: AppBindings, fallback?: string): string {
  return env.JWT_SECRET || fallback || 'labcheck-dev-secret-change-in-production-32chars';
}

function getIclabsBaseUrl(env: AppBindings, fallback?: string): string {
  return (env.ICLABS_BASE_URL || fallback || DEFAULT_ICLABS_BASE_URL).replace(/\/+$/, '');
}

function isSecureRequest(url: string, protoHeader?: string): boolean {
  if (protoHeader === 'https') return true;
  return url.startsWith('https://');
}

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(100),
  email: z.string().trim().email('Format email tidak valid').transform((v) => v.toLowerCase()),
  password: z.string().min(6, 'Password minimal 6 karakter').max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email('Format email tidak valid').transform((v) => v.toLowerCase()),
  password: z.string().min(1, 'Password wajib diisi'),
});

const classCreateSchema = z.object({
  title: z.string().trim().min(1, 'Judul kelas wajib diisi').max(150),
  description: z.string().trim().max(500).optional().nullable(),
});

const classUpdateSchema = z.object({
  title: z.string().trim().min(1, 'Judul kelas tidak boleh kosong').max(150).optional(),
  description: z.string().trim().max(500).optional().nullable(),
});

const joinClassSchema = z.object({
  code: z.string().trim().min(4, 'Kode kelas tidak valid').max(32),
});

const studentSchema = z.object({
  nim: z.string().trim().min(1, 'NIM wajib diisi').max(50),
  name: z.string().trim().min(1, 'Nama praktikan wajib diisi').max(150),
  status: z.string().trim().max(40).optional(),
});

const studentUpdateSchema = z.object({
  nim: z.string().trim().min(1, 'NIM wajib diisi').max(50).optional(),
  name: z.string().trim().min(1, 'Nama wajib diisi').max(150).optional(),
  status: z.string().trim().max(40).optional(),
});

const importStudentsSchema = z.object({
  students: z.array(studentSchema).min(1, 'Daftar praktikan tidak boleh kosong').max(1000),
});

const moduleDateSchema = z
  .union([
    z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid (YYYY-MM-DD)'),
    z.literal(''),
    z.null(),
  ])
  .optional()
  .transform((v) => (v === undefined ? undefined : v || null));

const moduleCreateSchema = z.object({
  title: z.string().trim().min(1, 'Judul modul wajib diisi').max(150),
  taskCount: z.number().int().min(1, 'Minimal 1 tugas').max(30, 'Maksimal 30 tugas'),
  moduleDate: moduleDateSchema,
});

const moduleUpdateSchema = z.object({
  title: z.string().trim().min(1, 'Judul modul tidak boleh kosong').max(150).optional(),
  taskCount: z.number().int().min(1, 'Minimal 1 tugas').max(30, 'Maksimal 30 tugas').optional(),
  moduleDate: moduleDateSchema,
});

const toggleSchema = z.object({
  studentId: z.string().min(1),
  taskNumber: z.number().int().min(1).max(30),
  completed: z.boolean(),
});

const completeAllSchema = z.object({
  studentId: z.string().min(1),
  completed: z.boolean(),
});

const iclabsPreviewSchema = z.object({
  identitas: z.string().trim().min(1, 'Identitas (email/username) ICLabs wajib diisi'),
  password: z.string().min(1, 'Password ICLabs wajib diisi'),
  periode: z.string().trim().optional(),
});

const iclabsSyncClassInputSchema = z.object({
  externalClassId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(150),
  courseCode: z.string().trim().max(50).optional().default(''),
  groupName: z.string().trim().max(80).optional().default(''),
});

const iclabsSyncSchema = z
  .object({
    iclabsToken: z.string().trim().min(1).optional(),
    identitas: z.string().trim().min(1).optional(),
    password: z.string().min(1).optional(),
    periode: z.string().trim().optional(),
    classes: z.array(iclabsSyncClassInputSchema).min(1, 'Pilih minimal 1 kelas untuk disinkronkan').max(50),
  })
  .refine((data) => Boolean(data.iclabsToken || (data.identitas && data.password)), {
    message: 'Sertakan sesi ICLabs atau kredensial identitas & password ICLabs',
  });

const INSERT_CHUNK_SIZE = 80;
const UPDATE_BATCH_SIZE = 50;

async function generateUniqueSyncCode(db: AppDb): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateSyncCode();
    const [existing] = await db
      .select({ id: classes.id })
      .from(classes)
      .where(eq(classes.syncCode, code))
      .limit(1);
    if (!existing) return code;
  }
  throw new Error('Gagal menghasilkan kode kelas unik.');
}

async function getClassWithMembership(db: AppDb, classId: string, userId: string) {
  const [row] = await db
    .select({ cls: classes, role: classMembers.role })
    .from(classMembers)
    .innerJoin(classes, eq(classMembers.classId, classes.id))
    .where(and(eq(classMembers.classId, classId), eq(classMembers.userId, userId)))
    .limit(1);
  return row ?? null;
}

async function getStudentWithMembership(db: AppDb, studentId: string, userId: string) {
  const [row] = await db
    .select({ student: students, role: classMembers.role })
    .from(students)
    .innerJoin(
      classMembers,
      and(eq(classMembers.classId, students.classId), eq(classMembers.userId, userId))
    )
    .where(eq(students.id, studentId))
    .limit(1);
  return row ?? null;
}

async function getModuleWithMembership(db: AppDb, moduleId: string, userId: string) {
  const [row] = await db
    .select({ mod: modules, cls: classes, role: classMembers.role })
    .from(modules)
    .innerJoin(classes, eq(modules.classId, classes.id))
    .innerJoin(
      classMembers,
      and(eq(classMembers.classId, classes.id), eq(classMembers.userId, userId))
    )
    .where(eq(modules.id, moduleId))
    .limit(1);
  return row ?? null;
}

async function upsertStudentsBatch(
  db: AppDb,
  classId: string,
  incoming: Array<{ nim: string; name: string; status?: string }>,
  options: { skipExistingLookup?: boolean } = {}
): Promise<{ inserted: number; updated: number; total: number }> {
  // Deduplicate incoming by trimmed NIM (last occurrence wins)
  const deduped = new Map<string, { nim: string; name: string; status: string }>();
  for (const item of incoming) {
    const nim = item.nim.trim();
    const name = item.name.trim();
    if (!nim || !name) continue;
    deduped.set(nim, {
      nim,
      name,
      status: (item.status || 'AKTIF').trim() || 'AKTIF',
    });
  }

  if (deduped.size === 0) {
    return { inserted: 0, updated: 0, total: 0 };
  }

  const existingRows = options.skipExistingLookup
    ? []
    : await db
        .select({ id: students.id, nim: students.nim, name: students.name, status: students.status })
        .from(students)
        .where(eq(students.classId, classId));

  const existingByNim = new Map(existingRows.map((r) => [r.nim, r]));

  const now = new Date();
  const toInsert: Array<{
    id: string;
    classId: string;
    nim: string;
    name: string;
    status: string;
    createdAt: Date;
  }> = [];
  const toUpdate: Array<{ id: string; name: string; status: string }> = [];

  for (const row of deduped.values()) {
    const existing = existingByNim.get(row.nim);
    if (existing) {
      if (existing.name !== row.name || existing.status !== row.status) {
        toUpdate.push({ id: existing.id, name: row.name, status: row.status });
      }
    } else {
      toInsert.push({
        id: newId(),
        classId,
        nim: row.nim,
        name: row.name,
        status: row.status,
        createdAt: now,
      });
    }
  }

  // Multi-row bulk insert per chunk -> 1 subrequest per 80 rows (Cloudflare Workers 50-subrequest friendly)
  for (let i = 0; i < toInsert.length; i += INSERT_CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + INSERT_CHUNK_SIZE);
    await db.insert(students).values(chunk);
  }

  // Pipelined batch updates -> 1 subrequest per 50 updates
  for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH_SIZE) {
    const chunk = toUpdate.slice(i, i + UPDATE_BATCH_SIZE);
    const queries = chunk.map((u) =>
      db
        .update(students)
        .set({ name: u.name, status: u.status })
        .where(eq(students.id, u.id))
    );
    if (queries.length > 0) {
      await db.batch(queries as [(typeof queries)[0], ...(typeof queries)]);
    }
  }

  return { inserted: toInsert.length, updated: toUpdate.length, total: deduped.size };
}

export function createApp(options: CreateAppOptions = {}) {
  const app = new Hono<{ Bindings: AppBindings; Variables: AppVariables }>();

  app.onError((err, c) => {
    console.error('[LabCheck API Error]', err);
    const detail = err instanceof Error ? err.message : 'Unexpected server error';
    return c.json({ error: `Kesalahan server: ${detail}` }, 500);
  });

  // Attach DB per request
  app.use('/api/*', async (c, next) => {
    const env = c.env || {};
    if (!options.dbFactory && !env.TURSO_DATABASE_URL) {
      return c.json(
        { error: 'Konfigurasi TURSO_DATABASE_URL belum diatur di environment server.' },
        500
      );
    }
    const db = options.dbFactory
      ? options.dbFactory(env)
      : createWebDb(env.TURSO_DATABASE_URL || '', env.TURSO_AUTH_TOKEN);
    c.set('db', db);
    await next();
  });

  app.get('/api/health', (c) => c.json({ ok: true, service: 'labcheck' }));

  // ==================== AUTH ====================
  app.post('/api/auth/register', zValidator('json', registerSchema), async (c) => {
    const db = c.get('db');
    const { name, email, password } = c.req.valid('json');

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return c.json({ error: 'Email sudah terdaftar. Silakan login.' }, 409);
    }

    const id = newId();
    const passwordHash = await hashPassword(password);
    const createdAt = new Date();

    await db.insert(users).values({ id, name, email, passwordHash, createdAt });

    const token = await signJwt({ sub: id, email, name }, getJwtSecret(c.env || {}, options.defaultJwtSecret));
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: isSecureRequest(c.req.url, c.req.header('x-forwarded-proto')),
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return c.json({ user: { id, name, email } }, 201);
  });

  app.post('/api/auth/login', zValidator('json', loginSchema), async (c) => {
    const db = c.get('db');
    const { email, password } = c.req.valid('json');

    const [found] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!found) {
      return c.json({ error: 'Email atau password salah.' }, 401);
    }

    const ok = await verifyPassword(password, found.passwordHash);
    if (!ok) {
      return c.json({ error: 'Email atau password salah.' }, 401);
    }

    const token = await signJwt(
      { sub: found.id, email: found.email, name: found.name },
      getJwtSecret(c.env || {}, options.defaultJwtSecret)
    );
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: isSecureRequest(c.req.url, c.req.header('x-forwarded-proto')),
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return c.json({ user: { id: found.id, name: found.name, email: found.email } });
  });

  app.post('/api/auth/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  // Auth middleware for protected routes
  const requireAuth: MiddlewareHandler<{ Bindings: AppBindings; Variables: AppVariables }> = async (
    c,
    next
  ) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) {
      return c.json({ error: 'Sesi tidak ditemukan. Silakan login.' }, 401);
    }
    const payload = await verifyJwt(token, getJwtSecret(c.env || {}, options.defaultJwtSecret));
    if (!payload) {
      return c.json({ error: 'Sesi sudah berakhir. Silakan login kembali.' }, 401);
    }
    const db = c.get('db');
    const [found] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!found) {
      return c.json({ error: 'Akun tidak ditemukan.' }, 401);
    }

    c.set('user', found);
    await next();
  };

  app.get('/api/auth/me', requireAuth, (c) => {
    return c.json({ user: c.get('user') });
  });

  // Apply requireAuth to all protected routes
  app.use('/api/classes/*', requireAuth);
  app.use('/api/classes', requireAuth);
  app.use('/api/students/*', requireAuth);
  app.use('/api/modules/*', requireAuth);
  app.use('/api/iclabs/*', requireAuth);

  // ==================== CLASSES ====================
  app.get('/api/classes', async (c) => {
    const db = c.get('db');
    const user = c.get('user');

    const memberRows = await db
      .select({
        cls: classes,
        role: classMembers.role,
        joinedAt: classMembers.joinedAt,
      })
      .from(classMembers)
      .innerJoin(classes, eq(classMembers.classId, classes.id))
      .where(eq(classMembers.userId, user.id))
      .orderBy(desc(classMembers.joinedAt), desc(classes.createdAt));

    if (memberRows.length === 0) {
      return c.json({ classes: [] });
    }

    const classIds = memberRows.map((row) => row.cls.id);

    const [studentCounts, moduleCounts, memberCounts] = await Promise.all([
      db
        .select({
          classId: students.classId,
          count: sql<number>`count(*)`,
        })
        .from(students)
        .where(inArray(students.classId, classIds))
        .groupBy(students.classId),
      db
        .select({
          classId: modules.classId,
          count: sql<number>`count(*)`,
        })
        .from(modules)
        .where(inArray(modules.classId, classIds))
        .groupBy(modules.classId),
      db
        .select({
          classId: classMembers.classId,
          count: sql<number>`count(*)`,
        })
        .from(classMembers)
        .where(inArray(classMembers.classId, classIds))
        .groupBy(classMembers.classId),
    ]);

    const studentMap = new Map(studentCounts.map((r) => [r.classId, Number(r.count)]));
    const moduleMap = new Map(moduleCounts.map((r) => [r.classId, Number(r.count)]));
    const memberMap = new Map(memberCounts.map((r) => [r.classId, Number(r.count)]));

    return c.json({
      classes: memberRows.map(({ cls: cl, role }) => ({
        id: cl.id,
        title: cl.title,
        description: cl.description,
        source: cl.source,
        externalClassId: cl.externalClassId,
        syncCode: cl.syncCode || '',
        courseCode: cl.courseCode,
        groupName: cl.groupName,
        role,
        memberCount: memberMap.get(cl.id) ?? 1,
        lastSyncedAt: cl.lastSyncedAt ? cl.lastSyncedAt.toISOString() : null,
        createdAt: cl.createdAt.toISOString(),
        studentCount: studentMap.get(cl.id) ?? 0,
        moduleCount: moduleMap.get(cl.id) ?? 0,
      })),
    });
  });

  app.post('/api/classes', zValidator('json', classCreateSchema), async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const { title, description } = c.req.valid('json');

    const id = newId();
    const syncCode = await generateUniqueSyncCode(db);
    const createdAt = new Date();
    await db.insert(classes).values({
      id,
      userId: user.id,
      title,
      description: description || null,
      source: 'manual',
      syncCode,
      createdAt,
    });
    await db.insert(classMembers).values({
      id: newId(),
      classId: id,
      userId: user.id,
      role: 'owner',
      joinedAt: createdAt,
    });

    return c.json(
      {
        class: {
          id,
          title,
          description: description || null,
          source: 'manual',
          externalClassId: null,
          syncCode,
          courseCode: null,
          groupName: null,
          role: 'owner',
          memberCount: 1,
          lastSyncedAt: null,
          createdAt: createdAt.toISOString(),
          studentCount: 0,
          moduleCount: 0,
        },
      },
      201
    );
  });

  app.post('/api/classes/join', zValidator('json', joinClassSchema), async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const normalized = normalizeSyncCode(c.req.valid('json').code);

    const [cls] = await db
      .select()
      .from(classes)
      .where(eq(classes.syncCode, normalized))
      .limit(1);

    if (!cls) {
      return c.json({ error: 'Kode kelas tidak ditemukan. Periksa kembali kode unik kelas.' }, 404);
    }

    const [existingMember] = await db
      .select({ id: classMembers.id, role: classMembers.role })
      .from(classMembers)
      .where(and(eq(classMembers.classId, cls.id), eq(classMembers.userId, user.id)))
      .limit(1);

    const alreadyMember = Boolean(existingMember);
    const role = existingMember?.role ?? 'member';

    if (!alreadyMember) {
      await db
        .insert(classMembers)
        .values({
          id: newId(),
          classId: cls.id,
          userId: user.id,
          role: 'member',
          joinedAt: new Date(),
        })
        .onConflictDoNothing({
          target: [classMembers.classId, classMembers.userId],
        });
    }

    const [[stuCnt], [modCnt], [memCnt]] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(students).where(eq(students.classId, cls.id)),
      db.select({ count: sql<number>`count(*)` }).from(modules).where(eq(modules.classId, cls.id)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(classMembers)
        .where(eq(classMembers.classId, cls.id)),
    ]);

    return c.json({
      joined: !alreadyMember,
      alreadyMember,
      class: {
        id: cls.id,
        title: cls.title,
        description: cls.description,
        source: cls.source,
        externalClassId: cls.externalClassId,
        syncCode: cls.syncCode || '',
        courseCode: cls.courseCode,
        groupName: cls.groupName,
        role,
        memberCount: Number(memCnt?.count ?? 1),
        lastSyncedAt: cls.lastSyncedAt ? cls.lastSyncedAt.toISOString() : null,
        createdAt: cls.createdAt.toISOString(),
        studentCount: Number(stuCnt?.count ?? 0),
        moduleCount: Number(modCnt?.count ?? 0),
      },
    });
  });

  app.get('/api/classes/:id', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const classId = c.req.param('id');

    const access = await getClassWithMembership(db, classId, user.id);
    if (!access) return c.json({ error: 'Kelas tidak ditemukan.' }, 404);
    const { cls, role } = access;

    const [[{ count: studentCount }], [{ count: memberCount }], modRows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(students)
        .where(eq(students.classId, classId)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(classMembers)
        .where(eq(classMembers.classId, classId)),
      db
        .select()
        .from(modules)
        .where(eq(modules.classId, classId))
        .orderBy(asc(modules.orderIndex), asc(modules.createdAt)),
    ]);

    return c.json({
      class: {
        id: cls.id,
        title: cls.title,
        description: cls.description,
        source: cls.source,
        externalClassId: cls.externalClassId,
        syncCode: cls.syncCode || '',
        courseCode: cls.courseCode,
        groupName: cls.groupName,
        role,
        memberCount: Number(memberCount),
        lastSyncedAt: cls.lastSyncedAt ? cls.lastSyncedAt.toISOString() : null,
        createdAt: cls.createdAt.toISOString(),
        studentCount: Number(studentCount),
        moduleCount: modRows.length,
      },
      modules: modRows.map((m) => ({
        id: m.id,
        classId: m.classId,
        title: m.title,
        moduleDate: m.moduleDate ?? null,
        taskCount: m.taskCount,
        pointsPerTask: pointsPerTask(m.taskCount),
        orderIndex: m.orderIndex,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  });

  app.patch('/api/classes/:id', zValidator('json', classUpdateSchema), async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const classId = c.req.param('id');
    const data = c.req.valid('json');

    const access = await getClassWithMembership(db, classId, user.id);
    if (!access) return c.json({ error: 'Kelas tidak ditemukan.' }, 404);
    const { cls: existing, role } = access;

    const nextTitle = data.title !== undefined ? data.title : existing.title;
    const nextDesc = data.description !== undefined ? data.description : existing.description;

    await db
      .update(classes)
      .set({ title: nextTitle, description: nextDesc })
      .where(eq(classes.id, classId));

    const [{ count: memberCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(classMembers)
      .where(eq(classMembers.classId, classId));

    return c.json({
      class: {
        ...existing,
        title: nextTitle,
        description: nextDesc,
        syncCode: existing.syncCode || '',
        role,
        memberCount: Number(memberCount),
        lastSyncedAt: existing.lastSyncedAt ? existing.lastSyncedAt.toISOString() : null,
        createdAt: existing.createdAt.toISOString(),
      },
    });
  });

  app.post('/api/classes/:id/leave', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const classId = c.req.param('id');

    const access = await getClassWithMembership(db, classId, user.id);
    if (!access) return c.json({ error: 'Kelas tidak ditemukan.' }, 404);

    if (access.role === 'owner') {
      return c.json(
        {
          error:
            'Pembuat kelas tidak dapat keluar. Gunakan Hapus Kelas jika ingin menghapus kelas secara permanen.',
        },
        400
      );
    }

    await db
      .delete(classMembers)
      .where(and(eq(classMembers.classId, classId), eq(classMembers.userId, user.id)));

    return c.json({ ok: true });
  });

  app.delete('/api/classes/:id', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const classId = c.req.param('id');

    const access = await getClassWithMembership(db, classId, user.id);
    if (!access) return c.json({ error: 'Kelas tidak ditemukan.' }, 404);

    if (access.role !== 'owner') {
      return c.json(
        {
          error:
            'Hanya pembuat kelas yang dapat menghapus kelas secara permanen. Gunakan Keluar Kelas.',
        },
        403
      );
    }

    await db.delete(classes).where(eq(classes.id, classId));
    return c.json({ ok: true });
  });

  // ==================== ICLABS DIRECT SYNC ====================
  app.post('/api/iclabs/preview', zValidator('json', iclabsPreviewSchema), async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const { identitas, password, periode } = c.req.valid('json');
    const baseUrl = getIclabsBaseUrl(c.env || {}, options.defaultIclabsBaseUrl);
    const fetchFn = options.fetchFn || fetch;

    try {
      const token = await iclabsLogin(baseUrl, identitas, password, 'labcheck-web', fetchFn);
      const remoteClasses = await iclabsGetClasses(baseUrl, token, periode, fetchFn);
      const remoteExtIds = remoteClasses.map((rc) => rc.externalClassId);

      const userSynced = await db
        .select({
          id: classes.id,
          externalClassId: classes.externalClassId,
          title: classes.title,
        })
        .from(classMembers)
        .innerJoin(classes, eq(classMembers.classId, classes.id))
        .where(and(eq(classMembers.userId, user.id), eq(classes.source, 'iclabs')));

      const userMap = new Map(
        userSynced
          .filter((r) => Boolean(r.externalClassId))
          .map((r) => [r.externalClassId as string, r])
      );

      const globalExisting =
        remoteExtIds.length > 0
          ? await db
              .select({
                id: classes.id,
                externalClassId: classes.externalClassId,
                title: classes.title,
              })
              .from(classes)
              .where(inArray(classes.externalClassId, remoteExtIds))
              .orderBy(asc(classes.createdAt))
          : [];

      const globalMap = new Map<string, { id: string; externalClassId: string | null; title: string }>();
      for (const row of globalExisting) {
        if (row.externalClassId && !globalMap.has(row.externalClassId)) {
          globalMap.set(row.externalClassId, row);
        }
      }

      return c.json({
        iclabsToken: token,
        classes: remoteClasses.map((rc) => {
          const userLocal = userMap.get(rc.externalClassId);
          const globalLocal = globalMap.get(rc.externalClassId);
          return {
            ...rc,
            alreadySynced: Boolean(userLocal),
            sharedExisting: Boolean(!userLocal && globalLocal),
            localClassId: userLocal?.id ?? globalLocal?.id ?? null,
            localTitle: userLocal?.title ?? globalLocal?.title ?? null,
          };
        }),
      });
    } catch (err) {
      if (err instanceof IclabsApiError) {
        const status = err.status === 401 || err.status === 422 ? err.status : 502;
        return c.json({ error: err.message }, status as 401 | 422 | 502);
      }
      console.error('[iclabs/preview] unexpected error:', err);
      const detail = err instanceof Error ? err.message : 'kesalahan internal';
      return c.json({ error: `Gagal memuat daftar kelas ICLabs: ${detail}` }, 500);
    }
  });

  app.post('/api/iclabs/sync', zValidator('json', iclabsSyncSchema), async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const body = c.req.valid('json');
    const baseUrl = getIclabsBaseUrl(c.env || {}, options.defaultIclabsBaseUrl);
    const fetchFn = options.fetchFn || fetch;

    try {
      const token =
        body.iclabsToken ||
        (await iclabsLogin(baseUrl, body.identitas!, body.password!, 'labcheck-web', fetchFn));

      let classesCreated = 0;
      let classesJoined = 0;
      let classesUpdated = 0;
      let studentsInserted = 0;
      let studentsUpdated = 0;
      const syncedClasses: Array<{
        id: string;
        title: string;
        externalClassId: string;
        syncCode: string;
        joined: boolean;
        participantCount: number;
        inserted: number;
        updated: number;
      }> = [];

      const now = new Date();
      const incomingExtIds = body.classes.map((clsInput) => clsInput.externalClassId);

      // Lookup global classes by ICLabs id_kelas_kuliah so assistants on the same class share 1 record
      const existingClassesRows = await db
        .select()
        .from(classes)
        .where(inArray(classes.externalClassId, incomingExtIds))
        .orderBy(asc(classes.createdAt));

      const existingClassByExtId = new Map<string, (typeof existingClassesRows)[number]>();
      for (const r of existingClassesRows) {
        if (r.externalClassId && !existingClassByExtId.has(r.externalClassId)) {
          existingClassByExtId.set(r.externalClassId, r);
        }
      }

      const existingIds = Array.from(existingClassByExtId.values()).map((r) => r.id);
      const userMemberRows =
        existingIds.length > 0
          ? await db
              .select({ classId: classMembers.classId })
              .from(classMembers)
              .where(and(eq(classMembers.userId, user.id), inArray(classMembers.classId, existingIds)))
          : [];
      const userMemberClassIds = new Set(userMemberRows.map((r) => r.classId));

      for (const clsInput of body.classes) {
        const participants = await iclabsGetParticipants(
          baseUrl,
          token,
          clsInput.externalClassId,
          fetchFn
        );

        const existingClass = existingClassByExtId.get(clsInput.externalClassId);

        let localClassId: string;
        let finalTitle: string;
        let finalSyncCode: string;
        let isNewClass = false;
        let joinedShared = false;

        if (existingClass) {
          localClassId = existingClass.id;
          finalTitle = existingClass.title;
          finalSyncCode = existingClass.syncCode || (await generateUniqueSyncCode(db));
          await db
            .update(classes)
            .set({
              courseCode: clsInput.courseCode || existingClass.courseCode,
              groupName: clsInput.groupName || existingClass.groupName,
              syncCode: finalSyncCode,
              source: 'iclabs',
              lastSyncedAt: now,
            })
            .where(eq(classes.id, existingClass.id));

          if (!userMemberClassIds.has(existingClass.id)) {
            await db
              .insert(classMembers)
              .values({
                id: newId(),
                classId: existingClass.id,
                userId: user.id,
                role: 'member',
                joinedAt: now,
              })
              .onConflictDoNothing({
                target: [classMembers.classId, classMembers.userId],
              });
            userMemberClassIds.add(existingClass.id);
            joinedShared = true;
            classesJoined += 1;
          } else {
            classesUpdated += 1;
          }
        } else {
          isNewClass = true;
          localClassId = newId();
          finalTitle = clsInput.title;
          finalSyncCode = await generateUniqueSyncCode(db);
          const newClassRow = {
            id: localClassId,
            userId: user.id,
            title: clsInput.title,
            description: clsInput.courseCode
              ? `Sinkronisasi ICLabs (${clsInput.courseCode}${clsInput.groupName ? ` • ${clsInput.groupName}` : ''})`
              : 'Sinkronisasi langsung dari ICLabs',
            source: 'iclabs',
            externalClassId: clsInput.externalClassId,
            syncCode: finalSyncCode,
            courseCode: clsInput.courseCode || null,
            groupName: clsInput.groupName || null,
            lastSyncedAt: now,
            createdAt: now,
          };
          await db.insert(classes).values(newClassRow);
          await db.insert(classMembers).values({
            id: newId(),
            classId: localClassId,
            userId: user.id,
            role: 'owner',
            joinedAt: now,
          });
          existingClassByExtId.set(clsInput.externalClassId, newClassRow);
          userMemberClassIds.add(localClassId);
          classesCreated += 1;
        }

        const studentRes = await upsertStudentsBatch(
          db,
          localClassId,
          participants.map((p) => ({ nim: p.nim, name: p.nama, status: p.status })),
          { skipExistingLookup: isNewClass }
        );

        studentsInserted += studentRes.inserted;
        studentsUpdated += studentRes.updated;
        syncedClasses.push({
          id: localClassId,
          title: finalTitle,
          externalClassId: clsInput.externalClassId,
          syncCode: finalSyncCode,
          joined: joinedShared,
          participantCount: studentRes.total,
          inserted: studentRes.inserted,
          updated: studentRes.updated,
        });
      }

      return c.json({
        summary: {
          classesCreated,
          classesJoined,
          classesUpdated,
          studentsInserted,
          studentsUpdated,
        },
        syncedClasses,
      });
    } catch (err) {
      if (err instanceof IclabsApiError) {
        const status = err.status === 401 || err.status === 422 ? err.status : 502;
        return c.json({ error: err.message }, status as 401 | 422 | 502);
      }
      console.error('[iclabs/sync] unexpected error:', err);
      const detail = err instanceof Error ? err.message : 'kesalahan internal';
      return c.json({ error: `Gagal menyimpan sinkronisasi ICLabs: ${detail}` }, 500);
    }
  });

  // ==================== STUDENTS ====================
  app.get('/api/classes/:id/students', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const classId = c.req.param('id');

    const access = await getClassWithMembership(db, classId, user.id);
    if (!access) return c.json({ error: 'Kelas tidak ditemukan.' }, 404);

    const rows = await db
      .select()
      .from(students)
      .where(eq(students.classId, classId))
      .orderBy(asc(students.nim));

    return c.json({
      students: rows.map((s) => ({
        id: s.id,
        classId: s.classId,
        nim: s.nim,
        name: s.name,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
      })),
    });
  });

  app.post('/api/classes/:id/students', zValidator('json', studentSchema), async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const classId = c.req.param('id');
    const { nim, name, status } = c.req.valid('json');

    const access = await getClassWithMembership(db, classId, user.id);
    if (!access) return c.json({ error: 'Kelas tidak ditemukan.' }, 404);

    const [dup] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.classId, classId), eq(students.nim, nim)))
      .limit(1);
    if (dup) return c.json({ error: `NIM ${nim} sudah ada di kelas ini.` }, 409);

    const id = newId();
    const createdAt = new Date();
    const finalStatus = status?.trim() || 'AKTIF';
    await db.insert(students).values({
      id,
      classId,
      nim,
      name,
      status: finalStatus,
      createdAt,
    });

    return c.json(
      {
        student: { id, classId, nim, name, status: finalStatus, createdAt: createdAt.toISOString() },
      },
      201
    );
  });

  app.post('/api/classes/:id/students/import', zValidator('json', importStudentsSchema), async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const classId = c.req.param('id');
    const { students: incoming } = c.req.valid('json');

    const access = await getClassWithMembership(db, classId, user.id);
    if (!access) return c.json({ error: 'Kelas tidak ditemukan.' }, 404);

    const result = await upsertStudentsBatch(db, classId, incoming);
    return c.json(result);
  });

  app.patch('/api/students/:id', zValidator('json', studentUpdateSchema), async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const studentId = c.req.param('id');
    const data = c.req.valid('json');

    const row = await getStudentWithMembership(db, studentId, user.id);
    if (!row) {
      return c.json({ error: 'Praktikan tidak ditemukan.' }, 404);
    }

    const nextNim = data.nim !== undefined ? data.nim : row.student.nim;
    const nextName = data.name !== undefined ? data.name : row.student.name;
    const nextStatus = data.status !== undefined ? data.status || 'AKTIF' : row.student.status;

    if (nextNim !== row.student.nim) {
      const [dup] = await db
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.classId, row.student.classId), eq(students.nim, nextNim)))
        .limit(1);
      if (dup) return c.json({ error: `NIM ${nextNim} sudah digunakan di kelas ini.` }, 409);
    }

    await db
      .update(students)
      .set({ nim: nextNim, name: nextName, status: nextStatus })
      .where(eq(students.id, studentId));

    return c.json({
      student: {
        id: row.student.id,
        classId: row.student.classId,
        nim: nextNim,
        name: nextName,
        status: nextStatus,
        createdAt: row.student.createdAt.toISOString(),
      },
    });
  });

  app.delete('/api/students/:id', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const studentId = c.req.param('id');

    const row = await getStudentWithMembership(db, studentId, user.id);
    if (!row) {
      return c.json({ error: 'Praktikan tidak ditemukan.' }, 404);
    }

    await db.delete(students).where(eq(students.id, studentId));
    return c.json({ ok: true });
  });

  // ==================== MODULES ====================
  app.get('/api/classes/:id/modules', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const classId = c.req.param('id');

    const access = await getClassWithMembership(db, classId, user.id);
    if (!access) return c.json({ error: 'Kelas tidak ditemukan.' }, 404);

    const modRows = await db
      .select()
      .from(modules)
      .where(eq(modules.classId, classId))
      .orderBy(asc(modules.orderIndex), asc(modules.createdAt));

    const [{ count: studentCountRaw }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(students)
      .where(eq(students.classId, classId));
    const studentCount = Number(studentCountRaw);

    const modIds = modRows.map((m) => m.id);
    const completionRows =
      modIds.length > 0
        ? await db
            .select({
              moduleId: taskCompletions.moduleId,
              studentId: taskCompletions.studentId,
              cnt: sql<number>`count(*)`,
            })
            .from(taskCompletions)
            .where(inArray(taskCompletions.moduleId, modIds))
            .groupBy(taskCompletions.moduleId, taskCompletions.studentId)
        : [];

    const byMod = new Map<string, { studentScores: number[]; fullCount: number }>();
    for (const m of modRows) byMod.set(m.id, { studentScores: [], fullCount: 0 });
    const modTaskMap = new Map(modRows.map((m) => [m.id, m.taskCount]));

    for (const r of completionRows) {
      const entry = byMod.get(r.moduleId);
      const tc = modTaskMap.get(r.moduleId) ?? 1;
      if (entry) {
        const cNum = Number(r.cnt);
        entry.studentScores.push(calcModuleScore(cNum, tc));
        if (cNum >= tc) entry.fullCount += 1;
      }
    }

    return c.json({
      modules: modRows.map((m) => {
        const stats = byMod.get(m.id) ?? { studentScores: [], fullCount: 0 };
        const totalScoreSum = stats.studentScores.reduce((acc, s) => acc + s, 0);
        const averageScore =
          studentCount > 0 ? roundScore(totalScoreSum / studentCount) : 0;
        return {
          id: m.id,
          classId: m.classId,
          title: m.title,
          moduleDate: m.moduleDate ?? null,
          taskCount: m.taskCount,
          pointsPerTask: pointsPerTask(m.taskCount),
          orderIndex: m.orderIndex,
          createdAt: m.createdAt.toISOString(),
          studentCount,
          completedAllCount: stats.fullCount,
          averageScore,
        };
      }),
    });
  });

  app.post('/api/classes/:id/modules', zValidator('json', moduleCreateSchema), async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const classId = c.req.param('id');
    const { title, taskCount, moduleDate } = c.req.valid('json');

    const access = await getClassWithMembership(db, classId, user.id);
    if (!access) return c.json({ error: 'Kelas tidak ditemukan.' }, 404);

    const [{ maxOrder }] = await db
      .select({ maxOrder: sql<number>`coalesce(max(${modules.orderIndex}), 0)` })
      .from(modules)
      .where(eq(modules.classId, classId));

    const id = newId();
    const orderIndex = Number(maxOrder) + 1;
    const createdAt = new Date();
    const savedDate = moduleDate ?? null;

    await db.insert(modules).values({
      id,
      classId,
      title,
      moduleDate: savedDate,
      taskCount,
      orderIndex,
      createdAt,
    });

    return c.json(
      {
        module: {
          id,
          classId,
          title,
          moduleDate: savedDate,
          taskCount,
          pointsPerTask: pointsPerTask(taskCount),
          orderIndex,
          createdAt: createdAt.toISOString(),
        },
      },
      201
    );
  });

  app.patch('/api/modules/:id', zValidator('json', moduleUpdateSchema), async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const moduleId = c.req.param('id');
    const data = c.req.valid('json');

    const row = await getModuleWithMembership(db, moduleId, user.id);
    if (!row) {
      return c.json({ error: 'Modul tidak ditemukan.' }, 404);
    }

    const nextTitle = data.title !== undefined ? data.title : row.mod.title;
    const nextTaskCount = data.taskCount !== undefined ? data.taskCount : row.mod.taskCount;
    const nextModuleDate =
      data.moduleDate !== undefined ? data.moduleDate : (row.mod.moduleDate ?? null);

    await db
      .update(modules)
      .set({ title: nextTitle, taskCount: nextTaskCount, moduleDate: nextModuleDate })
      .where(eq(modules.id, moduleId));

    // FR-MOD-03: Jika jumlah tugas diperkecil, hapus task_completions > taskCount baru
    if (nextTaskCount < row.mod.taskCount) {
      await db
        .delete(taskCompletions)
        .where(
          and(
            eq(taskCompletions.moduleId, moduleId),
            gt(taskCompletions.taskNumber, nextTaskCount)
          )
        );
    }

    return c.json({
      module: {
        id: row.mod.id,
        classId: row.mod.classId,
        title: nextTitle,
        moduleDate: nextModuleDate,
        taskCount: nextTaskCount,
        pointsPerTask: pointsPerTask(nextTaskCount),
        orderIndex: row.mod.orderIndex,
        createdAt: row.mod.createdAt.toISOString(),
      },
    });
  });

  app.delete('/api/modules/:id', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const moduleId = c.req.param('id');

    const row = await getModuleWithMembership(db, moduleId, user.id);
    if (!row) {
      return c.json({ error: 'Modul tidak ditemukan.' }, 404);
    }

    await db.delete(modules).where(eq(modules.id, moduleId));
    return c.json({ ok: true });
  });

  // ==================== BOARD CHECKLIST ====================
  app.get('/api/modules/:id/board', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const moduleId = c.req.param('id');

    const row = await getModuleWithMembership(db, moduleId, user.id);
    if (!row) {
      return c.json({ error: 'Modul tidak ditemukan.' }, 404);
    }

    const studentRows = await db
      .select()
      .from(students)
      .where(eq(students.classId, row.cls.id))
      .orderBy(asc(students.nim));

    const completionRows = await db
      .select({
        studentId: taskCompletions.studentId,
        taskNumber: taskCompletions.taskNumber,
      })
      .from(taskCompletions)
      .where(eq(taskCompletions.moduleId, moduleId));

    const completionsMap: Record<string, number[]> = {};
    for (const st of studentRows) completionsMap[st.id] = [];
    for (const comp of completionRows) {
      if (comp.taskNumber >= 1 && comp.taskNumber <= row.mod.taskCount) {
        if (!completionsMap[comp.studentId]) completionsMap[comp.studentId] = [];
        completionsMap[comp.studentId].push(comp.taskNumber);
      }
    }
    for (const key of Object.keys(completionsMap)) {
      completionsMap[key].sort((a, b) => a - b);
    }

    return c.json({
      class: {
        id: row.cls.id,
        title: row.cls.title,
        source: row.cls.source,
        syncCode: row.cls.syncCode || '',
      },
      module: {
        id: row.mod.id,
        classId: row.mod.classId,
        title: row.mod.title,
        moduleDate: row.mod.moduleDate ?? null,
        taskCount: row.mod.taskCount,
        pointsPerTask: pointsPerTask(row.mod.taskCount),
        orderIndex: row.mod.orderIndex,
      },
      students: studentRows.map((s) => ({
        id: s.id,
        nim: s.nim,
        name: s.name,
        status: s.status,
      })),
      completions: completionsMap,
    });
  });

  app.post('/api/modules/:id/toggle', zValidator('json', toggleSchema), async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const moduleId = c.req.param('id');
    const { studentId, taskNumber, completed } = c.req.valid('json');

    const row = await getModuleWithMembership(db, moduleId, user.id);
    if (!row) {
      return c.json({ error: 'Modul tidak ditemukan.' }, 404);
    }

    if (taskNumber > row.mod.taskCount) {
      return c.json(
        { error: `Nomor tugas harus antara 1 sampai ${row.mod.taskCount}.` },
        400
      );
    }

    const [st] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.id, studentId), eq(students.classId, row.mod.classId)))
      .limit(1);

    if (!st) {
      return c.json({ error: 'Praktikan tidak ditemukan di kelas ini.' }, 404);
    }

    if (completed) {
      await db
        .insert(taskCompletions)
        .values({
          id: newId(),
          moduleId,
          studentId,
          taskNumber,
          completedAt: new Date(),
        })
        .onConflictDoNothing({
          target: [taskCompletions.moduleId, taskCompletions.studentId, taskCompletions.taskNumber],
        });
    } else {
      await db
        .delete(taskCompletions)
        .where(
          and(
            eq(taskCompletions.moduleId, moduleId),
            eq(taskCompletions.studentId, studentId),
            eq(taskCompletions.taskNumber, taskNumber)
          )
        );
    }

    return c.json({ ok: true, studentId, taskNumber, completed });
  });

  app.post('/api/modules/:id/complete-all', zValidator('json', completeAllSchema), async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const moduleId = c.req.param('id');
    const { studentId, completed } = c.req.valid('json');

    const row = await getModuleWithMembership(db, moduleId, user.id);
    if (!row) {
      return c.json({ error: 'Modul tidak ditemukan.' }, 404);
    }

    const [st] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.id, studentId), eq(students.classId, row.mod.classId)))
      .limit(1);

    if (!st) {
      return c.json({ error: 'Praktikan tidak ditemukan di kelas ini.' }, 404);
    }

    if (completed) {
      const now = new Date();
      const values = Array.from({ length: row.mod.taskCount }, (_, idx) => ({
        id: newId(),
        moduleId,
        studentId,
        taskNumber: idx + 1,
        completedAt: now,
      }));
      await db
        .insert(taskCompletions)
        .values(values)
        .onConflictDoNothing({
          target: [taskCompletions.moduleId, taskCompletions.studentId, taskCompletions.taskNumber],
        });
    } else {
      await db
        .delete(taskCompletions)
        .where(
          and(
            eq(taskCompletions.moduleId, moduleId),
            eq(taskCompletions.studentId, studentId)
          )
        );
    }

    return c.json({ ok: true, studentId, completed });
  });

  // ==================== RECAP ====================
  app.get('/api/modules/:id/recap', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const moduleId = c.req.param('id');

    const row = await getModuleWithMembership(db, moduleId, user.id);
    if (!row) {
      return c.json({ error: 'Modul tidak ditemukan.' }, 404);
    }

    const studentRows = await db
      .select()
      .from(students)
      .where(eq(students.classId, row.cls.id))
      .orderBy(asc(students.nim));

    const completionRows = await db
      .select({
        studentId: taskCompletions.studentId,
        taskNumber: taskCompletions.taskNumber,
      })
      .from(taskCompletions)
      .where(eq(taskCompletions.moduleId, moduleId));

    const byStudent = new Map<string, Set<number>>();
    const perTaskCounts = new Array<number>(row.mod.taskCount).fill(0);

    for (const comp of completionRows) {
      if (comp.taskNumber < 1 || comp.taskNumber > row.mod.taskCount) continue;
      let set = byStudent.get(comp.studentId);
      if (!set) {
        set = new Set<number>();
        byStudent.set(comp.studentId, set);
      }
      if (!set.has(comp.taskNumber)) {
        set.add(comp.taskNumber);
        perTaskCounts[comp.taskNumber - 1] += 1;
      }
    }

    const studentRecap = studentRows.map((st) => {
      const doneSet = byStudent.get(st.id) ?? new Set<number>();
      const completedTasks = Array.from(doneSet).sort((a, b) => a - b);
      const score = calcModuleScore(completedTasks.length, row.mod.taskCount);
      return {
        studentId: st.id,
        nim: st.nim,
        name: st.name,
        status: st.status,
        completedTasks,
        completedCount: completedTasks.length,
        score,
      };
    });

    const totalStudents = studentRows.length;
    const completedAllCount = studentRecap.filter(
      (s) => s.completedCount === row.mod.taskCount
    ).length;
    const averageScore = calcAverage(studentRecap.map((s) => s.score));

    const perTaskStats = perTaskCounts.map((count, idx) => ({
      taskNumber: idx + 1,
      completedCount: count,
      percentage: totalStudents > 0 ? roundScore((count * 100) / totalStudents) : 0,
    }));

    return c.json({
      assistantName: user.name,
      generatedAt: new Date().toISOString(),
      class: {
        id: row.cls.id,
        title: row.cls.title,
        courseCode: row.cls.courseCode,
        groupName: row.cls.groupName,
      },
      module: {
        id: row.mod.id,
        title: row.mod.title,
        moduleDate: row.mod.moduleDate ?? null,
        taskCount: row.mod.taskCount,
        pointsPerTask: pointsPerTask(row.mod.taskCount),
      },
      summary: {
        totalStudents,
        completedAllCount,
        averageScore,
        perTaskStats,
      },
      students: studentRecap,
    });
  });

  app.get('/api/classes/:id/recap', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const classId = c.req.param('id');

    const access = await getClassWithMembership(db, classId, user.id);
    if (!access) return c.json({ error: 'Kelas tidak ditemukan.' }, 404);
    const { cls } = access;

    const studentRows = await db
      .select()
      .from(students)
      .where(eq(students.classId, classId))
      .orderBy(asc(students.nim));

    const modRows = await db
      .select()
      .from(modules)
      .where(eq(modules.classId, classId))
      .orderBy(asc(modules.orderIndex), asc(modules.createdAt));

    const modIds = modRows.map((m) => m.id);
    const completionRows =
      modIds.length > 0
        ? await db
            .select({
              moduleId: taskCompletions.moduleId,
              studentId: taskCompletions.studentId,
              taskNumber: taskCompletions.taskNumber,
            })
            .from(taskCompletions)
            .where(inArray(taskCompletions.moduleId, modIds))
        : [];

    const modTaskCountMap = new Map(modRows.map((m) => [m.id, m.taskCount]));
    // key: `${studentId}:${moduleId}` -> count
    const counts = new Map<string, number>();
    for (const comp of completionRows) {
      const maxTasks = modTaskCountMap.get(comp.moduleId) ?? 0;
      if (comp.taskNumber >= 1 && comp.taskNumber <= maxTasks) {
        const key = `${comp.studentId}:${comp.moduleId}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    const studentRecap = studentRows.map((st) => {
      const scoresByModule: Record<string, number> = {};
      const moduleScores: number[] = [];

      for (const m of modRows) {
        const done = counts.get(`${st.id}:${m.id}`) ?? 0;
        const score = calcModuleScore(done, m.taskCount);
        scoresByModule[m.id] = score;
        moduleScores.push(score);
      }

      const finalScore = calcAverage(moduleScores);

      return {
        studentId: st.id,
        nim: st.nim,
        name: st.name,
        status: st.status,
        scoresByModule,
        finalScore,
      };
    });

    const classAverage = calcAverage(studentRecap.map((s) => s.finalScore));

    return c.json({
      assistantName: user.name,
      generatedAt: new Date().toISOString(),
      class: {
        id: cls.id,
        title: cls.title,
        description: cls.description,
        source: cls.source,
        courseCode: cls.courseCode,
        groupName: cls.groupName,
      },
      modules: modRows.map((m) => ({
        id: m.id,
        title: m.title,
        moduleDate: m.moduleDate ?? null,
        taskCount: m.taskCount,
        pointsPerTask: pointsPerTask(m.taskCount),
      })),
      summary: {
        totalStudents: studentRows.length,
        totalModules: modRows.length,
        classAverage,
      },
      students: studentRecap,
    });
  });

  return app;
}

export const app = createApp();
