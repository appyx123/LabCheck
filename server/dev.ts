import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createNodeDb } from './db/node';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadDotEnv() {
  for (const filename of ['.env', '.dev.vars']) {
    try {
      const raw = await readFile(path.join(ROOT, filename), 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (!m) continue;
        let v = m[2].trim();
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        if (!(m[1] in process.env)) {
          process.env[m[1]] = v;
        }
      }
    } catch {
      // ignore missing file
    }
  }
}

async function start() {
  await loadDotEnv();
  const dbUrl = process.env.TURSO_DATABASE_URL || 'file:./local.db';
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
  const port = Number(process.env.PORT || 8787);

  const { db } = await createNodeDb(dbUrl, authToken);
  const app = createApp({
    dbFactory: () => db,
    defaultJwtSecret: process.env.JWT_SECRET,
    defaultIclabsBaseUrl: process.env.ICLABS_BASE_URL,
  });

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`LabCheck API berjalan di http://localhost:${info.port}`);
    console.log(`Database: ${dbUrl}`);
  });
}

start().catch((err) => {
  console.error('Gagal memulai LabCheck API:', err);
  process.exit(1);
});
