import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { ensureSchema } from './client';

async function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  let raw = '';
  try {
    raw = await readFile(envPath, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}

async function main() {
  await loadDotEnv();
  const isCheckOnly = process.argv.includes('--check');
  const url = process.env.TURSO_DATABASE_URL || 'file:./local.db';
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

  const targetLabel = url.startsWith('file:') ? url : url.replace(/\/\/.*@/, '//***@');
  console.log(`[LabCheck Migration] Target: ${targetLabel} (${isCheckOnly ? 'CHECK ONLY' : 'APPLY'})`);

  const client = createClient({ url, authToken });

  const tablesRes = await client.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('classes', 'class_members')`
  );
  const tableNames = new Set(tablesRes.rows.map((r) => String(r.name ?? r[0])));
  const hasClasses = tableNames.has('classes');
  const hasClassMembers = tableNames.has('class_members');

  if (!hasClasses) {
    console.log('Tabel classes belum ada (database kosong).');
    if (!isCheckOnly) {
      const report = await ensureSchema(client);
      console.log('Skema dibuat:', report);
    }
    return;
  }

  const clsCols = await client.execute(`PRAGMA table_info(classes)`);
  const hasSyncCode = clsCols.rows.some((r) => String(r.name ?? r[1]) === 'sync_code');

  const totalRes = await client.execute(`SELECT count(*) AS cnt FROM classes`);
  const totalClasses = Number(totalRes.rows[0]?.cnt ?? totalRes.rows[0]?.[0] ?? 0);

  const dupExtRes = await client.execute(
    `SELECT external_class_id, count(*) AS cnt
     FROM classes
     WHERE external_class_id IS NOT NULL AND external_class_id != ''
     GROUP BY external_class_id
     HAVING count(*) > 1`
  );

  if (isCheckOnly) {
    let missingSyncCode = totalClasses;
    if (hasSyncCode) {
      const r = await client.execute(
        `SELECT count(*) AS cnt FROM classes WHERE sync_code IS NULL OR sync_code = ''`
      );
      missingSyncCode = Number(r.rows[0]?.cnt ?? r.rows[0]?.[0] ?? 0);
    }

    let missingMembers = totalClasses;
    if (hasClassMembers) {
      const r = await client.execute(
        `SELECT count(*) AS cnt
         FROM classes c
         LEFT JOIN class_members cm ON cm.class_id = c.id AND cm.user_id = c.user_id
         WHERE cm.id IS NULL`
      );
      missingMembers = Number(r.rows[0]?.cnt ?? r.rows[0]?.[0] ?? 0);
    }

    console.log(
      JSON.stringify(
        {
          totalClasses,
          hasSyncCodeColumn: hasSyncCode,
          hasClassMembersTable: hasClassMembers,
          classesNeedingSyncCode: missingSyncCode,
          classesNeedingOwnerMembership: missingMembers,
          duplicateExternalClassIds: dupExtRes.rows.map((r) => ({
            externalClassId: String(r.external_class_id ?? r[0]),
            count: Number(r.cnt ?? r[1]),
          })),
        },
        null,
        2
      )
    );
    return;
  }

  const report = await ensureSchema(client);
  console.log('Migrasi selesai tanpa menghapus data lama:', report);
  if (dupExtRes.rows.length > 0) {
    console.log(
      'Catatan: ditemukan external_class_id duplikat lama (tidak dihapus):',
      dupExtRes.rows.map((r) => ({
        externalClassId: String(r.external_class_id ?? r[0]),
        count: Number(r.cnt ?? r[1]),
      }))
    );
  }
}

main().catch((err) => {
  console.error('[LabCheck Migration Error]', err);
  process.exit(1);
});
