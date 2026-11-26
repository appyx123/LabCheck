import { lazy, Suspense, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Calendar,
  Check,
  CheckSquare,
  CloudDownload,
  Copy,
  Download,
  Edit3,
  FileSpreadsheet,
  Layers,
  Loader2,
  Minus,
  MoreHorizontal,
  Plus,
  Printer,
  Search,
  Trash2,
  TrendingUp,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api, isAbortError } from '../lib/api';
import { formatModuleDate, getTodayDateInput } from '../lib/date';
import {
  exportClassRecap,
  parseStudentsFile,
  type StudentImportPreview,
} from '../lib/spreadsheet';
import type { ClassItem, ClassRecapData, ModuleItem, StudentItem } from '../types';
import { Modal } from './Modal';

const IclabsSyncModal = lazy(() =>
  import('./IclabsSyncModal').then((m) => ({ default: m.IclabsSyncModal }))
);

type TabKey = 'modules' | 'students' | 'recap';

const TASK_PRESETS = [2, 3, 4, 5, 6, 8, 10];

interface ClassWorkspaceProps {
  classId: string;
  initialTab?: TabKey;
  onBack: () => void;
  onOpenBoard: (moduleId: string) => void;
  onOpenModuleRecap: (moduleId: string) => void;
}

export function ClassWorkspace({
  classId,
  initialTab = 'modules',
  onBack,
  onOpenBoard,
  onOpenModuleRecap,
}: ClassWorkspaceProps) {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [cls, setCls] = useState<ClassItem | null>(null);
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [recap, setRecap] = useState<ClassRecapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Module modals
  const [modModalOpen, setModModalOpen] = useState(false);
  const [editingMod, setEditingMod] = useState<ModuleItem | null>(null);
  const [modTitle, setModTitle] = useState('');
  const [modDate, setModDate] = useState('');
  const [modTaskCount, setModTaskCount] = useState(4);
  const [modShrinkConfirm, setModShrinkConfirm] = useState(false);
  const [modMenuId, setModMenuId] = useState<string | null>(null);
  const [deleteModTarget, setDeleteModTarget] = useState<ModuleItem | null>(null);

  // Student search & modals
  const [studentQuery, setStudentQuery] = useState('');
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentItem | null>(null);
  const [stuNim, setStuNim] = useState('');
  const [stuName, setStuName] = useState('');
  const [stuStatus, setStuStatus] = useState('AKTIF');
  const [deleteStudentTarget, setDeleteStudentTarget] = useState<StudentItem | null>(null);

  // Import modal
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<StudentImportPreview | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [importError, setImportError] = useState('');

  const [resyncOpen, setResyncOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  async function handleCopySyncCode() {
    if (!cls?.syncCode) return;
    try {
      await navigator.clipboard.writeText(cls.syncCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // ignore
    }
  }

  // Fetch class + modules (with stats) and students in 2 calls instead of 3 (no double modules query)
  async function loadAll(signal?: AbortSignal) {
    setError('');
    try {
      const [clsRes, stuRes] = await Promise.all([
        api.getClass(classId, signal),
        api.getStudents(classId, signal),
      ]);
      if (signal?.aborted) return;
      setCls(clsRes.class);
      setModules(clsRes.modules);
      setStudents(stuRes.students);
    } catch (err) {
      if (isAbortError(err)) return;
      setError(err instanceof Error ? err.message : 'Gagal memuat data kelas.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  async function refreshModulesOnly() {
    setError('');
    try {
      const res = await api.getModules(classId);
      setModules(res.modules);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat modul.');
    }
  }

  async function loadRecap(signal?: AbortSignal) {
    try {
      const data = await api.getClassRecap(classId, signal);
      if (!signal?.aborted) setRecap(data);
    } catch (err) {
      if (isAbortError(err)) return;
      setError(err instanceof Error ? err.message : 'Gagal memuat rekap kelas.');
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setRecap(null);
    void loadAll(controller.signal);
    return () => controller.abort();
  }, [classId]);

  useEffect(() => {
    if (tab !== 'recap') return;
    const controller = new AbortController();
    void loadRecap(controller.signal);
    return () => controller.abort();
  }, [tab, classId]);

  const seatNumberById = useMemo(() => {
    const map = new Map<string, number>();
    students.forEach((s, idx) => {
      map.set(s.id, idx + 1);
    });
    return map;
  }, [students]);

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => {
      const seatNo = String(seatNumberById.get(s.id) ?? '');
      return (
        seatNo === q ||
        s.nim.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q)
      );
    });
  }, [students, studentQuery, seatNumberById]);

  function openCreateMod() {
    setEditingMod(null);
    setModTitle('');
    setModDate(getTodayDateInput());
    setModTaskCount(4);
    setModShrinkConfirm(false);
    setModModalOpen(true);
  }

  function openEditMod(m: ModuleItem) {
    setModMenuId(null);
    setEditingMod(m);
    setModTitle(m.title);
    setModDate(m.moduleDate || '');
    setModTaskCount(m.taskCount);
    setModShrinkConfirm(false);
    setModModalOpen(true);
  }

  function updateTaskCount(next: number) {
    const clamped = Math.max(1, Math.min(30, next));
    setModTaskCount(clamped);
    setModShrinkConfirm(false);
  }

  async function handleSaveMod(e: FormEvent) {
    e.preventDefault();
    if (!modTitle.trim()) return;
    if (editingMod && modTaskCount < editingMod.taskCount && !modShrinkConfirm) {
      setModShrinkConfirm(true);
      return;
    }
    setSaving(true);
    try {
      const normalizedDate = modDate.trim() || null;
      if (editingMod) {
        await api.updateModule(editingMod.id, {
          title: modTitle.trim(),
          taskCount: modTaskCount,
          moduleDate: normalizedDate,
        });
      } else {
        await api.createModule(classId, {
          title: modTitle.trim(),
          taskCount: modTaskCount,
          moduleDate: normalizedDate,
        });
      }
      setModModalOpen(false);
      await refreshModulesOnly();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan modul.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteMod() {
    if (!deleteModTarget) return;
    setSaving(true);
    try {
      await api.deleteModule(deleteModTarget.id);
      setDeleteModTarget(null);
      await refreshModulesOnly();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus modul.');
    } finally {
      setSaving(false);
    }
  }

  function openAddStudent() {
    setEditingStudent(null);
    setStuNim('');
    setStuName('');
    setStuStatus('AKTIF');
    setStudentModalOpen(true);
  }

  function openEditStudent(st: StudentItem) {
    setEditingStudent(st);
    setStuNim(st.nim);
    setStuName(st.name);
    setStuStatus(st.status || 'AKTIF');
    setStudentModalOpen(true);
  }

  async function handleSaveStudent(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingStudent) {
        await api.updateStudent(editingStudent.id, {
          nim: stuNim.trim(),
          name: stuName.trim(),
          status: stuStatus.trim() || 'AKTIF',
        });
      } else {
        await api.createStudent(classId, {
          nim: stuNim.trim(),
          name: stuName.trim(),
          status: stuStatus.trim() || 'AKTIF',
        });
      }
      setStudentModalOpen(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan praktikan.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteStudent() {
    if (!deleteStudentTarget) return;
    setSaving(true);
    try {
      await api.deleteStudent(deleteStudentTarget.id);
      setDeleteStudentTarget(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus praktikan.');
    } finally {
      setSaving(false);
    }
  }

  async function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    setImportFileName(file.name);
    try {
      const parsed = await parseStudentsFile(file);
      if (parsed.valid.length === 0) {
        setImportError('Tidak ditemukan baris valid dengan kolom NIM dan Nama.');
        setImportPreview(null);
      } else {
        setImportPreview(parsed);
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Gagal membaca file.');
      setImportPreview(null);
    }
  }

  async function handleConfirmImport() {
    if (!importPreview || importPreview.valid.length === 0) return;
    setSaving(true);
    setImportError('');
    try {
      await api.importStudents(classId, importPreview.valid);
      setImportOpen(false);
      setImportPreview(null);
      setImportFileName('');
      await loadAll();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Gagal mengimpor praktikan.');
    } finally {
      setSaving(false);
    }
  }

  // Pembulatan ke atas (tanpa desimal)
  const previewWeight =
    modTaskCount > 0 ? Math.min(100, Math.ceil(100 / modTaskCount - 1e-9)) : 0;

  return (
    <div className="min-h-dvh bg-[#F6F7F9] flex flex-col">
      {/* Click-outside backdrop for module menu */}
      {modMenuId && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setModMenuId(null)}
          aria-hidden="true"
        />
      )}

      {/* Sticky Glass Header */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-slate-200/80 safe-top no-print">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 h-15 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              onClick={onBack}
              aria-label="Kembali ke daftar kelas"
              className="min-h-[44px] min-w-[44px] -ml-1 inline-flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 shrink-0 transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="font-bold text-slate-900 truncate text-sm sm:text-base leading-tight">
                  {cls?.title || 'Memuat...'}
                </h1>
                {cls && (
                  <span
                    className={`hidden sm:inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                      cls.source === 'iclabs'
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {cls.source === 'iclabs' ? 'ICLabs' : 'Manual'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[11px] font-medium text-slate-500 tabular-nums">
                  {students.length} praktikan · {modules.length} modul
                  {(cls?.memberCount ?? 1) > 1 ? ` · ${cls?.memberCount} asisten` : ''}
                </p>
                {cls?.syncCode && (
                  <button
                    type="button"
                    onClick={handleCopySyncCode}
                    title="Salin kode sinkronisasi kelas"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 hover:bg-amber-100/80 text-amber-800 border border-amber-200/70 text-[10px] font-mono font-semibold transition"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        Tersalin
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        {cls.syncCode}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Desktop / Tablet Segmented Pill Tabs */}
          <nav className="hidden md:flex items-center bg-slate-100/90 p-1 rounded-xl gap-1">
            {(
              [
                ['modules', 'Modul', modules.length],
                ['students', 'Praktikan', students.length],
                ['recap', 'Rekap', null],
              ] as const
            ).map(([key, label, badge]) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                    active
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <span>{label}</span>
                  {badge !== null && (
                    <span
                      className={`text-[11px] tabular-nums px-1.5 rounded-full ${
                        active ? 'bg-slate-100 text-slate-700' : 'text-slate-400'
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 pb-28 md:pb-14 space-y-5">
        {error && (
          <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200/80 rounded-xl px-4 py-3 no-print">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-1.5">
                <div className="h-5 w-36 rounded-lg skeleton-shimmer" />
                <div className="h-3.5 w-60 rounded skeleton-shimmer" />
              </div>
              <div className="h-11 w-32 rounded-xl skeleton-shimmer" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="surface-card rounded-2xl p-5 space-y-3">
                  <div className="h-5 w-28 rounded-md skeleton-shimmer" />
                  <div className="h-5 w-2/3 rounded-lg skeleton-shimmer" />
                  <div className="h-2 w-full rounded-full skeleton-shimmer mt-4" />
                  <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-3">
                    <div className="h-8 rounded-lg skeleton-shimmer" />
                    <div className="h-8 rounded-lg skeleton-shimmer" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* TAB: MODULES */}
            {tab === 'modules' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="font-bold text-slate-900 text-lg">Daftar Modul</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Buka board untuk mencentang tugas atau lihat rekap nilai per modul.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openCreateMod}
                    className="min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white font-semibold text-sm inline-flex items-center gap-1.5 shadow-sm shadow-slate-900/15 shrink-0 transition"
                  >
                    <Plus className="w-4 h-4" />
                    Modul Baru
                  </button>
                </div>

                {students.length === 0 && (
                  <div className="px-4 py-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 text-xs text-indigo-950">
                      <Users className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span>
                        Kelas ini belum memiliki praktikan. Tambahkan atau impor daftar praktikan
                        terlebih dahulu.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTab('students')}
                      className="min-h-[36px] px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shrink-0 transition self-start sm:self-auto"
                    >
                      Kelola Praktikan
                    </button>
                  </div>
                )}

                {modules.length === 0 ? (
                  <div className="surface-card rounded-2xl p-10 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 inline-flex items-center justify-center mx-auto mb-3.5">
                      <Layers className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-semibold text-slate-900">Belum ada modul</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                      Tambahkan modul praktikum beserta jumlah soalnya (1–30). Bobot nilai dihitung
                      otomatis skala 100.
                    </p>
                    <button
                      type="button"
                      onClick={openCreateMod}
                      className="mt-5 min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold inline-flex items-center gap-1.5 transition"
                    >
                      <Plus className="w-4 h-4" />
                      Tambah Modul Pertama
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {modules.map((m) => {
                      const avg = m.averageScore ?? 0;
                      const doneAll = m.completedAllCount ?? 0;
                      const totalStu = m.studentCount ?? students.length;
                      return (
                        <div
                          key={m.id}
                          className="relative surface-card surface-card-hover rounded-2xl flex flex-col"
                        >
                          <div className="p-5 pr-14 flex-1">
                            <button
                              type="button"
                              onClick={() => onOpenBoard(m.id)}
                              className="text-left block w-full focus:outline-none"
                            >
                              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-medium text-slate-600 tabular-nums">
                                  {m.taskCount} tugas · @{m.pointsPerTask} poin
                                </span>
                                {m.moduleDate && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50/70 text-[11px] font-medium text-indigo-700 tabular-nums">
                                    <Calendar className="w-3 h-3 shrink-0" />
                                    {formatModuleDate(m.moduleDate)}
                                  </span>
                                )}
                              </div>
                              <h3 className="font-semibold text-slate-900 text-base leading-snug">
                                {m.title}
                              </h3>
                            </button>

                            <div className="mt-4 space-y-2">
                              <div className="flex items-center justify-between text-xs tabular-nums">
                                <span className="text-slate-500">
                                  Tuntas{' '}
                                  <strong className="font-semibold text-slate-800">
                                    {doneAll}/{totalStu}
                                  </strong>
                                </span>
                                <span className="font-bold text-slate-900">
                                  Rata-rata{' '}
                                  <span className={avg >= 100 ? 'text-emerald-600' : ''}>
                                    {avg}
                                  </span>
                                </span>
                              </div>
                              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full transition-all duration-300"
                                  style={{ width: `${Math.min(100, avg)}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="absolute top-3 right-3 z-20">
                            <button
                              type="button"
                              aria-label="Aksi modul"
                              onClick={(e) => {
                                e.stopPropagation();
                                setModMenuId(modMenuId === m.id ? null : m.id);
                              }}
                              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                            {modMenuId === m.id && (
                              <div className="absolute right-0 mt-1 w-44 rounded-xl bg-white shadow-xl shadow-slate-900/10 ring-1 ring-slate-200/80 py-1.5 z-30 animate-fade-in">
                                <button
                                  type="button"
                                  onClick={() => openEditMod(m)}
                                  className="w-full min-h-[42px] px-3.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition"
                                >
                                  <Edit3 className="w-4 h-4 text-slate-400" />
                                  Edit Modul
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setModMenuId(null);
                                    setDeleteModTarget(m);
                                  }}
                                  className="w-full min-h-[42px] px-3.5 text-left text-sm font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Hapus Modul
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-2 border-t border-slate-100 divide-x divide-slate-100 text-xs font-semibold">
                            <button
                              type="button"
                              onClick={() => onOpenBoard(m.id)}
                              className="min-h-[46px] text-indigo-700 hover:bg-indigo-50/50 rounded-bl-2xl inline-flex items-center justify-center gap-1.5 transition"
                            >
                              <CheckSquare className="w-3.5 h-3.5" />
                              Buka Board
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenModuleRecap(m.id)}
                              className="min-h-[46px] text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-br-2xl inline-flex items-center justify-center gap-1.5 transition"
                            >
                              <BarChart3 className="w-3.5 h-3.5" />
                              Lihat Rekap
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB: STUDENTS */}
            {tab === 'students' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-slate-900 text-lg tabular-nums">
                      Praktikan ({students.length})
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Kelola peserta praktikum secara manual, impor CSV/Excel, atau sync ICLabs.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cls?.source === 'iclabs' && cls.externalClassId && (
                      <button
                        type="button"
                        onClick={() => setResyncOpen(true)}
                        className="min-h-[44px] px-3.5 rounded-xl bg-white border border-slate-200/90 hover:border-indigo-300 hover:bg-indigo-50/40 text-slate-800 font-semibold text-sm inline-flex items-center gap-1.5 shadow-2xs transition"
                      >
                        <CloudDownload className="w-4 h-4 text-indigo-600" />
                        Sync ICLabs
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setImportPreview(null);
                        setImportFileName('');
                        setImportError('');
                        setImportOpen(true);
                      }}
                      className="min-h-[44px] px-3.5 rounded-xl bg-white border border-slate-200/90 hover:bg-slate-50 text-slate-800 font-semibold text-sm inline-flex items-center gap-1.5 shadow-2xs transition"
                    >
                      <Upload className="w-4 h-4 text-slate-500" />
                      Import
                    </button>
                    <button
                      type="button"
                      onClick={openAddStudent}
                      className="min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm inline-flex items-center gap-1.5 shadow-sm shadow-slate-900/15 transition"
                    >
                      <UserPlus className="w-4 h-4" />
                      Tambah
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={studentQuery}
                    onChange={(e) => setStudentQuery(e.target.value)}
                    placeholder="Cari no. meja, NIM, atau nama praktikan..."
                    className="w-full min-h-[44px] pl-10 pr-11 rounded-xl border border-slate-200/90 bg-white text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition shadow-2xs"
                  />
                  {studentQuery && (
                    <button
                      type="button"
                      onClick={() => setStudentQuery('')}
                      aria-label="Hapus pencarian"
                      className="min-h-[44px] min-w-[44px] absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center text-slate-400 hover:text-slate-900"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {studentQuery && filteredStudents.length > 0 && (
                  <p className="text-xs text-slate-500 tabular-nums">
                    Menampilkan <strong className="text-slate-800">{filteredStudents.length}</strong>{' '}
                    dari {students.length} praktikan
                  </p>
                )}

                {filteredStudents.length === 0 ? (
                  <div className="surface-card rounded-2xl p-10 text-center">
                    <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-400 inline-flex items-center justify-center mx-auto mb-3">
                      <Users className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-medium text-slate-700">
                      {students.length === 0
                        ? 'Belum ada praktikan di kelas ini'
                        : 'Tidak ada praktikan yang cocok'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {students.length === 0
                        ? 'Impor file CSV/Excel atau tambah praktikan secara manual.'
                        : 'Coba gunakan kata kunci NIM atau nama lainnya.'}
                    </p>
                  </div>
                ) : (
                  <div className="surface-card rounded-2xl divide-y divide-slate-100 overflow-hidden">
                    {filteredStudents.map((st, idx) => {
                      const seatNo = seatNumberById.get(st.id) ?? idx + 1;
                      return (
                      <div
                        key={st.id}
                        className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition"
                      >
                        <div className="min-w-0 flex items-center gap-3">
                          <span
                            title={`Nomor meja ${seatNo}`}
                            className="min-w-[28px] h-7 px-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-mono font-semibold inline-flex items-center justify-center shrink-0 tabular-nums"
                          >
                            {seatNo}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-slate-900 truncate">
                              {st.name}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs font-mono text-slate-500 tabular-nums">
                                {st.nim}
                              </span>
                              {st.status && st.status !== 'AKTIF' && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/70 text-[10px] font-semibold">
                                  {st.status}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditStudent(st)}
                            aria-label={`Edit ${st.name}`}
                            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-slate-400 hover:text-indigo-700 hover:bg-indigo-50 transition"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteStudentTarget(st)}
                            aria-label={`Hapus ${st.name}`}
                            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB: CLASS RECAP */}
            {tab === 'recap' && (
              <div className="space-y-5">
                {!recap ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="surface-card rounded-2xl p-4 space-y-2">
                          <div className="h-3 w-16 rounded skeleton-shimmer" />
                          <div className="h-6 w-12 rounded-md skeleton-shimmer" />
                        </div>
                      ))}
                    </div>
                    <div className="surface-card rounded-2xl p-5 space-y-3">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-9 rounded-lg skeleton-shimmer" />
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="hidden print-only mb-4 pb-3 border-b border-slate-800">
                      <h1 className="text-base font-bold">
                        REKAP NILAI PRAKTIKUM — {recap.class.title}
                      </h1>
                      <p className="text-xs text-slate-600 mt-1">
                        Asisten: {recap.assistantName} · Praktikan: {recap.summary.totalStudents} ·
                        Modul: {recap.summary.totalModules} · Rata-rata: {recap.summary.classAverage}{' '}
                        ·{' '}
                        {new Date(recap.generatedAt).toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
                      <div>
                        <h2 className="font-bold text-slate-900 text-lg">Rekap Nilai Kelas</h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Rata-rata nilai lintas modul · siap ekspor Excel/CSV & cetak A4.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => exportClassRecap(recap, 'xlsx')}
                          className="min-h-[42px] px-3.5 rounded-xl bg-white border border-slate-200/90 hover:bg-slate-50 text-slate-800 font-semibold text-xs sm:text-sm inline-flex items-center gap-1.5 shadow-2xs transition"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                          Excel
                        </button>
                        <button
                          type="button"
                          onClick={() => exportClassRecap(recap, 'csv')}
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
                          <p className="text-[11px] sm:text-xs font-medium text-slate-500">
                            Rata-rata
                          </p>
                          <p className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums mt-0.5 leading-tight">
                            {recap.summary.classAverage}
                          </p>
                        </div>
                      </div>
                      <div className="surface-card rounded-2xl p-3.5 sm:p-4 flex items-center gap-3">
                        <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 hidden sm:inline-flex items-center justify-center shrink-0">
                          <Users className="w-5 h-5" />
                        </span>
                        <div>
                          <p className="text-[11px] sm:text-xs font-medium text-slate-500">
                            Praktikan
                          </p>
                          <p className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums mt-0.5 leading-tight">
                            {recap.summary.totalStudents}
                          </p>
                        </div>
                      </div>
                      <div className="surface-card rounded-2xl p-3.5 sm:p-4 flex items-center gap-3">
                        <span className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 hidden sm:inline-flex items-center justify-center shrink-0">
                          <Layers className="w-5 h-5" />
                        </span>
                        <div>
                          <p className="text-[11px] sm:text-xs font-medium text-slate-500">
                            Modul
                          </p>
                          <p className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums mt-0.5 leading-tight">
                            {recap.summary.totalModules}
                          </p>
                        </div>
                      </div>
                    </div>

                    {recap.students.length === 0 ? (
                      <div className="surface-card rounded-2xl p-10 text-center text-xs text-slate-500 no-print">
                        Belum ada data praktikan untuk direkap.
                      </div>
                    ) : (
                      <>
                        {/* Mobile List */}
                        <div className="surface-card rounded-2xl divide-y divide-slate-100 md:hidden no-print overflow-hidden">
                          {recap.students.map((st, idx) => {
                            const isFull = st.finalScore >= 100;
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
                                      <p className="font-semibold text-sm text-slate-900 truncate">
                                        {st.name}
                                      </p>
                                      <p className="text-xs font-mono text-slate-500 tabular-nums mt-0.5">
                                        {st.nim}
                                      </p>
                                    </div>
                                  </div>
                                  <span
                                    className={`px-2.5 py-0.5 rounded-lg text-sm font-bold tabular-nums shrink-0 ${
                                      isFull
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : st.finalScore > 0
                                          ? 'bg-slate-100 text-slate-900'
                                          : 'text-slate-400'
                                    }`}
                                  >
                                    {st.finalScore}
                                  </span>
                                </div>
                                {recap.modules.length > 0 && (
                                  <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs tabular-nums">
                                    {recap.modules.map((m, idx) => {
                                      const val = st.scoresByModule[m.id] ?? 0;
                                      return (
                                        <span
                                          key={m.id}
                                          className={`px-2 py-0.5 rounded-md border ${
                                            val >= 100
                                              ? 'bg-emerald-50 border-emerald-200/80 text-emerald-800'
                                              : 'bg-slate-50 border-slate-200/70 text-slate-600'
                                          }`}
                                        >
                                          M{idx + 1}{' '}
                                          <strong className="font-semibold">{val}</strong>
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
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
                                  {recap.modules.map((m, idx) => (
                                    <th
                                      key={m.id}
                                      title={
                                        m.moduleDate
                                          ? `${m.title} (${formatModuleDate(m.moduleDate)})`
                                          : m.title
                                      }
                                      className="py-3 px-3 text-center"
                                    >
                                      M{idx + 1}
                                    </th>
                                  ))}
                                  <th className="py-3 px-4 text-right">Akhir</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 tabular-nums">
                                {recap.students.map((st, idx) => {
                                  const isFull = st.finalScore >= 100;
                                  return (
                                    <tr key={st.studentId} className="hover:bg-slate-50/80 transition">
                                      <td className="py-2.5 px-4 text-slate-400 text-xs">
                                        {idx + 1}
                                      </td>
                                      <td className="py-2.5 px-3 font-mono text-xs text-slate-500">
                                        {st.nim}
                                      </td>
                                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                                        {st.name}
                                      </td>
                                      {recap.modules.map((m) => {
                                        const val = st.scoresByModule[m.id] ?? 0;
                                        return (
                                          <td
                                            key={m.id}
                                            className={`py-2.5 px-3 text-center ${
                                              val >= 100
                                                ? 'font-semibold text-emerald-700'
                                                : 'text-slate-600'
                                            }`}
                                          >
                                            {val}
                                          </td>
                                        );
                                      })}
                                      <td className="py-2.5 px-4 text-right">
                                        <span
                                          className={`inline-flex items-center justify-center min-w-[38px] px-2 py-0.5 rounded-lg text-xs font-bold ${
                                            isFull
                                              ? 'bg-emerald-100 text-emerald-800'
                                              : 'text-slate-900'
                                          }`}
                                        >
                                          {st.finalScore}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Mobile Bottom Navigation with Active Pill */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200/80 safe-bottom no-print">
        <div className="grid grid-cols-3 px-2 py-1.5 gap-1">
          {(
            [
              ['modules', 'Modul', Layers],
              ['students', 'Praktikan', Users],
              ['recap', 'Rekap', BarChart3],
            ] as const
          ).map(([key, label, Icon]) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`min-h-[50px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition ${
                  active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modal Add/Edit Module */}
      <Modal
        open={modModalOpen}
        onClose={() => setModModalOpen(false)}
        title={editingMod ? 'Edit Modul' : 'Modul Baru'}
        subtitle="Nilai dihitung otomatis skala 100 dengan pembulatan ke atas."
      >
        <form onSubmit={handleSaveMod} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Nama Modul
            </label>
            <input
              type="text"
              required
              value={modTitle}
              onChange={(e) => setModTitle(e.target.value)}
              placeholder="Mis. Modul 1: Subnetting"
              className="w-full min-h-[46px] px-3.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Tanggal Modul <span className="text-slate-400 font-normal">(opsional)</span>
            </label>
            <input
              type="date"
              value={modDate}
              onChange={(e) => setModDate(e.target.value)}
              className="w-full min-h-[46px] px-3.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white text-base text-slate-900 tabular-nums focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Jumlah Tugas (1–30)
            </label>

            {/* Stepper + Input */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateTaskCount(modTaskCount - 1)}
                disabled={modTaskCount <= 1}
                aria-label="Kurangi jumlah tugas"
                className="min-h-[46px] min-w-[46px] rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 inline-flex items-center justify-center text-slate-700 transition"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="number"
                required
                min={1}
                max={30}
                value={modTaskCount}
                onChange={(e) => updateTaskCount(Number(e.target.value) || 1)}
                className="flex-1 min-h-[46px] px-3.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white text-center font-semibold text-base tabular-nums focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition"
              />
              <button
                type="button"
                onClick={() => updateTaskCount(modTaskCount + 1)}
                disabled={modTaskCount >= 30}
                aria-label="Tambah jumlah tugas"
                className="min-h-[46px] min-w-[46px] rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 inline-flex items-center justify-center text-slate-700 transition"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {TASK_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => updateTaskCount(n)}
                  className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold tabular-nums border transition ${
                    modTaskCount === n
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {n} tugas
                </button>
              ))}
            </div>

            <div className="mt-3 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between text-xs tabular-nums">
              <span className="text-slate-500">Bobot per tugas</span>
              <span className="font-bold text-slate-900">@{previewWeight} poin (maks. 100)</span>
            </div>
          </div>

          {modShrinkConfirm && editingMod && (
            <div className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <span>
                Jumlah tugas diperkecil dari {editingMod.taskCount} menjadi {modTaskCount}. Ceklis
                di atas T{modTaskCount} akan dihapus. Tekan simpan lagi untuk konfirmasi.
              </span>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setModModalOpen(false)}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {modShrinkConfirm ? 'Konfirmasi & Simpan' : editingMod ? 'Simpan Perubahan' : 'Buat Modul'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete Module */}
      <Modal
        open={Boolean(deleteModTarget)}
        onClose={() => setDeleteModTarget(null)}
        title="Hapus modul?"
        subtitle="Seluruh data ceklis dan nilai pada modul ini akan ikut terhapus."
      >
        <div className="space-y-4">
          <p className="text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-200/90 rounded-xl px-4 py-3">
            {deleteModTarget?.title}
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={() => setDeleteModTarget(null)}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm transition"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleDeleteMod}
              className="flex-1 min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Ya, Hapus Modul
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Add/Edit Student */}
      <Modal
        open={studentModalOpen}
        onClose={() => setStudentModalOpen(false)}
        title={editingStudent ? 'Edit Praktikan' : 'Tambah Praktikan'}
      >
        <form onSubmit={handleSaveStudent} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">NIM</label>
            <input
              type="text"
              required
              value={stuNim}
              onChange={(e) => setStuNim(e.target.value)}
              placeholder="13020230001"
              className="w-full min-h-[46px] px-3.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white text-base font-mono text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nama Lengkap</label>
            <input
              type="text"
              required
              value={stuName}
              onChange={(e) => setStuName(e.target.value)}
              placeholder="Nama praktikan"
              className="w-full min-h-[46px] px-3.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white text-base text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Status</label>
            <input
              type="text"
              value={stuStatus}
              onChange={(e) => setStuStatus(e.target.value)}
              placeholder="AKTIF"
              className="w-full min-h-[46px] px-3.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white text-base text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setStudentModalOpen(false)}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Simpan
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete Student */}
      <Modal
        open={Boolean(deleteStudentTarget)}
        onClose={() => setDeleteStudentTarget(null)}
        title="Hapus praktikan?"
        subtitle="Nilai praktikan ini di kelas ini akan ikut terhapus."
      >
        <div className="space-y-4">
          <p className="text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-200/90 rounded-xl px-4 py-3">
            {deleteStudentTarget?.name}{' '}
            <span className="font-mono text-xs text-slate-500">({deleteStudentTarget?.nim})</span>
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={() => setDeleteStudentTarget(null)}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm transition"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleDeleteStudent}
              className="flex-1 min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Ya, Hapus
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Import CSV / Excel */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Praktikan"
        subtitle="Pilih file .csv atau .xlsx yang memiliki kolom NIM dan Nama."
        maxWidthClass="sm:max-w-lg"
      >
        <div className="space-y-4">
          <label className="block w-full p-6 rounded-2xl border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50/70 hover:bg-indigo-50/30 text-center cursor-pointer transition">
            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200/80 text-indigo-600 inline-flex items-center justify-center mx-auto mb-2.5 shadow-2xs">
              <Upload className="w-5 h-5" />
            </div>
            <span className="block text-sm font-semibold text-slate-800">
              {importFileName || 'Klik untuk pilih file .csv atau .xlsx'}
            </span>
            <span className="block text-xs text-slate-400 mt-0.5">
              Mendukung pemisah koma (,) maupun titik koma (;)
            </span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFileSelect}
              className="sr-only"
            />
          </label>

          {importError && (
            <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200/80 rounded-xl px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{importError}</span>
            </div>
          )}

          {importPreview && (
            <div className="space-y-2.5">
              <p className="text-xs text-slate-600 tabular-nums">
                <strong className="text-emerald-700">{importPreview.valid.length}</strong> data valid
                {importPreview.duplicateNims.length > 0
                  ? ` · ${importPreview.duplicateNims.length} NIM ganda digabung`
                  : ''}
                {importPreview.skippedRows > 0
                  ? ` · ${importPreview.skippedRows} baris dilewati`
                  : ''}
              </p>

              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200/90 divide-y divide-slate-100 text-xs">
                {importPreview.valid.slice(0, 30).map((row) => (
                  <div key={row.nim} className="px-3.5 py-2.5 flex justify-between gap-2">
                    <span className="font-mono text-slate-500">{row.nim}</span>
                    <span className="font-semibold text-slate-900 truncate">{row.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setImportOpen(false)}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm transition"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={!importPreview || saving}
              onClick={handleConfirmImport}
              className="flex-1 min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Impor {importPreview ? `(${importPreview.valid.length})` : ''}
            </button>
          </div>
        </div>
      </Modal>

      {resyncOpen && cls?.externalClassId && (
        <Suspense fallback={null}>
          <IclabsSyncModal
            open={resyncOpen}
            onClose={() => setResyncOpen(false)}
            onSynced={() => void loadAll()}
            presetClass={{
              externalClassId: cls.externalClassId,
              title: cls.title,
              courseCode: cls.courseCode,
              groupName: cls.groupName,
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
