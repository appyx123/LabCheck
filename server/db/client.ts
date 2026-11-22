import type { Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';

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
    course_code TEXT,
    group_name TEXT,
    last_synced_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_classes_user_id ON classes (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_classes_user_external ON classes (user_id, external_class_id)`,
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

export async function ensureSchema(client: Client): Promise<void> {
  for (const sql of SCHEMA_STATEMENTS) {
    await client.execute(sql);
  }
  const cols = await client.execute(`PRAGMA table_info(modules)`);
  const hasModuleDate = cols.rows.some((r) => String(r.name ?? r[1]) === 'module_date');
  if (!hasModuleDate) {
    await client.execute(`ALTER TABLE modules ADD COLUMN module_date TEXT`);
  }
}
