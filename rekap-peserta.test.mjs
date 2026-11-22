import assert from 'node:assert/strict';
import test from 'node:test';
import { toCsv, COLUMNS } from './rekap-peserta.mjs';

test('csv: header, nilai berdelimiter, tanda kutip, BOM', () => {
  const rows = [
    { kode_mk: 'IF101', nama_mk: 'Pemrograman; Dasar', kelompok: 'A', nim: '2023"1', nama: 'Ani', status: 'AKTIF', id_kelas: 1 },
  ];
  const csv = toCsv(rows, COLUMNS);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.equal(csv.split('\r\n')[0].replace('\uFEFF', ''), 'kode_mk;nama_mk;kelompok;nim;nama;status;id_kelas');
  assert.ok(csv.includes('"Pemrograman; Dasar"'));
  assert.ok(csv.includes('"2023""1"'));
});

test('csv: nilai kosong jadi sel kosong', () => {
  const rows = [{ kode_mk: 'IF101', nama_mk: 'X', kelompok: '', nim: '1', nama: 'B', status: 'AKTIF', id_kelas: 2 }];
  assert.ok(toCsv(rows, COLUMNS).includes('IF101;X;;1;B;AKTIF;2'));
});
