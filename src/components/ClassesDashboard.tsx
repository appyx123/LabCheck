import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronRight,
  CloudDownload,
  Edit3,
  Layers,
  Loader2,
  LogOut,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import type { ClassItem, User } from '../types';
import { Modal } from './Modal';
import { IclabsSyncModal } from './IclabsSyncModal';

interface ClassesDashboardProps {
  user: User;
  onLogout: () => void;
  onOpenClass: (classId: string) => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'A';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ClassesDashboard({ user, onLogout, onOpenClass }: ClassesDashboardProps) {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [descInput, setDescInput] = useState('');
  const [saving, setSaving] = useState(false);

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClassItem | null>(null);
  const [iclabsOpen, setIclabsOpen] = useState(false);

  async function loadClasses() {
    setError('');
    try {
      const res = await api.getClasses();
      setClasses(res.classes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar kelas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClasses();
  }, []);

  const stats = useMemo(() => {
    let totalStudents = 0;
    let totalModules = 0;
    for (const c of classes) {
      totalStudents += c.studentCount;
      totalModules += c.moduleCount;
    }
    return { totalClasses: classes.length, totalStudents, totalModules };
  }, [classes]);

  const filteredClasses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return classes;
    return classes.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q) ||
        (c.courseCode || '').toLowerCase().includes(q) ||
        (c.groupName || '').toLowerCase().includes(q)
    );
  }, [classes, searchQuery]);

  function openCreate() {
    setEditingClass(null);
    setTitleInput('');
    setDescInput('');
    setCreateOpen(true);
  }

  function openEdit(cls: ClassItem) {
    setMenuOpenId(null);
    setEditingClass(cls);
    setTitleInput(cls.title);
    setDescInput(cls.description || '');
    setCreateOpen(true);
  }

  async function handleSaveClass(e: FormEvent) {
    e.preventDefault();
    if (!titleInput.trim()) return;
    setSaving(true);
    try {
      if (editingClass) {
        await api.updateClass(editingClass.id, {
          title: titleInput.trim(),
          description: descInput.trim() || null,
        });
      } else {
        await api.createClass({
          title: titleInput.trim(),
          description: descInput.trim() || undefined,
        });
      }
      setCreateOpen(false);
      await loadClasses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan kelas.');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await api.deleteClass(deleteTarget.id);
      setDeleteTarget(null);
      await loadClasses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus kelas.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[#F6F7F9] flex flex-col">
      {/* Click-outside backdrop for open overflow menu */}
      {menuOpenId && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setMenuOpenId(null)}
          aria-hidden="true"
        />
      )}

      {/* Refined Sticky Top Bar */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-slate-200/80 safe-top">
        <div className="max-w-5xl mx-auto px-4 h-15 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-900 to-indigo-900 text-white inline-flex items-center justify-center shadow-xs shrink-0">
              <Check className="w-4 h-4 stroke-[2.75]" />
            </span>
            <span className="font-bold tracking-tight text-slate-900 text-base">LabCheck</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/70 text-xs font-bold inline-flex items-center justify-center shrink-0">
                {getInitials(user.name)}
              </span>
              <span className="text-xs font-medium text-slate-700 truncate hidden sm:inline max-w-[160px]">
                {user.name}
              </span>
            </div>

            <button
              type="button"
              onClick={onLogout}
              title="Keluar dari akun"
              className="min-h-[40px] px-2.5 sm:px-3 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 inline-flex items-center gap-1.5 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 sm:py-8 pb-16 space-y-6">
        {/* Hero Heading + Primary Actions */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
              Dashboard Asisten
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">
              Kelas Praktikum
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Halo, <span className="font-medium text-slate-700">{user.name}</span>. Pilih kelas
              untuk mulai mencatat tugas.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setIclabsOpen(true)}
              className="min-h-[44px] px-4 rounded-xl bg-white border border-slate-200/90 hover:border-indigo-300 hover:bg-indigo-50/40 text-slate-800 font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-2xs transition"
            >
              <CloudDownload className="w-4 h-4 text-indigo-600" />
              Sync ICLabs
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white font-semibold text-sm inline-flex items-center justify-center gap-1.5 shadow-sm shadow-slate-900/15 transition"
            >
              <Plus className="w-4 h-4" />
              Kelas Baru
            </button>
          </div>
        </div>

        {/* Overview Strip (visible when classes exist) */}
        {!loading && classes.length > 0 && (
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            <div className="surface-card rounded-2xl px-3.5 py-3 sm:px-4 sm:py-3.5 flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 hidden sm:inline-flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] sm:text-xs font-medium text-slate-500">Total Kelas</p>
                <p className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums leading-tight mt-0.5">
                  {stats.totalClasses}
                </p>
              </div>
            </div>
            <div className="surface-card rounded-2xl px-3.5 py-3 sm:px-4 sm:py-3.5 flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 hidden sm:inline-flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] sm:text-xs font-medium text-slate-500">Praktikan</p>
                <p className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums leading-tight mt-0.5">
                  {stats.totalStudents}
                </p>
              </div>
            </div>
            <div className="surface-card rounded-2xl px-3.5 py-3 sm:px-4 sm:py-3.5 flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 hidden sm:inline-flex items-center justify-center shrink-0">
                <Layers className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] sm:text-xs font-medium text-slate-500">Total Modul</p>
                <p className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums leading-tight mt-0.5">
                  {stats.totalModules}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Quick Search (shown when 4+ classes) */}
        {!loading && classes.length >= 4 && (
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama kelas, kode mata kuliah, atau kelompok..."
              className="w-full min-h-[44px] pl-10 pr-11 rounded-xl border border-slate-200/90 bg-white text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Hapus pencarian"
                className="min-h-[44px] min-w-[44px] absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center text-slate-400 hover:text-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200/80 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="surface-card rounded-2xl p-5 animate-pulse space-y-3"
              >
                <div className="h-5 w-24 rounded-full bg-slate-100" />
                <div className="h-5 w-3/4 rounded-lg bg-slate-100" />
                <div className="h-4 w-1/2 rounded-lg bg-slate-100" />
                <div className="pt-3 border-t border-slate-100 flex gap-4">
                  <div className="h-4 w-20 rounded bg-slate-100" />
                  <div className="h-4 w-16 rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : classes.length === 0 ? (
          <div className="surface-card rounded-2xl p-8 sm:p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 inline-flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-6 h-6" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">Belum ada kelas praktikum</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
              Mulai dengan menarik daftar kelas & peserta otomatis dari ICLabs, atau buat kelas
              secara manual.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setIclabsOpen(true)}
                className="w-full sm:w-auto min-h-[44px] px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-sm shadow-indigo-600/20 transition"
              >
                <CloudDownload className="w-4 h-4" />
                Sync dari ICLabs
              </button>
              <button
                type="button"
                onClick={openCreate}
                className="w-full sm:w-auto min-h-[44px] px-4 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 font-semibold text-sm inline-flex items-center justify-center gap-1.5 transition"
              >
                <Plus className="w-4 h-4" />
                Buat Kelas Manual
              </button>
            </div>
          </div>
        ) : filteredClasses.length === 0 ? (
          <div className="surface-card rounded-2xl p-8 text-center">
            <p className="text-sm font-medium text-slate-700">
              Tidak ada kelas yang cocok dengan "{searchQuery}".
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-2.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Reset pencarian
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredClasses.map((cls) => {
              const isIclabs = cls.source === 'iclabs';
              return (
                <div
                  key={cls.id}
                  className="relative surface-card surface-card-hover rounded-2xl group flex flex-col"
                >
                  <button
                    type="button"
                    onClick={() => onOpenClass(cls.id)}
                    className="text-left p-5 pr-14 flex-1 flex flex-col w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-2xl"
                  >
                    {/* Badges Row */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                          isIclabs
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/70'
                            : 'bg-slate-100 text-slate-600 border border-slate-200/70'
                        }`}
                      >
                        {isIclabs ? 'ICLabs' : 'Manual'}
                      </span>
                      {cls.courseCode && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-slate-50 text-slate-600 border border-slate-200/70">
                          {cls.courseCode}
                        </span>
                      )}
                      {cls.groupName && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-50 text-slate-600 border border-slate-200/70">
                          {cls.groupName}
                        </span>
                      )}
                    </div>

                    <h2 className="font-semibold text-base text-slate-900 leading-snug group-hover:text-indigo-950 transition">
                      {cls.title}
                    </h2>

                    {cls.description && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-1 leading-relaxed">
                        {cls.description}
                      </p>
                    )}

                    {/* Bottom Meta Row */}
                    <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-2 w-full">
                      <div className="flex items-center gap-3.5 text-xs text-slate-500 tabular-nums">
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          <strong className="font-semibold text-slate-700">
                            {cls.studentCount}
                          </strong>{' '}
                          praktikan
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-slate-400" />
                          <strong className="font-semibold text-slate-700">
                            {cls.moduleCount}
                          </strong>{' '}
                          modul
                        </span>
                      </div>

                      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-indigo-600 opacity-80 group-hover:opacity-100 group-hover:translate-x-0.5 transition">
                        Buka
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </button>

                  {/* Overflow menu (Touch Safety >= 44px) */}
                  <div className="absolute top-3 right-3 z-20">
                    <button
                      type="button"
                      aria-label="Menu kelas"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === cls.id ? null : cls.id);
                      }}
                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {menuOpenId === cls.id && (
                      <div className="absolute right-0 mt-1 w-44 rounded-xl bg-white shadow-xl shadow-slate-900/10 ring-1 ring-slate-200/80 py-1.5 z-30 animate-fade-in">
                        <button
                          type="button"
                          onClick={() => openEdit(cls)}
                          className="w-full min-h-[42px] px-3.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition"
                        >
                          <Edit3 className="w-4 h-4 text-slate-400" />
                          Edit Kelas
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpenId(null);
                            setDeleteTarget(cls);
                          }}
                          className="w-full min-h-[42px] px-3.5 text-left text-sm font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                          Hapus Kelas
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal Create/Edit Class */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={editingClass ? 'Edit Kelas' : 'Kelas Baru'}
        subtitle={
          editingClass
            ? 'Perbarui nama atau catatan kelas praktikum.'
            : 'Buat kelas baru untuk mulai menambahkan modul & praktikan.'
        }
      >
        <form onSubmit={handleSaveClass} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Nama Kelas
            </label>
            <input
              type="text"
              required
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="Mis. Jaringan Komputer — Kelas A"
              className="w-full min-h-[46px] px-3.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Catatan <span className="text-slate-400 font-normal">(opsional)</span>
            </label>
            <textarea
              rows={2}
              value={descInput}
              onChange={(e) => setDescInput(e.target.value)}
              placeholder="Jadwal, ruangan lab, atau keterangan lain"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
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
              {editingClass ? 'Simpan Perubahan' : 'Buat Kelas'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Hapus kelas ini?"
        subtitle="Seluruh praktikan, modul, dan nilai di dalamnya akan ikut terhapus secara permanen."
      >
        <div className="space-y-4">
          <p className="text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-200/90 rounded-xl px-4 py-3">
            {deleteTarget?.title}
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm transition"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleConfirmDelete}
              className="flex-1 min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Ya, Hapus Kelas
            </button>
          </div>
        </div>
      </Modal>

      <IclabsSyncModal
        open={iclabsOpen}
        onClose={() => setIclabsOpen(false)}
        onSynced={loadClasses}
      />
    </div>
  );
}
