import { useEffect, useState, type FormEvent } from 'react';
import {
  Check,
  CloudDownload,
  Edit3,
  Loader2,
  MoreHorizontal,
  Plus,
  Trash2,
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

export function ClassesDashboard({ user, onLogout, onOpenClass }: ClassesDashboardProps) {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    <div className="min-h-dvh bg-[#fafafa] flex flex-col">
      {/* Minimal Top Bar */}
      <header className="sticky top-0 z-30 bg-[#fafafa]/90 backdrop-blur border-b border-neutral-200/80 safe-top">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 rounded-md bg-neutral-900 text-white inline-flex items-center justify-center shrink-0">
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            </span>
            <span className="font-semibold tracking-tight text-neutral-900">LabCheck</span>
          </div>

          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs text-neutral-500 truncate hidden sm:inline">{user.name}</span>
            <button
              type="button"
              onClick={onLogout}
              className="min-h-[44px] px-2 text-xs font-medium text-neutral-600 hover:text-neutral-900 transition"
            >
              Keluar
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 pb-14 space-y-6">
        {/* Heading + Clean Actions */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Kelas</h1>
            <p className="text-sm text-neutral-500 mt-0.5">{user.name}</p>
          </div>

          <div className="grid grid-cols-2 sm:flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIclabsOpen(true)}
              className="min-h-[44px] px-3.5 rounded-lg bg-white border border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50 text-neutral-800 font-medium text-sm inline-flex items-center justify-center gap-1.5 transition"
            >
              <CloudDownload className="w-4 h-4 text-neutral-500" />
              Sync ICLabs
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="min-h-[44px] px-3.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-sm inline-flex items-center justify-center gap-1.5 transition"
            >
              <Plus className="w-4 h-4" />
              Kelas Baru
            </button>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">
            {error}
          </p>
        )}

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
          </div>
        ) : classes.length === 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200/90 p-10 text-center">
            <p className="text-sm font-medium text-neutral-900">Belum ada kelas</p>
            <p className="text-xs text-neutral-500 mt-1">
              Tarik daftar kelas dari ICLabs atau buat kelas manual.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {classes.map((cls) => (
              <div
                key={cls.id}
                className="relative bg-white rounded-xl border border-neutral-200/90 hover:border-neutral-400 transition group"
              >
                <div className="p-4 pr-12">
                  <button
                    type="button"
                    onClick={() => onOpenClass(cls.id)}
                    className="text-left block w-full"
                  >
                    <p className="text-[11px] font-mono text-neutral-400 uppercase tracking-wide">
                      {cls.source === 'iclabs' ? 'ICLabs' : 'Manual'}
                      {cls.courseCode ? ` · ${cls.courseCode}` : ''}
                      {cls.groupName ? ` · ${cls.groupName}` : ''}
                    </p>
                    <h2 className="font-semibold text-base text-neutral-900 mt-1 leading-snug group-hover:text-black">
                      {cls.title}
                    </h2>
                    {cls.description && (
                      <p className="text-xs text-neutral-500 mt-1 line-clamp-1">
                        {cls.description}
                      </p>
                    )}
                    <p className="text-xs text-neutral-500 mt-3 tabular-nums">
                      {cls.studentCount} praktikan · {cls.moduleCount} modul
                    </p>
                  </button>
                </div>

                {/* Overflow menu (Touch Safety) */}
                <div className="absolute top-2 right-2">
                  <button
                    type="button"
                    aria-label="Menu kelas"
                    onClick={() => setMenuOpenId(menuOpenId === cls.id ? null : cls.id)}
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {menuOpenId === cls.id && (
                    <div className="absolute right-0 mt-1 w-40 rounded-lg bg-white shadow-lg border border-neutral-200 py-1 z-20">
                      <button
                        type="button"
                        onClick={() => openEdit(cls)}
                        className="w-full min-h-[42px] px-3 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-neutral-400" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpenId(null);
                          setDeleteTarget(cls);
                        }}
                        className="w-full min-h-[42px] px-3 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Hapus
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal Create/Edit Class */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={editingClass ? 'Edit Kelas' : 'Kelas Baru'}
      >
        <form onSubmit={handleSaveClass} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1.5">
              Nama Kelas
            </label>
            <input
              type="text"
              required
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="Mis. Jaringan Komputer — Kelas A"
              className="w-full min-h-[44px] px-3 rounded-lg border border-neutral-300 text-base focus:outline-none focus:border-neutral-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1.5">
              Catatan <span className="text-neutral-400 font-normal">(opsional)</span>
            </label>
            <textarea
              rows={2}
              value={descInput}
              onChange={(e) => setDescInput(e.target.value)}
              placeholder="Jadwal atau ruangan"
              className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 text-base focus:outline-none focus:border-neutral-900"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="min-h-[44px] px-4 rounded-lg border border-neutral-300 text-neutral-700 font-medium text-sm"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 min-h-[44px] px-4 rounded-lg bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white font-medium text-sm inline-flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingClass ? 'Simpan' : 'Buat Kelas'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Hapus kelas ini?"
        subtitle="Seluruh praktikan, modul, dan nilai di dalamnya akan ikut terhapus."
      >
        <div className="space-y-4">
          <p className="text-sm font-medium text-neutral-900 bg-neutral-50 border border-neutral-200 rounded-lg px-3.5 py-2.5">
            {deleteTarget?.title}
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="min-h-[44px] px-4 rounded-lg border border-neutral-300 text-neutral-700 font-medium text-sm"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleConfirmDelete}
              className="flex-1 min-h-[44px] px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-sm inline-flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Hapus
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
