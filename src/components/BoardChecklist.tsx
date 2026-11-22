import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Loader2,
  Search,
  Sun,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import type { BoardData } from '../types';

type FilterMode = 'all' | 'incomplete' | 'complete';

interface BoardChecklistProps {
  moduleId: string;
  onBackToClass: (classId: string) => void;
  onOpenRecap: (moduleId: string) => void;
}

/** Pembulatan ke atas ke bilangan bulat 0..100 tanpa desimal */
function calcScore(doneCount: number, taskCount: number): number {
  if (taskCount <= 0 || doneCount <= 0) return 0;
  return Math.min(100, Math.ceil((Math.min(doneCount, taskCount) * 100) / taskCount - 1e-9));
}

function vibrateLight() {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(15);
    }
  } catch {
    // ignore
  }
}

export function BoardChecklist({
  moduleId,
  onBackToClass,
  onOpenRecap,
}: BoardChecklistProps) {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [completions, setCompletions] = useState<Record<string, Set<number>>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [pendingCount, setPendingCount] = useState(0);
  const [syncError, setSyncError] = useState('');
  const cellSeqRef = useRef<Record<string, number>>({});

  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  async function loadBoard() {
    setLoadError('');
    try {
      const data = await api.getBoard(moduleId);
      setBoard(data);
      const mapped: Record<string, Set<number>> = {};
      for (const st of data.students) {
        mapped[st.id] = new Set(data.completions[st.id] || []);
      }
      setCompletions(mapped);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Gagal memuat board.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    loadBoard();
  }, [moduleId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if (e.key === '/' && !isInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape' && query) {
        setQuery('');
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [query]);

  useEffect(() => {
    return () => {
      wakeLockRef.current?.release().catch(() => undefined);
    };
  }, []);

  async function toggleWakeLock() {
    if (!wakeLockSupported) return;
    if (wakeLockActive && wakeLockRef.current) {
      await wakeLockRef.current.release().catch(() => undefined);
      wakeLockRef.current = null;
      setWakeLockActive(false);
      return;
    }
    try {
      const nav = navigator as Navigator & {
        wakeLock?: {
          request: (
            type: 'screen'
          ) => Promise<{
            release: () => Promise<void>;
            addEventListener?: (e: string, cb: () => void) => void;
          }>;
        };
      };
      const sentinel = await nav.wakeLock?.request('screen');
      if (sentinel) {
        wakeLockRef.current = sentinel;
        setWakeLockActive(true);
        sentinel.addEventListener?.('release', () => setWakeLockActive(false));
      }
    } catch {
      setWakeLockActive(false);
    }
  }

  async function handleToggle(studentId: string, taskNumber: number) {
    if (!board) return;
    const currentSet = completions[studentId] || new Set<number>();
    const nextCompleted = !currentSet.has(taskNumber);
    const cellKey = `${studentId}:${taskNumber}`;
    const seq = (cellSeqRef.current[cellKey] || 0) + 1;
    cellSeqRef.current[cellKey] = seq;

    vibrateLight();
    setSyncError('');
    setCompletions((prev) => {
      const nextSet = new Set(prev[studentId] || []);
      if (nextCompleted) nextSet.add(taskNumber);
      else nextSet.delete(taskNumber);
      return { ...prev, [studentId]: nextSet };
    });

    setPendingCount((c) => c + 1);
    try {
      await api.toggleTask(moduleId, { studentId, taskNumber, completed: nextCompleted });
    } catch (err) {
      if (cellSeqRef.current[cellKey] === seq) {
        setCompletions((prev) => {
          const rollback = new Set(prev[studentId] || []);
          if (nextCompleted) rollback.delete(taskNumber);
          else rollback.add(taskNumber);
          return { ...prev, [studentId]: rollback };
        });
        setSyncError(err instanceof Error ? err.message : 'Gagal menyimpan perubahan.');
      }
    } finally {
      setPendingCount((c) => Math.max(0, c - 1));
    }
  }

  async function handleCompleteAll(studentId: string, targetCompleted: boolean) {
    if (!board) return;
    const prevSet = new Set(completions[studentId] || []);
    const allTasks = Array.from({ length: board.module.taskCount }, (_, i) => i + 1);

    vibrateLight();
    setSyncError('');
    setCompletions((prev) => ({
      ...prev,
      [studentId]: targetCompleted ? new Set(allTasks) : new Set(),
    }));

    setPendingCount((c) => c + 1);
    try {
      await api.completeAllTasks(moduleId, { studentId, completed: targetCompleted });
    } catch (err) {
      setCompletions((prev) => ({ ...prev, [studentId]: prevSet }));
      setSyncError(err instanceof Error ? err.message : 'Gagal menyimpan perubahan.');
    } finally {
      setPendingCount((c) => Math.max(0, c - 1));
    }
  }

  const taskNumbers = useMemo(() => {
    if (!board) return [];
    return Array.from({ length: board.module.taskCount }, (_, i) => i + 1);
  }, [board]);

  const counts = useMemo(() => {
    if (!board) return { all: 0, incomplete: 0, complete: 0 };
    let complete = 0;
    for (const st of board.students) {
      const done = completions[st.id]?.size ?? 0;
      if (done >= board.module.taskCount) complete += 1;
    }
    return {
      all: board.students.length,
      complete,
      incomplete: board.students.length - complete,
    };
  }, [board, completions]);

  const visibleStudents = useMemo(() => {
    if (!board) return [];
    const q = query.trim().toLowerCase();
    return board.students.filter((st) => {
      const done = completions[st.id]?.size ?? 0;
      const isFull = done >= board.module.taskCount;
      if (filter === 'complete' && !isFull) return false;
      if (filter === 'incomplete' && isFull) return false;
      if (q && !st.nim.toLowerCase().includes(q) && !st.name.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [board, completions, filter, query]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#fafafa]">
        <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (loadError || !board) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-[#fafafa] px-4 gap-3">
        <p className="text-sm text-neutral-600">{loadError || 'Board tidak ditemukan.'}</p>
        <button
          type="button"
          onClick={loadBoard}
          className="min-h-[44px] px-4 rounded-lg bg-neutral-900 text-white text-sm font-medium"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#fafafa] flex flex-col">
      {/* Sticky Minimal Header + Search + Filter */}
      <div className="sticky top-0 z-30 bg-[#fafafa]/95 backdrop-blur border-b border-neutral-200/80 safe-top">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 pt-2 pb-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                type="button"
                onClick={() => onBackToClass(board.class.id)}
                aria-label="Kembali"
                className="min-h-[44px] min-w-[44px] -ml-1 inline-flex items-center justify-center rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <p className="text-[11px] text-neutral-500 truncate">{board.class.title}</p>
                <h1 className="font-semibold text-sm sm:text-base text-neutral-900 truncate leading-tight">
                  {board.module.title}
                  <span className="font-normal text-xs text-neutral-400 ml-1.5 tabular-nums">
                    {board.module.taskCount} tugas · @{board.module.pointsPerTask}
                  </span>
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className="inline-flex items-center gap-1.5 px-2 text-xs text-neutral-500"
                title={syncError || (pendingCount > 0 ? 'Menyimpan...' : 'Tersimpan')}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    syncError
                      ? 'bg-red-500'
                      : pendingCount > 0
                        ? 'bg-amber-500 animate-pulse'
                        : 'bg-emerald-600'
                  }`}
                />
                <span className="hidden sm:inline">
                  {syncError ? 'Gagal' : pendingCount > 0 ? 'Menyimpan' : 'Tersimpan'}
                </span>
              </span>

              {wakeLockSupported && (
                <button
                  type="button"
                  onClick={toggleWakeLock}
                  title="Jaga layar tetap menyala"
                  aria-label="Toggle layar tetap menyala"
                  className={`min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg border transition ${
                    wakeLockActive
                      ? 'bg-neutral-900 border-neutral-900 text-white'
                      : 'bg-white border-neutral-200 text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  <Sun className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => onOpenRecap(board.module.id)}
                className="min-h-[40px] px-3 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-800 text-xs font-medium transition"
              >
                Rekap
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari NIM atau nama..."
                className="w-full min-h-[44px] pl-9 pr-11 rounded-lg border border-neutral-300 bg-white text-base text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Hapus pencarian"
                  className="min-h-[44px] min-w-[44px] absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center text-neutral-400 hover:text-neutral-900"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 sm:flex items-center bg-neutral-100 p-1 rounded-lg gap-1 shrink-0">
              {(
                [
                  ['all', `Semua ${counts.all}`],
                  ['incomplete', `Belum ${counts.incomplete}`],
                  ['complete', `Tuntas ${counts.complete}`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`min-h-[36px] px-2.5 rounded-md text-xs font-medium tabular-nums whitespace-nowrap transition ${
                    filter === key
                      ? 'bg-white text-neutral-900 shadow-2xs'
                      : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {syncError && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between gap-2">
              <span>{syncError}</span>
              <button
                type="button"
                onClick={() => {
                  setSyncError('');
                  loadBoard();
                }}
                className="font-medium underline shrink-0"
              >
                Muat ulang
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Board Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-4 py-4 pb-16">
        {board.students.length === 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200/90 p-8 text-center">
            <p className="text-sm font-medium text-neutral-900">Belum ada praktikan</p>
            <button
              type="button"
              onClick={() => onBackToClass(board.class.id)}
              className="mt-3 text-xs font-medium text-neutral-900 underline underline-offset-4"
            >
              Kembali ke kelas
            </button>
          </div>
        ) : visibleStudents.length === 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200/90 p-8 text-center text-xs text-neutral-500">
            Tidak ada praktikan yang cocok.
          </div>
        ) : (
          <>
            {/* MOBILE (1-col) & TABLET (2-col) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:hidden">
              {visibleStudents.map((st) => {
                const doneSet = completions[st.id] || new Set<number>();
                const score = calcScore(doneSet.size, board.module.taskCount);
                const isAllDone = doneSet.size >= board.module.taskCount;

                return (
                  <div
                    key={st.id}
                    className="bg-white rounded-xl border border-neutral-200/90 p-3.5"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <h3 className="font-medium text-sm text-neutral-900 leading-snug truncate">
                          {st.name}
                        </h3>
                        <p className="text-xs font-mono text-neutral-500 tabular-nums">{st.nim}</p>
                      </div>
                      <span
                        className={`text-lg font-semibold tabular-nums leading-none shrink-0 ${
                          isAllDone ? 'text-emerald-700' : 'text-neutral-900'
                        }`}
                      >
                        {score}
                      </span>
                    </div>

                    {/* Large Touch Grid T1..Tn (min 48x48px, gap-2 = 8px) */}
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                      {taskNumbers.map((num) => {
                        const checked = doneSet.has(num);
                        return (
                          <button
                            key={num}
                            type="button"
                            onClick={() => handleToggle(st.id, num)}
                            aria-pressed={checked}
                            aria-label={`${st.name} Tugas ${num}`}
                            className={`min-h-[48px] min-w-[44px] rounded-lg font-medium text-sm inline-flex items-center justify-center gap-1 select-none active:scale-95 transition tabular-nums ${
                              checked
                                ? 'bg-emerald-700 text-white'
                                : 'bg-neutral-50 text-neutral-700 border border-neutral-200 hover:border-neutral-400'
                            }`}
                          >
                            {checked && <Check className="w-3.5 h-3.5 stroke-[2.75]" />}
                            <span>T{num}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-neutral-100 flex items-center justify-between">
                      <span className="text-xs text-neutral-400 tabular-nums">
                        {doneSet.size}/{board.module.taskCount} selesai
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCompleteAll(st.id, !isAllDone)}
                        className="min-h-[36px] px-2.5 rounded-md text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition"
                      >
                        {isAllDone ? 'Reset' : 'Tuntaskan semua'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DESKTOP (>= 1024px) High-Density Matrix */}
            <div className="hidden lg:block bg-white rounded-xl border border-neutral-200/90 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs font-medium text-neutral-500">
                    <th className="py-2.5 px-3 w-10">#</th>
                    <th className="py-2.5 px-3 w-36">NIM</th>
                    <th className="py-2.5 px-3 min-w-[200px]">Nama</th>
                    {taskNumbers.map((num) => (
                      <th key={num} className="py-2.5 px-1 text-center w-12">
                        T{num}
                      </th>
                    ))}
                    <th className="py-2.5 px-3 text-right w-16">Nilai</th>
                    <th className="py-2.5 px-3 text-right w-28">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 tabular-nums">
                  {visibleStudents.map((st, idx) => {
                    const doneSet = completions[st.id] || new Set<number>();
                    const score = calcScore(doneSet.size, board.module.taskCount);
                    const isAllDone = doneSet.size >= board.module.taskCount;

                    return (
                      <tr key={st.id} className="hover:bg-neutral-50/70">
                        <td className="py-2 px-3 text-neutral-400 text-xs">{idx + 1}</td>
                        <td className="py-2 px-3 font-mono text-xs text-neutral-600">{st.nim}</td>
                        <td className="py-2 px-3 font-medium text-neutral-900">{st.name}</td>
                        {taskNumbers.map((num) => {
                          const checked = doneSet.has(num);
                          return (
                            <td key={num} className="py-1.5 px-1 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggle(st.id, num)}
                                aria-pressed={checked}
                                className={`w-10 h-10 rounded-lg text-xs font-medium inline-flex items-center justify-center transition active:scale-95 ${
                                  checked
                                    ? 'bg-emerald-700 text-white'
                                    : 'bg-neutral-50 text-neutral-500 border border-neutral-200 hover:border-neutral-400'
                                }`}
                              >
                                {checked ? <Check className="w-4 h-4 stroke-[2.5]" /> : num}
                              </button>
                            </td>
                          );
                        })}
                        <td
                          className={`py-2 px-3 text-right font-semibold ${
                            isAllDone ? 'text-emerald-700' : 'text-neutral-900'
                          }`}
                        >
                          {score}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleCompleteAll(st.id, !isAllDone)}
                            className="min-h-[36px] px-2.5 rounded-md text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition"
                          >
                            {isAllDone ? 'Reset' : 'Tuntaskan'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
