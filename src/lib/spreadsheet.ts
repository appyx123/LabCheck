import type { ClassRecapData, ModuleRecapData } from '../types';

export interface ParsedStudentRow {
  nim: string;
  name: string;
  status: string;
}

export interface StudentImportPreview {
  valid: ParsedStudentRow[];
  duplicateNims: string[];
  skippedRows: number;
}

function normalizeHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
}

function detectCsvDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] || '';
  const semi = (firstLine.match(/;/g) || []).length;
  const comma = (firstLine.match(/,/g) || []).length;
  return semi > comma ? ';' : ',';
}

export async function parseStudentsFile(file: File): Promise<StudentImportPreview> {
  const XLSX = await import('xlsx');
  const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type.includes('csv');
  let workbook: import('xlsx').WorkBook;

  if (isCsv) {
    const rawText = await file.text();
    const cleanText = rawText.replace(/^\uFEFF/, '');
    const fs = detectCsvDelimiter(cleanText);
    workbook = XLSX.read(cleanText, { type: 'string', FS: fs, raw: true });
  } else {
    const buf = await file.arrayBuffer();
    workbook = XLSX.read(buf, { type: 'array', raw: true });
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { valid: [], duplicateNims: [], skippedRows: 0 };
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });

  if (rows.length === 0) {
    return { valid: [], duplicateNims: [], skippedRows: 0 };
  }

  const keys = Object.keys(rows[0]);
  const nimKey =
    keys.find((k) => {
      const n = normalizeHeader(k);
      return n === 'nim' || n === 'stb' || n === 'npm' || n === 'nrp' || n.includes('nim');
    }) || keys[0];

  const nameKey =
    keys.find((k) => {
      const n = normalizeHeader(k);
      return (
        n === 'nama' ||
        n === 'name' ||
        n === 'nama_lengkap' ||
        n === 'nama_mahasiswa' ||
        n === 'nama_peserta' ||
        (n.includes('nama') && !n.includes('mk') && !n.includes('kelas'))
      );
    }) || keys[1];

  const statusKey = keys.find((k) => normalizeHeader(k) === 'status');

  const seen = new Map<string, ParsedStudentRow>();
  const duplicateSet = new Set<string>();
  let skippedRows = 0;

  for (const row of rows) {
    const nim = String(row[nimKey] ?? '').trim();
    const name = String(row[nameKey] ?? '').trim();
    const status = statusKey ? String(row[statusKey] ?? 'AKTIF').trim() || 'AKTIF' : 'AKTIF';

    if (!nim || !name) {
      skippedRows += 1;
      continue;
    }

    if (seen.has(nim)) {
      duplicateSet.add(nim);
    }
    seen.set(nim, { nim, name, status });
  }

  return {
    valid: Array.from(seen.values()),
    duplicateNims: Array.from(duplicateSet),
    skippedRows,
  };
}

function safeFilename(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'rekap'
  );
}

function downloadCsvString(csvContent: string, filename: string) {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toSemicolonCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const escape = (val: string | number) => {
    const s = String(val ?? '');
    return s.includes(';') || s.includes('"') || s.includes('\n')
      ? `"${s.replaceAll('"', '""')}"`
      : s;
  };
  const lines = [headers.map(escape).join(';')];
  for (const r of rows) lines.push(r.map(escape).join(';'));
  return lines.join('\r\n') + '\r\n';
}

export async function exportModuleRecap(data: ModuleRecapData, format: 'xlsx' | 'csv') {
  const taskHeaders = Array.from({ length: data.module.taskCount }, (_, i) => `T${i + 1}`);
  const headers = ['No', 'NIM', 'Nama', ...taskHeaders, 'Selesai', 'Nilai'];

  const rows = data.students.map((st, idx) => {
    const doneSet = new Set(st.completedTasks);
    const flags = Array.from({ length: data.module.taskCount }, (_, i) =>
      doneSet.has(i + 1) ? '✓' : '-'
    );
    return [
      idx + 1,
      st.nim,
      st.name,
      ...flags,
      `${st.completedCount}/${data.module.taskCount}`,
      st.score,
    ];
  });

  const baseName = `rekap-${safeFilename(data.class.title)}-${safeFilename(data.module.title)}`;

  if (format === 'csv') {
    downloadCsvString(toSemicolonCsv(headers, rows), `${baseName}.csv`);
    return;
  }

  const XLSX = await import('xlsx');
  const dateInfo = data.module.moduleDate ? ` | Tanggal: ${data.module.moduleDate}` : '';
  const ws = XLSX.utils.aoa_to_sheet([
    [`Rekap Modul: ${data.module.title}${dateInfo}`],
    [`Kelas: ${data.class.title} | Asisten: ${data.assistantName}`],
    [`Bobot per Tugas: ${data.module.pointsPerTask} | Rata-rata: ${data.summary.averageScore}`],
    [],
    headers,
    ...rows,
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap Modul');
  XLSX.writeFile(wb, `${baseName}.xlsx`);
}

export async function exportClassRecap(data: ClassRecapData, format: 'xlsx' | 'csv') {
  const modHeaders = data.modules.map((m) => m.title);
  const headers = ['No', 'NIM', 'Nama', ...modHeaders, 'Nilai Akhir'];

  const rows = data.students.map((st, idx) => [
    idx + 1,
    st.nim,
    st.name,
    ...data.modules.map((m) => st.scoresByModule[m.id] ?? 0),
    st.finalScore,
  ]);

  const baseName = `rekap-kelas-${safeFilename(data.class.title)}`;

  if (format === 'csv') {
    downloadCsvString(toSemicolonCsv(headers, rows), `${baseName}.csv`);
    return;
  }

  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([
    [`Rekap Lintas Modul: ${data.class.title}`],
    [`Asisten: ${data.assistantName} | Rata-rata Kelas: ${data.summary.classAverage}`],
    [],
    headers,
    ...rows,
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap Kelas');
  XLSX.writeFile(wb, `${baseName}.xlsx`);
}
