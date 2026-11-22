import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(), // saltHex:derivedKeyHex (PBKDF2-SHA256)
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const classes = sqliteTable(
  'classes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    source: text('source').notNull().default('manual'), // 'manual' | 'iclabs'
    externalClassId: text('external_class_id'),
    courseCode: text('course_code'),
    groupName: text('group_name'),
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('idx_classes_user_id').on(t.userId),
    index('idx_classes_user_external').on(t.userId, t.externalClassId),
  ]
);

export const students = sqliteTable(
  'students',
  {
    id: text('id').primaryKey(),
    classId: text('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    nim: text('nim').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull().default('AKTIF'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    uniqueIndex('uq_students_class_nim').on(t.classId, t.nim),
    index('idx_students_class_id').on(t.classId),
  ]
);

export const modules = sqliteTable(
  'modules',
  {
    id: text('id').primaryKey(),
    classId: text('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    moduleDate: text('module_date'), // Format YYYY-MM-DD (opsional)
    taskCount: integer('task_count').notNull(), // Bobot tiap tugas = 100 / taskCount (1..30)
    orderIndex: integer('order_index').notNull().default(1),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('idx_modules_class_id').on(t.classId)]
);

// Sparse storage: hanya menyimpan tugas berstatus SELESAI
export const taskCompletions = sqliteTable(
  'task_completions',
  {
    id: text('id').primaryKey(),
    moduleId: text('module_id')
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    taskNumber: integer('task_number').notNull(), // 1 .. modules.taskCount
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    uniqueIndex('uq_completion_mod_stu_task').on(t.moduleId, t.studentId, t.taskNumber),
    index('idx_completions_module_id').on(t.moduleId),
  ]
);

export type UserRow = typeof users.$inferSelect;
export type ClassRow = typeof classes.$inferSelect;
export type StudentRow = typeof students.$inferSelect;
export type ModuleRow = typeof modules.$inferSelect;
export type TaskCompletionRow = typeof taskCompletions.$inferSelect;
