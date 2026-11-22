import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ArrowLeft,
  BarChart3,
  CloudDownload,
  Download,
  Edit3,
  FileSpreadsheet,
  Layers,
  Loader2,
  MoreHorizontal,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  exportClassRecap,
  parseStudentsFile,
  type StudentImportPreview,
} from '../lib/spreadsheet';
import type { ClassItem, ClassRecapData, ModuleItem, StudentItem } from '../types';
import { Modal } from './Modal';
import { IclabsSyncModal } from './IclabsSyncModal';

type TabKey = 'modules' | 'students' | 'recap';

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

  async function loadAll() {
    setError('');
    try {
      const [clsRes, modRes, stuRes] = await Promise.all([
        api.getClass(classId),
        api.getModules(classId),
        api.getStudents(classId),
      ]);
      setCls(clsRes.class);
      setModules(modRes.modules);
      setStudents(stuRes.students);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data kelas.');
    } finally {
      setLoading(false);
    }
  }

  async function loadRecap() {
    try {
      const data = await api.getClassRecap(classId);
      setRecap(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat rekap kelas.');
    }
  }

  useEffect(() => {
    setLoading(true);
    loadAll();
  }, [classId]);

  useEffect(() => {
    if (tab === 'recap') {
      loadRecap();
    }
  }, [tab, classId]);

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) => s.nim.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    );
  }, [students, studentQuery]);

  function openCreateMod() {
    setEditingMod(null);
    setModTitle('');
    setModTaskCount(4);
    setModShrinkConfirm(false);
    setModModalOpen(true);
  }

  function openEditMod(m: ModuleItem) {
    setModMenuId(null);
    setEditingMod(m);
    setModTitle(m.title);
    setModTaskCount(m.taskCount);
    setModShrinkConfirm(false);
    setModModalOpen(true);
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
      if (editingMod) {
        await api.updateModule(editingMod.id, {
          title: modTitle.trim(),
          taskCount: modTaskCount,
        });
      } else {
        await api.createModule(classId, {
          title: modTitle.trim(),
          taskCount: modTaskCount,
        });
      }
      setModModalOpen(false);
      await loadAll();
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
      await loadAll();
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
    <div className="min-h-dvh bg-[#fafafa] flex flex-col">
      {/* Sticky Minimal Header */}
      <header className="sticky top-0 z-30 bg-[#fafafa]/90 backdrop-blur border-b border-neutral-200/80 safe-top no-print">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              onClick={onBack}
              aria-label="Kembali"
              className="min-h-[44px] min-w-[44px] -ml-1 inline-flex items-center justify-center rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="font-semibold text-neutral-900 truncate text-sm sm:text-base leading-tight">
                {cls?.title || 'Memuat...'}
              </h1>
              <p className="text-[11px] text-neutral-500 tabular-nums">
                {students.length} praktikan · {modules.length} modul
              </p>
            </div>
          </div>

          {/* Desktop / Tablet Underline Tabs */}
          <nav className="hidden md:flex items-center gap-1">
            {(
              [
                ['modules', 'Modul'],
                ['students', 'Praktikan'],
                ['recap', 'Rekap'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`min-h-[38px] px-3 rounded-lg text-sm font-medium transition ${
                  tab === key
                    ? 'bg-neutral-900 text-white'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-5 pb-24 md:pb-12 space-y-5">
        {error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 no-print">
            {error}
          </p>
        )}

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
          </div>
        ) : (
          <>
            {/* TAB: MODULES */}
            {tab === 'modules' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold text-neutral-900 text-base">Modul</h2>
                  <button
                    type="button"
                    onClick={openCreateMod}
                    className="min-h-[44px] px-3.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-sm inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Tambah Modul
                  </button>
                </div>

                {students.length === 0 && (
                  <div className="px-4 py-3 rounded-xl bg-white border border-neutral-200 flex items-center justify-between gap-3">
                    <p className="text-xs text-neutral-600">
                      Belum ada praktikan di kelas ini.
                    </p>
                    <button
                      type="button"
                      onClick={() => setTab('students')}
                      className="text-xs font-medium text-neutral-900 underline underline-offset-4 shrink-0"
                    >
                      Tambah praktikan
                    </button>
                  </div>
                )}

                {modules.length === 0 ? (
                  <div className="bg-white rounded-xl border border-neutral-200/90 p-10 text-center">
                    <p className="text-sm font-medium text-neutral-900">Belum ada modul</p>
                    <p className="text-xs text-neutral-500 mt-1">
                      Tambahkan modul beserta jumlah tugasnya (1–30).
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {modules.map((m) => (
                      <div
                        key={m.id}
                        className="relative bg-white rounded-xl border border-neutral-200/90 hover:border-neutral-400 transition flex flex-col"
                      >
                        <div className="p-4 pr-12 flex-1">
                          <button
                            type="button"
                            onClick={() => onOpenBoard(m.id)}
                            className="text-left block w-full"
                          >
                            <h3 className="font-semibold text-neutral-900 text-base leading-snug">
                              {m.title}
                            </h3>
                            <p className="text-xs text-neutral-500 mt-1 tabular-nums">
                              {m.taskCount} tugas · bobot @{m.pointsPerTask}
                            </p>
                          </button>

                          <div className="mt-4 space-y-1.5">
                            <div className="flex items-center justify-between text-xs tabular-nums">
                              <span className="text-neutral-500">
                                Tuntas {m.completedAllCount ?? 0}/{m.studentCount ?? students.length}
                              </span>
                              <span className="font-medium text-neutral-900">
                                Rata-rata {m.averageScore ?? 0}
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                              <div
                                className="h-full bg-emerald-700 rounded-full transition-all"
                                style={{ width: `${Math.min(100, m.averageScore ?? 0)}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="absolute top-2 right-2">
                          <button
                            type="button"
                            aria-label="Aksi modul"
                            onClick={() => setModMenuId(modMenuId === m.id ? null : m.id)}
                            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                          {modMenuId === m.id && (
                            <div className="absolute right-0 mt-1 w-40 rounded-lg bg-white shadow-lg border border-neutral-200 py-1 z-20">
                              <button
                                type="button"
                                onClick={() => openEditMod(m)}
                                className="w-full min-h-[42px] px-3 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-neutral-400" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setModMenuId(null);
                                  setDeleteModTarget(m);
                                }}
                                className="w-full min-h-[42px] px-3 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Hapus
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 border-t border-neutral-100 divide-x divide-neutral-100 text-xs font-medium">
                          <button
                            type="button"
                            onClick={() => onOpenBoard(m.id)}
                            className="min-h-[44px] text-neutral-900 hover:bg-neutral-50 rounded-bl-xl transition"
                          >
                            Buka Board
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenModuleRecap(m.id)}
                            className="min-h-[44px] text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 rounded-br-xl transition"
                          >
                            Lihat Rekap
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB: STUDENTS */}
            {tab === 'students' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h2 className="font-semibold text-neutral-900 text-base tabular-nums">
                    Praktikan ({students.length})
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {cls?.source === 'iclabs' && cls.externalClassId && (
                      <button
                        type="button"
                        onClick={() => setResyncOpen(true)}
                        className="min-h-[44px] px-3 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-800 font-medium text-sm inline-flex items-center gap-1.5"
                      >
                        <CloudDownload className="w-4 h-4 text-neutral-500" />
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
                      className="min-h-[44px] px-3 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-800 font-medium text-sm inline-flex items-center gap-1.5"
                    >
                      <Upload className="w-4 h-4 text-neutral-500" />
                      Import
                    </button>
                    <button
                      type="button"
                      onClick={openAddStudent}
                      className="min-h-[44px] px-3.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-sm inline-flex items-center gap-1.5"
                    >
                      <UserPlus className="w-4 h-4" />
                      Tambah
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={studentQuery}
                    onChange={(e) => setStudentQuery(e.target.value)}
                    placeholder="Cari NIM atau nama..."
                    className="w-full min-h-[44px] pl-10 pr-11 rounded-lg border border-neutral-300 bg-white text-base focus:outline-none focus:border-neutral-900"
                  />
                  {studentQuery && (
                    <button
                      type="button"
                      onClick={() => setStudentQuery('')}
                      aria-label="Hapus pencarian"
                      className="min-h-[44px] min-w-[44px] absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center text-neutral-400 hover:text-neutral-900"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {filteredStudents.length === 0 ? (
                  <div className="bg-white rounded-xl border border-neutral-200/90 p-8 text-center text-xs text-neutral-500">
                    {students.length === 0
                      ? 'Belum ada praktikan. Import CSV/Excel atau tambah manual.'
                      : 'Tidak ada hasil yang cocok.'}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-neutral-200/90 divide-y divide-neutral-100 overflow-hidden">
                    {filteredStudents.map((st, idx) => (
                      <div
                        key={st.id}
                        className="px-4 py-2.5 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex items-baseline gap-3">
                          <span className="text-xs font-mono text-neutral-400 w-5 shrink-0 tabular-nums">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-neutral-900 truncate">
                              {st.name}
                            </p>
                            <p className="text-xs font-mono text-neutral-500 tabular-nums">
                              {st.nim}
                              {st.status && st.status !== 'AKTIF' ? ` · ${st.status}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditStudent(st)}
                            aria-label={`Edit ${st.name}`}
                            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteStudentTarget(st)}
                            aria-label={`Hapus ${st.name}`}
                            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB: CLASS RECAP */}
            {tab === 'recap' && (
              <div className="space-y-5">
                {!recap ? (
                  <div className="py-12 flex justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                  </div>
                ) : (
                  <>
                    <div className="hidden print-only mb-4 pb-3 border-b border-neutral-800">
                      <h1 className="text-base font-bold">
                        REKAP NILAI PRAKTIKUM — {recap.class.title}
                      </h1>
                      <p className="text-xs text-neutral-600 mt-1">
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
                      <h2 className="font-semibold text-neutral-900 text-base">Rekap Kelas</h2>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => exportClassRecap(recap, 'xlsx')}
                          className="min-h-[44px] px-3 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-800 font-medium text-sm inline-flex items-center gap-1.5"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-neutral-500" />
                          Excel
                        </button>
                        <button
                          type="button"
                          onClick={() => exportClassRecap(recap, 'csv')}
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

                    {/* Minimal KPI Strip */}
                    <div className="grid grid-cols-3 bg-white rounded-xl border border-neutral-200/90 divide-x divide-neutral-200/80 no-print">
                      <div className="p-3.5">
                        <p className="text-xs text-neutral-500">Rata-rata</p>
                        <p className="text-2xl font-semibold text-neutral-900 tabular-nums mt-0.5">
                          {recap.summary.classAverage}
                        </p>
                      </div>
                      <div className="p-3.5">
                        <p className="text-xs text-neutral-500">Praktikan</p>
                        <p className="text-2xl font-semibold text-neutral-900 tabular-nums mt-0.5">
                          {recap.summary.totalStudents}
                        </p>
                      </div>
                      <div className="p-3.5">
                        <p className="text-xs text-neutral-500">Modul</p>
                        <p className="text-2xl font-semibold text-neutral-900 tabular-nums mt-0.5">
                          {recap.summary.totalModules}
                        </p>
                      </div>
                    </div>

                    {/* Mobile List */}
                    <div className="bg-white rounded-xl border border-neutral-200/90 divide-y divide-neutral-100 md:hidden no-print">
                      {recap.students.map((st) => (
                        <div key={st.studentId} className="p-3.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium text-sm text-neutral-900 truncate">
                                {st.name}
                              </p>
                              <p className="text-xs font-mono text-neutral-500 tabular-nums">
                                {st.nim}
                              </p>
                            </div>
                            <span
                              className={`text-base font-semibold tabular-nums shrink-0 ${
                                st.finalScore >= 100 ? 'text-emerald-700' : 'text-neutral-900'
                              }`}
                            >
                              {st.finalScore}
                            </span>
                          </div>
                          {recap.modules.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500 tabular-nums">
                              {recap.modules.map((m, idx) => (
                                <span key={m.id}>
                                  M{idx + 1}{' '}
                                  <strong className="font-medium text-neutral-800">
                                    {st.scoresByModule[m.id] ?? 0}
                                  </strong>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Desktop + Print Table */}
                    <div className="hidden md:block print-only bg-white rounded-xl border border-neutral-200/90 overflow-x-auto">
                      <table className="w-full text-sm print-table">
                        <thead>
                          <tr className="border-b border-neutral-200 text-left text-xs font-medium text-neutral-500">
                            <th className="py-2.5 px-3 w-10">#</th>
                            <th className="py-2.5 px-3">NIM</th>
                            <th className="py-2.5 px-3">Nama</th>
                            {recap.modules.map((m, idx) => (
                              <th key={m.id} className="py-2.5 px-3 text-center">
                                M{idx + 1}
                              </th>
                            ))}
                            <th className="py-2.5 px-3 text-right">Akhir</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 tabular-nums">
                          {recap.students.map((st, idx) => (
                            <tr key={st.studentId} className="hover:bg-neutral-50/70">
                              <td className="py-2.5 px-3 text-neutral-400 text-xs">{idx + 1}</td>
                              <td className="py-2.5 px-3 font-mono text-xs text-neutral-600">
                                {st.nim}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-neutral-900">
                                {st.name}
                              </td>
                              {recap.modules.map((m) => (
                                <td key={m.id} className="py-2.5 px-3 text-center text-neutral-700">
                                  {st.scoresByModule[m.id] ?? 0}
                                </td>
                              ))}
                              <td className="py-2.5 px-3 text-right font-semibold text-neutral-900">
                                {st.finalScore}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Minimal Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-neutral-200 safe-bottom no-print">
        <div className="grid grid-cols-3">
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
                className={`min-h-[56px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition ${
                  active ? 'text-neutral-900' : 'text-neutral-400'
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
            <label className="block text-xs font-medium text-neutral-700 mb-1.5">
              Nama Modul
            </label>
            <input
              type="text"
              required
              value={modTitle}
              onChange={(e) => setModTitle(e.target.value)}
              placeholder="Mis. Modul 1: Subnetting"
              className="w-full min-h-[44px] px-3 rounded-lg border border-neutral-300 text-base focus:outline-none focus:border-neutral-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1.5">
              Jumlah Tugas (1–30)
            </label>
            <input
              type="number"
              required
              min={1}
              max={30}
              value={modTaskCount}
              onChange={(e) => {
                setModTaskCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)));
                setModShrinkConfirm(false);
              }}
              className="w-full min-h-[44px] px-3 rounded-lg border border-neutral-300 text-base tabular-nums focus:outline-none focus:border-neutral-900"
            />
            <p className="text-xs text-neutral-500 mt-1.5 tabular-nums">
              Bobot per tugas: <strong className="text-neutral-900">@{previewWeight}</strong> (bulat
              ke atas, maks. 100).
            </p>
          </div>

          {modShrinkConfirm && editingMod && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              Jumlah tugas diperkecil dari {editingMod.taskCount} menjadi {modTaskCount}. Ceklis di
              atas T{modTaskCount} akan dihapus. Tekan simpan lagi untuk konfirmasi.
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              type="button"
              onClick={() => setModModalOpen(false)}
              className="min-h-[44px] px-4 rounded-lg border border-neutral-300 text-neutral-700 font-medium text-sm"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 min-h-[44px] px-4 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-sm inline-flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {modShrinkConfirm ? 'Konfirmasi & Simpan' : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete Module */}
      <Modal
        open={Boolean(deleteModTarget)}
        onClose={() => setDeleteModTarget(null)}
        title="Hapus modul?"
        subtitle="Data ceklis pada modul ini akan ikut terhapus."
      >
        <div className="space-y-4">
          <p className="text-sm font-medium text-neutral-900 bg-neutral-50 border border-neutral-200 rounded-lg px-3.5 py-2.5">
            {deleteModTarget?.title}
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => setDeleteModTarget(null)}
              className="min-h-[44px] px-4 rounded-lg border border-neutral-300 text-neutral-700 font-medium text-sm"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleDeleteMod}
              className="flex-1 min-h-[44px] px-4 rounded-lg bg-red-600 text-white font-medium text-sm inline-flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Hapus
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
            <label className="block text-xs font-medium text-neutral-700 mb-1.5">NIM</label>
            <input
              type="text"
              required
              value={stuNim}
              onChange={(e) => setStuNim(e.target.value)}
              placeholder="13020230001"
              className="w-full min-h-[44px] px-3 rounded-lg border border-neutral-300 text-base font-mono focus:outline-none focus:border-neutral-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1.5">Nama</label>
            <input
              type="text"
              required
              value={stuName}
              onChange={(e) => setStuName(e.target.value)}
              placeholder="Nama lengkap"
              className="w-full min-h-[44px] px-3 rounded-lg border border-neutral-300 text-base focus:outline-none focus:border-neutral-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1.5">Status</label>
            <input
              type="text"
              value={stuStatus}
              onChange={(e) => setStuStatus(e.target.value)}
              placeholder="AKTIF"
              className="w-full min-h-[44px] px-3 rounded-lg border border-neutral-300 text-base focus:outline-none focus:border-neutral-900"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              type="button"
              onClick={() => setStudentModalOpen(false)}
              className="min-h-[44px] px-4 rounded-lg border border-neutral-300 text-neutral-700 font-medium text-sm"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 min-h-[44px] px-4 rounded-lg bg-neutral-900 text-white font-medium text-sm inline-flex items-center justify-center gap-2"
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
          <p className="text-sm font-medium text-neutral-900 bg-neutral-50 border border-neutral-200 rounded-lg px-3.5 py-2.5">
            {deleteStudentTarget?.name} ({deleteStudentTarget?.nim})
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => setDeleteStudentTarget(null)}
              className="min-h-[44px] px-4 rounded-lg border border-neutral-300 text-neutral-700 font-medium text-sm"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleDeleteStudent}
              className="flex-1 min-h-[44px] px-4 rounded-lg bg-red-600 text-white font-medium text-sm inline-flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Hapus
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Import CSV / Excel */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Praktikan"
        subtitle="Pilih file .csv atau .xlsx dengan kolom NIM dan Nama."
        maxWidthClass="sm:max-w-lg"
      >
        <div className="space-y-4">
          <label className="block w-full p-5 rounded-xl border border-dashed border-neutral-300 hover:border-neutral-500 bg-neutral-50 text-center cursor-pointer transition">
            <Upload className="w-5 h-5 text-neutral-500 mx-auto mb-1.5" />
            <span className="block text-sm font-medium text-neutral-800">
              {importFileName || 'Pilih file .csv atau .xlsx'}
            </span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFileSelect}
              className="sr-only"
            />
          </label>

          {importError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              {importError}
            </p>
          )}

          {importPreview && (
            <div className="space-y-2.5">
              <p className="text-xs text-neutral-600 tabular-nums">
                <strong>{importPreview.valid.length}</strong> data valid
                {importPreview.duplicateNims.length > 0
                  ? ` · ${importPreview.duplicateNims.length} NIM ganda digabung`
                  : ''}
                {importPreview.skippedRows > 0
                  ? ` · ${importPreview.skippedRows} baris dilewati`
                  : ''}
              </p>

              <div className="max-h-48 overflow-y-auto rounded-lg border border-neutral-200 divide-y divide-neutral-100 text-xs">
                {importPreview.valid.slice(0, 30).map((row) => (
                  <div key={row.nim} className="px-3 py-2 flex justify-between gap-2">
                    <span className="font-mono text-neutral-500">{row.nim}</span>
                    <span className="font-medium text-neutral-900 truncate">{row.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              type="button"
              onClick={() => setImportOpen(false)}
              className="min-h-[44px] px-4 rounded-lg border border-neutral-300 text-neutral-700 font-medium text-sm"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={!importPreview || saving}
              onClick={handleConfirmImport}
              className="flex-1 min-h-[44px] px-4 rounded-lg bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 text-white font-medium text-sm inline-flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Impor {importPreview ? `(${importPreview.valid.length})` : ''}
            </button>
          </div>
        </div>
      </Modal>

      {cls?.externalClassId && (
        <IclabsSyncModal
          open={resyncOpen}
          onClose={() => setResyncOpen(false)}
          onSynced={loadAll}
          presetClass={{
            externalClassId: cls.externalClassId,
            title: cls.title,
            courseCode: cls.courseCode,
            groupName: cls.groupName,
          }}
        />
      )}
    </div>
  );
}
