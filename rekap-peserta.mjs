#!/usr/bin/env node
// Ambil daftar NIM + nama peserta per kelas praktikum dari API ICLabs.
// Akses mengikuti role akun: asisten hanya kelas yang diampu.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(ROOT, 'hasil');
const delim = () => process.env.ICLABS_CSV_DELIMITER || ';';

async function loadEnv() {
  let raw = '';
  try {
    raw = await readFile(path.join(ROOT, '.env'), 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}

function readCfg() {
  return {
    baseUrl: (process.env.ICLABS_BASE_URL || 'https://iclabs.fikom.umi.ac.id/api/v1').replace(/\/+$/, ''),
    identitas: process.env.ICLABS_IDENTITAS || '',
    password: process.env.ICLABS_PASSWORD || '',
    namaPerangkat: process.env.ICLABS_NAMA_PERANGKAT || 'rekap-peserta',
    periode: process.env.ICLABS_PERIODE || '',
  };
}

async function request(cfg, urlPath, { method = 'GET', token, body, retries = 2 } = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(cfg.baseUrl + urlPath, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 429 && retries > 0) {
    const wait = Number(res.headers.get('retry-after') || 5);
    await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
    return request(cfg, urlPath, { method, token, body, retries: retries - 1 });
  }

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${method} ${urlPath} bukan JSON (${res.status}): ${text.slice(0, 120)}`);
  }
  if (!res.ok) {
    const err = new Error(`${method} ${urlPath} gagal: ${json?.message || `HTTP ${res.status}`}`);
    err.status = res.status;
    err.errors = json?.errors;
    throw err;
  }
  return json;
}

async function login(cfg) {
  const json = await request(cfg, '/auth/login', {
    method: 'POST',
    body: {
      identitas: cfg.identitas,
      password: cfg.password,
      nama_perangkat: cfg.namaPerangkat,
    },
  });
  const token = json?.data?.token;
  if (!token) throw new Error('Login sukses tapi token tidak ada di respons.');
  return token;
}

async function getClasses(cfg, token) {
  const classes = [];
  for (let page = 1; ; page += 1) {
    const qs = new URLSearchParams({ per_page: '100', page: String(page) });
    if (cfg.periode) qs.set('id_periode_akademik', cfg.periode);
    const json = await request(cfg, `/praktikum/kelas?${qs}`, { token });
    classes.push(...(json.data || []));
    if (page >= (json.meta?.last_page ?? 1)) return classes;
  }
}

async function getParticipants(cfg, token, classId) {
  const json = await request(cfg, `/praktikum/kelas/${classId}`, { token });
  return json?.data?.peserta || [];
}

function csvCell(value) {
  const d = delim();
  const s = value == null ? '' : String(value);
  return s.includes(d) || s.includes('"') || s.includes('\n')
    ? `"${s.replaceAll('"', '""')}"`
    : s;
}

function toCsv(rows, columns) {
  const d = delim();
  const lines = [columns.map((c) => csvCell(c[0])).join(d)];
  for (const row of rows) lines.push(columns.map((c) => csvCell(c[1](row))).join(d));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

export { toCsv, COLUMNS };

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'kelas';
}

const COLUMNS = [
  ['kode_mk', (r) => r.kode_mk],
  ['nama_mk', (r) => r.nama_mk],
  ['kelompok', (r) => r.kelompok],
  ['nim', (r) => r.nim],
  ['nama', (r) => r.nama],
  ['status', (r) => r.status],
  ['id_kelas', (r) => r.id_kelas],
];

async function main() {
  await loadEnv();
  const cfg = readCfg();
  const missing = ['identitas', 'password'].filter((k) => !cfg[k]);
  if (missing.length) {
    throw new Error(`Isi dulu ${missing.map((k) => `ICLABS_${k.toUpperCase()}`).join(', ')} di file .env`);
  }

  console.log(`Login sebagai ${cfg.identitas} ...`);
  const token = await login(cfg);

  const classes = await getClasses(cfg, token);
  console.log(`Kelas ditemukan: ${classes.length}`);
  if (!classes.length) {
    console.log('Tidak ada kelas pada periode aktif untuk akun ini.');
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  const allRows = [];

  for (const cls of classes) {
    const kodeMk = cls.mata_kuliah?.kode ?? '';
    const namaMk = cls.mata_kuliah?.nama ?? '';
    const kelompok = cls.kelompok?.kode ?? cls.kelompok?.nama ?? '';
    const classId = cls.id_kelas_kuliah;

    const peserta = await getParticipants(cfg, token, classId);
    const rows = peserta.map((p) => ({
      kode_mk: kodeMk,
      nama_mk: namaMk,
      kelompok,
      nim: p.nim,
      nama: p.nama,
      status: p.status,
      id_kelas: classId,
    }));
    allRows.push(...rows);

    const file = path.join(OUT_DIR, `peserta-${slug(kodeMk)}-${slug(kelompok)}-${classId}.csv`);
    await writeFile(file, toCsv(rows, COLUMNS), 'utf8');
    console.log(`  ${kodeMk} ${kelompok || '-'} (id ${classId}): ${rows.length} peserta -> ${path.relative(ROOT, file)}`);
  }

  const combined = path.join(OUT_DIR, 'semua-peserta.csv');
  await writeFile(combined, toCsv(allRows, COLUMNS), 'utf8');
  console.log(`Total ${allRows.length} baris -> ${path.relative(ROOT, combined)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Gagal:', err.message);
    if (err.errors) console.error(JSON.stringify(err.errors, null, 2));
    process.exit(1);
  });
}
