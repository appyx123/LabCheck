import type { Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';
import { generateSyncCode, newId } from '../lib/crypto';

export type AppDb = LibSQLDatabase<typeof schema>;

export function wrapClient(client: Client): AppDb {
  return drizzle(client, { schema });
}

const SCHEMA_STATEMENTS = [
  `PRAGMA foreign_keys = ON`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    external_class_id TEXT,
    sync_code TEXT,
    course_code TEXT,
    group_name TEXT,
    last_synced_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_classes_user_id ON classes (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_classes_user_external ON classes (user_id, external_class_id)`,
  `CREATE INDEX IF NOT EXISTS idx_classes_external_class_id ON classes (external_class_id)`,
  `CREATE TABLE IF NOT EXISTS class_members (
    id TEXT PRIMARY KEY NOT NULL,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_class_members_class_user ON class_members (class_id, user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_class_members_user_id ON class_members (user_id)`,
  `CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY NOT NULL,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    nim TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'AKTIF',
    created_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_students_class_nim ON students (class_id, nim)`,
  `CREATE INDEX IF NOT EXISTS idx_students_class_id ON students (class_id)`,
  `CREATE TABLE IF NOT EXISTS modules (
    id TEXT PRIMARY KEY NOT NULL,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    module_date TEXT,
    task_count INTEGER NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_modules_class_id ON modules (class_id)`,
  `CREATE TABLE IF NOT EXISTS task_completions (
    id TEXT PRIMARY KEY NOT NULL,
    module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    task_number INTEGER NOT NULL,
    completed_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_completion_mod_stu_task ON task_completions (module_id, student_id, task_number)`,
  `CREATE INDEX IF NOT EXISTS idx_completions_module_id ON task_completions (module_id)`,
];

export interface EnsureSchemaReport {
  addedModuleDate: boolean;
  addedSyncCode: boolean;
  backfilledSyncCodes: number;
  backfilledMembers: number;
}

export async function ensureSchema(client: Client): Promise<EnsureSchemaReport> {
  for (const sql of SCHEMA_STATEMENTS) {
    await client.execute(sql);
  }

  let addedModuleDate = false;
  const modCols = await client.execute(`PRAGMA table_info(modules)`);
  const hasModuleDate = modCols.rows.some((r) => String(r.name ?? r[1]) === 'module_date');
  if (!hasModuleDate) {
    await client.execute(`ALTER TABLE modules ADD COLUMN module_date TEXT`);
    addedModuleDate = true;
  }

  let addedSyncCode = false;
  const clsCols = await client.execute(`PRAGMA table_info(classes)`);
  const hasSyncCode = clsCols.rows.some((r) => String(r.name ?? r[1]) === 'sync_code');
  if (!hasSyncCode) {
    await client.execute(`ALTER TABLE classes ADD COLUMN sync_code TEXT`);
    addedSyncCode = true;
  }

  await client.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_classes_sync_code ON classes (sync_code)`
  );

  // Enforce unique external_class_id at DB level when no legacy duplicates exist
  const dupExtRes = await client.execute(
    `SELECT 1 FROM classes
     WHERE external_class_id IS NOT NULL AND external_class_id != ''
     GROUP BY external_class_id
     HAVING count(*) > 1
     LIMIT 1`
  );
  if (dupExtRes.rows.length === 0) {
    await client.execute(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_classes_external_class_id
       ON classes (external_class_id)
       WHERE external_class_id IS NOT NULL AND external_class_id != ''`
    );
  }

  // Backfill sync_code for existing classes without one
  const missingCodeRes = await client.execute(
    `SELECT id FROM classes WHERE sync_code IS NULL OR sync_code = ''`
  );
  let backfilledSyncCodes = 0;
  for (const row of missingCodeRes.rows) {
    const classId = String(row.id ?? row[0]);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = generateSyncCode();
      try {
        await client.execute({
          sql: `UPDATE classes SET sync_code = ? WHERE id = ?`,
          args: [code, classId],
        });
        backfilledSyncCodes += 1;
        break;
      } catch (err) {
        if (attempt === 7) throw err;
      }
    }
  }

  // Backfill class_members for existing classes without owner membership
  const missingMembersRes = await client.execute(
    `SELECT c.id, c.user_id, c.created_at
     FROM classes c
     LEFT JOIN class_members cm ON cm.class_id = c.id AND cm.user_id = c.user_id
     WHERE cm.id IS NULL`
  );
  let backfilledMembers = 0;
  for (const row of missingMembersRes.rows) {
    const classId = String(row.id ?? row[0]);
    const userId = String(row.user_id ?? row[1]);
    const createdAt = Number(row.created_at ?? row[2] ?? Date.now());
    await client.execute({
      sql: `INSERT OR IGNORE INTO class_members (id, class_id, user_id, role, joined_at)
            VALUES (?, ?, ?, 'owner', ?)`,
      args: [newId(), classId, userId, createdAt],
    });
    backfilledMembers += 1;
  }

  return {
    addedModuleDate,
    addedSyncCode,
    backfilledSyncCodes,
    backfilledMembers,
  };
}
