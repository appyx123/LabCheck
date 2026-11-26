import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Download,
  FileSpreadsheet,
  Printer,
  TrendingUp,
  Users,
} from 'lucide-react';
import { api, isAbortError } from '../lib/api';
import { formatModuleDate } from '../lib/date';
import { exportModuleRecap } from '../lib/spreadsheet';
import type { ModuleRecapData } from '../types';
import { RecapSkeleton } from './PageSkeletons';

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
    const controller = new AbortController();
    setLoading(true);
    api
      .getModuleRecap(moduleId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setRecap(data);
        setError('');
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setError(err instanceof Error ? err.message : 'Gagal memuat rekap modul.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [moduleId]);

  if (loading) {
    return <RecapSkeleton />;
  }

  if (error || !recap) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-[#F6F7F9] px-4 gap-3 text-center">
        <p className="text-sm font-medium text-slate-600">{error || 'Data rekap tidak ditemukan.'}</p>
        <button
          type="button"
          onClick={() => onBackToBoard(moduleId)}
          className="min-h-[44px] px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition"
        >
          Kembali ke Board
        </button>
      </div>
    );
  }

  const taskNumbers = Array.from({ length: recap.module.taskCount }, (_, i) => i + 1);

  return (
    <div className="min-h-dvh bg-[#F6F7F9] flex flex-col">
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-slate-200/80 safe-top no-print">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 h-15 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              onClick={() => onBackToClass(recap.class.id)}
              aria-label="Kembali ke kelas"
              className="min-h-[44px] min-w-[44px] -ml-1 inline-flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 shrink-0 transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-slate-500 truncate">{recap.class.title}</p>
              <h1 className="font-bold text-slate-900 truncate text-sm sm:text-base leading-tight">
                Rekap · {recap.module.title}
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onBackToBoard(recap.module.id)}
            className="min-h-[40px] px-3.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition"
          >
            <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
            Buka Board
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 pb-16 space-y-5">
        {/* Print-Only Header */}
        <div className="hidden print-only mb-4 pb-3 border-b border-slate-800">
          <h1 className="text-base font-bold">REKAP MODUL — {recap.module.title}</h1>
          <p className="text-xs text-slate-600 mt-1">
            Kelas: {recap.class.title}
            {recap.module.moduleDate
              ? ` · Tanggal: ${formatModuleDate(recap.module.moduleDate, 'long')}`
              : ''}{' '}
            · Asisten: {recap.assistantName} · {recap.module.taskCount} Tugas (@
            {recap.module.pointsPerTask}) · Rata-rata: {recap.summary.averageScore} ·{' '}
            {new Date(recap.generatedAt).toLocaleDateString('id-ID', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>

        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
            <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200/80 font-medium text-slate-700">
              {recap.module.taskCount} tugas
            </span>
            {recap.module.moduleDate && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50/70 border border-indigo-200/70 font-medium text-indigo-700">
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                {formatModuleDate(recap.module.moduleDate, 'long')}
              </span>
            )}
            <span>Bobot @{recap.module.pointsPerTask} per soal (bulat ke atas)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => exportModuleRecap(recap, 'xlsx')}
              className="min-h-[42px] px-3.5 rounded-xl bg-white border border-slate-200/90 hover:bg-slate-50 text-slate-800 font-semibold text-xs sm:text-sm inline-flex items-center gap-1.5 shadow-2xs transition"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              Excel
            </button>
            <button
              type="button"
              onClick={() => exportModuleRecap(recap, 'csv')}
              className="min-h-[42px] px-3.5 rounded-xl bg-white border border-slate-200/90 hover:bg-slate-50 text-slate-800 font-semibold text-xs sm:text-sm inline-flex items-center gap-1.5 shadow-2xs transition"
            >
              <Download className="w-4 h-4 text-slate-500" />
              CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[42px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm inline-flex items-center gap-1.5 shadow-sm shadow-slate-900/15 transition"
            >
              <Printer className="w-4 h-4" />
              Cetak PDF
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5 no-print">
          <div className="surface-card rounded-2xl p-3.5 sm:p-4 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 hidden sm:inline-flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5" />
            </span>
            <div>
              <p className="text-[11px] sm:text-xs font-medium text-slate-500">Rata-rata</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums mt-0.5 leading-tight">
                {recap.summary.averageScore}
              </p>
            </div>
          </div>
          <div className="surface-card rounded-2xl p-3.5 sm:p-4 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 hidden sm:inline-flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </span>
            <div>
              <p className="text-[11px] sm:text-xs font-medium text-slate-500">Tuntas 100</p>
              <p className="text-xl sm:text-2xl font-bold text-emerald-700 tabular-nums mt-0.5 leading-tight">
                {recap.summary.completedAllCount}
                <span className="text-sm font-medium text-slate-400">
                  /{recap.summary.totalStudents}
                </span>
              </p>
            </div>
          </div>
          <div className="surface-card rounded-2xl p-3.5 sm:p-4 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 hidden sm:inline-flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </span>
            <div>
              <p className="text-[11px] sm:text-xs font-medium text-slate-500">Praktikan</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums mt-0.5 leading-tight">
                {recap.summary.totalStudents}
              </p>
            </div>
          </div>
        </div>

        {/* Per-Task Completion */}
        <section className="surface-card rounded-2xl p-4 sm:p-5 no-print">
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="font-semibold text-xs uppercase tracking-wider text-slate-500">
              Penyelesaian per Tugas
            </h2>
            <span className="text-xs text-slate-400 tabular-nums">
              {recap.module.taskCount} soal
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {recap.summary.perTaskStats.map((stat) => (
              <div
                key={stat.taskNumber}
                className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 space-y-2"
              >
                <div className="flex items-baseline justify-between text-xs tabular-nums">
                  <span className="font-bold text-slate-900">T{stat.taskNumber}</span>
                  <span className="font-semibold text-emerald-700">{stat.percentage}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-200/70 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full transition-all"
                    style={{ width: `${Math.min(100, stat.percentage)}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  {stat.completedCount}/{recap.summary.totalStudents} selesai
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Mobile List */}
        <div className="surface-card rounded-2xl divide-y divide-slate-100 md:hidden no-print overflow-hidden">
          {recap.students.map((st, idx) => {
            const doneSet = new Set(st.completedTasks);
            const isFull = st.score >= 100;
            return (
              <div key={st.studentId} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span
                      title={`Nomor meja ${idx + 1}`}
                      className="min-w-[28px] h-7 px-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-mono font-semibold inline-flex items-center justify-center shrink-0 tabular-nums mt-0.5"
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-slate-900 truncate">{st.name}</p>
                      <p className="text-xs font-mono text-slate-500 tabular-nums mt-0.5">{st.nim}</p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-lg text-sm font-bold tabular-nums shrink-0 ${
                      isFull
                        ? 'bg-emerald-100 text-emerald-800'
                        : st.score > 0
                          ? 'bg-slate-100 text-slate-900'
                          : 'text-slate-400'
                    }`}
                  >
                    {st.score}
                  </span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {taskNumbers.map((num) => {
                    const ok = doneSet.has(num);
                    return (
                      <span
                        key={num}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-medium ${
                          ok
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                            : 'bg-slate-50 text-slate-400 border border-slate-200/70'
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
        <div className="hidden md:block print-only surface-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm print-table">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200/80 text-left text-xs font-semibold text-slate-500">
                  <th className="py-3 px-4 w-11">#</th>
                  <th className="py-3 px-3">NIM</th>
                  <th className="py-3 px-3">Nama Praktikan</th>
                  {taskNumbers.map((num) => (
                    <th key={num} className="py-3 px-2 text-center">
                      T{num}
                    </th>
                  ))}
                  <th className="py-3 px-4 text-right">Nilai</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {recap.students.map((st, idx) => {
                  const doneSet = new Set(st.completedTasks);
                  const isFull = st.score >= 100;
                  return (
                    <tr key={st.studentId} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-4 text-slate-400 text-xs">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-mono text-xs text-slate-500">{st.nim}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{st.name}</td>
                      {taskNumbers.map((num) => (
                        <td key={num} className="py-2.5 px-2 text-center">
                          {doneSet.has(num) ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-emerald-50 text-emerald-700 font-bold text-xs">
                              ✓
                            </span>
                          ) : (
                            <span className="text-slate-300">·</span>
                          )}
                        </td>
                      ))}
                      <td className="py-2.5 px-4 text-right">
                        <span
                          className={`inline-flex items-center justify-center min-w-[38px] px-2 py-0.5 rounded-lg text-xs font-bold ${
                            isFull
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'text-slate-900'
                          }`}
                        >
                          {st.score}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
