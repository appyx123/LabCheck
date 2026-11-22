import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  Loader2,
  Printer,
} from 'lucide-react';
import { api } from '../lib/api';
import { exportModuleRecap } from '../lib/spreadsheet';
import type { ModuleRecapData } from '../types';

interface ModuleRecapViewProps {
  moduleId: string;
  onBackToBoard: (moduleId: string) => void;
  onBackToClass: (classId: string) => void;
}

export function ModuleRecapView({
  moduleId,
  onBackToBoard,
  onBackToClass,
}: ModuleRecapViewProps) {
  const [recap, setRecap] = useState<ModuleRecapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api
      .getModuleRecap(moduleId)
      .then((data) => {
        setRecap(data);
        setError('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Gagal memuat rekap modul.'))
      .finally(() => setLoading(false));
  }, [moduleId]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#fafafa]">
        <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (error || !recap) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-[#fafafa] px-4 gap-3">
        <p className="text-sm text-neutral-600">{error || 'Data rekap tidak ditemukan.'}</p>
        <button
          type="button"
          onClick={() => onBackToBoard(moduleId)}
          className="min-h-[44px] px-4 rounded-lg bg-neutral-900 text-white text-sm font-medium"
        >
          Kembali ke Board
        </button>
      </div>
    );
  }

  const taskNumbers = Array.from({ length: recap.module.taskCount }, (_, i) => i + 1);

  return (
    <div className="min-h-dvh bg-[#fafafa] flex flex-col">
      <header className="sticky top-0 z-30 bg-[#fafafa]/90 backdrop-blur border-b border-neutral-200/80 safe-top no-print">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              onClick={() => onBackToClass(recap.class.id)}
              aria-label="Kembali"
              className="min-h-[44px] min-w-[44px] -ml-1 inline-flex items-center justify-center rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <p className="text-[11px] text-neutral-500 truncate">{recap.class.title}</p>
              <h1 className="font-semibold text-neutral-900 truncate text-sm sm:text-base">
                Rekap · {recap.module.title}
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onBackToBoard(recap.module.id)}
            className="min-h-[40px] px-3 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-800 text-xs font-medium shrink-0"
          >
            Board
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-5 pb-14 space-y-5">
        {/* Print-Only Header */}
        <div className="hidden print-only mb-4 pb-3 border-b border-neutral-800">
          <h1 className="text-base font-bold">
            REKAP MODUL — {recap.module.title}
          </h1>
          <p className="text-xs text-neutral-600 mt-1">
            Kelas: {recap.class.title} · Asisten: {recap.assistantName} · {recap.module.taskCount}{' '}
            Tugas (@{recap.module.pointsPerTask}) · Rata-rata: {recap.summary.averageScore} ·{' '}
            {new Date(recap.generatedAt).toLocaleDateString('id-ID', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 no-print">
          <p className="text-xs text-neutral-500 tabular-nums">
            {recap.module.taskCount} tugas · bobot @{recap.module.pointsPerTask} (bulat ke atas)
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => exportModuleRecap(recap, 'xlsx')}
              className="min-h-[44px] px-3 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-800 font-medium text-sm inline-flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-4 h-4 text-neutral-500" />
              Excel
            </button>
            <button
              type="button"
              onClick={() => exportModuleRecap(recap, 'csv')}
              className="min-h-[44px] px-3 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-800 font-medium text-sm inline-flex items-center gap-1.5"
            >
              <Download className="w-4 h-4 text-neutral-500" />
              CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[44px] px-3.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-sm inline-flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              Cetak PDF
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-3 bg-white rounded-xl border border-neutral-200/90 divide-x divide-neutral-200/80 no-print">
          <div className="p-3.5">
            <p className="text-xs text-neutral-500">Rata-rata</p>
            <p className="text-2xl font-semibold text-neutral-900 tabular-nums mt-0.5">
              {recap.summary.averageScore}
            </p>
          </div>
          <div className="p-3.5">
            <p className="text-xs text-neutral-500">Tuntas 100</p>
            <p className="text-2xl font-semibold text-neutral-900 tabular-nums mt-0.5">
              {recap.summary.completedAllCount}
              <span className="text-sm font-normal text-neutral-400">
                /{recap.summary.totalStudents}
              </span>
            </p>
          </div>
          <div className="p-3.5">
            <p className="text-xs text-neutral-500">Praktikan</p>
            <p className="text-2xl font-semibold text-neutral-900 tabular-nums mt-0.5">
              {recap.summary.totalStudents}
            </p>
          </div>
        </div>

        {/* Per-Task Completion */}
        <section className="bg-white rounded-xl border border-neutral-200/90 p-4 no-print">
          <h2 className="font-medium text-xs uppercase tracking-wider text-neutral-500 mb-3">
            Penyelesaian per Tugas
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {recap.summary.perTaskStats.map((stat) => (
              <div key={stat.taskNumber} className="space-y-1.5">
                <div className="flex items-baseline justify-between text-xs tabular-nums">
                  <span className="font-medium text-neutral-900">T{stat.taskNumber}</span>
                  <span className="text-neutral-500">{stat.percentage}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                  <div
                    className="h-full bg-emerald-700 rounded-full"
                    style={{ width: `${Math.min(100, stat.percentage)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Mobile List */}
        <div className="bg-white rounded-xl border border-neutral-200/90 divide-y divide-neutral-100 md:hidden no-print">
          {recap.students.map((st) => {
            const doneSet = new Set(st.completedTasks);
            return (
              <div key={st.studentId} className="p-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-neutral-900 truncate">{st.name}</p>
                    <p className="text-xs font-mono text-neutral-500 tabular-nums">{st.nim}</p>
                  </div>
                  <span
                    className={`text-base font-semibold tabular-nums shrink-0 ${
                      st.score >= 100 ? 'text-emerald-700' : 'text-neutral-900'
                    }`}
                  >
                    {st.score}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {taskNumbers.map((num) => {
                    const ok = doneSet.has(num);
                    return (
                      <span
                        key={num}
                        className={`px-1.5 py-0.5 rounded text-[11px] font-mono ${
                          ok
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'text-neutral-400 border border-neutral-200'
                        }`}
                      >
                        T{num}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop + Print Table */}
        <div className="hidden md:block print-only bg-white rounded-xl border border-neutral-200/90 overflow-x-auto">
          <table className="w-full text-sm print-table">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs font-medium text-neutral-500">
                <th className="py-2.5 px-3 w-10">#</th>
                <th className="py-2.5 px-3">NIM</th>
                <th className="py-2.5 px-3">Nama</th>
                {taskNumbers.map((num) => (
                  <th key={num} className="py-2.5 px-2 text-center">
                    T{num}
                  </th>
                ))}
                <th className="py-2.5 px-3 text-right">Nilai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 tabular-nums">
              {recap.students.map((st, idx) => {
                const doneSet = new Set(st.completedTasks);
                return (
                  <tr key={st.studentId} className="hover:bg-neutral-50/70">
                    <td className="py-2 px-3 text-neutral-400 text-xs">{idx + 1}</td>
                    <td className="py-2 px-3 font-mono text-xs text-neutral-600">{st.nim}</td>
                    <td className="py-2 px-3 font-medium text-neutral-900">{st.name}</td>
                    {taskNumbers.map((num) => (
                      <td key={num} className="py-2 px-2 text-center">
                        {doneSet.has(num) ? (
                          <span className="font-semibold text-emerald-700">✓</span>
                        ) : (
                          <span className="text-neutral-300">·</span>
                        )}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right font-semibold text-neutral-900">
                      {st.score}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
