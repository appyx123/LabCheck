import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Check,
  CheckCheck,
  RotateCcw,
  Search,
  Sun,
  WifiOff,
  X,
} from 'lucide-react';
import { api, isAbortError } from '../lib/api';
import { formatModuleDate } from '../lib/date';
import type { BoardData, StudentItem } from '../types';

type FilterMode = 'all' | 'incomplete' | 'complete';

type StudentOp =
  | { kind: 'toggle'; taskNumber: number; completed: boolean }
  | { kind: 'all'; completed: boolean };

interface StudentQueue {
  running: boolean;
  ops: StudentOp[];
}

interface BoardChecklistProps {
  moduleId: string;
  onBackToClass: (classId: string) => void;
  onOpenRecap: (moduleId: string) => void;
}

const EMPTY_SET: ReadonlySet<number> = new Set<number>();

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

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}

interface StudentItemViewProps {
  student: StudentItem;
  seatNo: number;
  doneSet: ReadonlySet<number>;
  taskNumbers: number[];
  taskCount: number;
  onToggle: (studentId: string, taskNumber: number) => void;
  onCompleteAll: (studentId: string, targetCompleted: boolean) => void;
}

const StudentBoardCard = memo(function StudentBoardCard({
  student: st,
  seatNo,
  doneSet,
  taskNumbers,
  taskCount,
  onToggle,
  onCompleteAll,
}: StudentItemViewProps) {
  const score = calcScore(doneSet.size, taskCount);
  const isAllDone = doneSet.size >= taskCount;
  const progressPct = taskCount > 0 ? Math.round((doneSet.size / taskCount) * 100) : 0;

  return (
    <div
      className={`rounded-2xl p-4 transition border ${
        isAllDone ? 'bg-emerald-50/35 border-emerald-200/90 shadow-2xs' : 'surface-card'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span
            title={`Nomor meja ${seatNo}`}
            aria-label={`Nomor meja ${seatNo}`}
            className={`min-w-[32px] h-8 px-1.5 rounded-xl text-xs font-mono font-bold inline-flex items-center justify-center shrink-0 tabular-nums mt-0.5 ${
              isAllDone ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {seatNo}
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-[15px] text-slate-900 leading-snug truncate">
              {st.name}
            </h3>
            <p className="text-xs font-mono text-slate-500 tabular-nums mt-0.5">{st.nim}</p>
          </div>
        </div>
        <span
          className={`px-2.5 py-1 rounded-xl text-base font-bold tabular-nums leading-none shrink-0 inline-flex items-center gap-1 ${
            isAllDone
              ? 'bg-emerald-600 text-white shadow-2xs shadow-emerald-600/20'
              : score > 0
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-500'
          }`}
        >
          {score}
        </span>
      </div>

      {/* Subtle per-card progress track */}
      <div className="h-1 rounded-full bg-slate-100 overflow-hidden my-3">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isAllDone ? 'bg-emerald-500' : 'bg-indigo-500'
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Large Touch Grid T1..Tn (min 48px height, generous gap) */}
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
        {taskNumbers.map((num) => {
          const checked = doneSet.has(num);
          return (
            <button
              key={num}
              type="button"
              onClick={() => onToggle(st.id, num)}
              aria-pressed={checked}
              aria-label={`${st.name} Tugas ${num}`}
              className={`min-h-[48px] min-w-[44px] rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-1 select-none active:scale-[0.95] transition tabular-nums border ${
                checked
                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs shadow-emerald-600/25'
                  : 'bg-slate-50/90 text-slate-700 border-slate-200/90 hover:border-indigo-300 hover:bg-indigo-50/40'
              }`}
            >
              {checked && <Check className="w-3.5 h-3.5 stroke-[2.75]" />}
              <span>T{num}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500 tabular-nums">
          {doneSet.size}/{taskCount} tugas selesai
        </span>
        <button
          type="button"
          onClick={() => onCompleteAll(st.id, !isAllDone)}
          className={`min-h-[38px] px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition ${
            isAllDone
              ? 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'
              : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100/80'
          }`}
        >
          {isAllDone ? (
            <>
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </>
          ) : (
            <>
              <CheckCheck className="w-3.5 h-3.5" />
              Tuntaskan
            </>
          )}
        </button>
      </div>
    </div>
  );
});

const StudentBoardRow = memo(function StudentBoardRow({
  student: st,
  seatNo,
  doneSet,
  taskNumbers,
  taskCount,
  onToggle,
  onCompleteAll,
}: StudentItemViewProps) {
  const score = calcScore(doneSet.size, taskCount);
  const isAllDone = doneSet.size >= taskCount;

  return (
    <tr
      className={`transition ${
        isAllDone ? 'bg-emerald-50/30 hover:bg-emerald-50/55' : 'hover:bg-slate-50/80'
      }`}
    >
      <td
        className="py-2.5 px-4 font-mono font-semibold text-slate-600 text-xs"
        title={`Nomor meja ${seatNo}`}
      >
        {seatNo}
      </td>
      <td className="py-2.5 px-3 font-mono text-xs text-slate-500">{st.nim}</td>
      <td className="py-2.5 px-3 font-semibold text-slate-900">{st.name}</td>
      {taskNumbers.map((num) => {
        const checked = doneSet.has(num);
        return (
          <td key={num} className="py-2 px-1 text-center">
            <button
              type="button"
              onClick={() => onToggle(st.id, num)}
              aria-pressed={checked}
              aria-label={`${st.name} Tugas ${num}`}
              className={`w-10 h-10 rounded-xl text-xs font-semibold inline-flex items-center justify-center transition active:scale-[0.94] border ${
                checked
                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs shadow-emerald-600/20'
                  : 'bg-slate-50 text-slate-500 border-slate-200/90 hover:border-indigo-300 hover:bg-indigo-50/40 hover:text-indigo-700'
              }`}
            >
              {checked ? <Check className="w-4 h-4 stroke-[2.75]" /> : num}
            </button>
          </td>
        );
      })}
      <td className="py-2.5 px-3 text-right">
        <span
          className={`inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded-lg text-xs font-bold ${
            isAllDone
              ? 'bg-emerald-100 text-emerald-800'
              : score > 0
                ? 'bg-slate-100 text-slate-900'
                : 'text-slate-400'
          }`}
        >
          {score}
        </span>
      </td>
      <td className="py-2.5 px-4 text-right">
        <button
          type="button"
          onClick={() => onCompleteAll(st.id, !isAllDone)}
          className={`min-h-[34px] px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition ${
            isAllDone
              ? 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'
              : 'text-emerald-700 hover:bg-emerald-50'
          }`}
        >
          {isAllDone ? 'Reset' : 'Tuntaskan'}
        </button>
      </td>
    </tr>
  );
});

export function BoardChecklist({
  moduleId,
  onBackToClass,
  onOpenRecap,
}: BoardChecklistProps) {
  const isDesktop = useIsDesktop();
  const [board, setBoard] = useState<BoardData | null>(null);
  const [completions, setCompletions] = useState<Record<string, Set<number>>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [pendingCount, setPendingCount] = useState(0);
  const [syncError, setSyncError] = useState('');
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Refs for race-free per-student serial queue & conditional polling
  const completionsRef = useRef<Record<string, Set<number>>>({});
  const boardRef = useRef<BoardData | null>(null);
  const queuesRef = useRef<Map<string, StudentQueue>>(new Map());
  const activeOpsRef = useRef(0);
  const mutationEpochRef = useRef(0);
  const etagRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const moduleIdRef = useRef(moduleId);

  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  useEffect(() => {
    completionsRef.current = completions;
  }, [completions]);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    moduleIdRef.current = moduleId;
  }, [moduleId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyBoardData = useCallback((data: BoardData, etag: string | null) => {
    etagRef.current = etag;
    boardRef.current = data;
    setBoard(data);
    const mapped: Record<string, Set<number>> = {};
    for (const st of data.students) {
      mapped[st.id] = new Set(data.completions[st.id] || []);
    }
    completionsRef.current = mapped;
    setCompletions(mapped);
  }, []);

  const loadBoard = useCallback(
    async (opts?: { silent?: boolean; signal?: AbortSignal }) => {
      if (!opts?.silent) setLoadError('');
      try {
        const res = await api.getBoard(moduleId, {
          etag: opts?.silent ? etagRef.current : null,
          signal: opts?.signal,
        });
        if (!mountedRef.current || moduleIdRef.current !== moduleId) return;
        if (!res.notModified) {
          applyBoardData(res.data, res.etag);
        }
      } catch (err) {
        if (isAbortError(err)) return;
        if (!opts?.silent) {
          setLoadError(err instanceof Error ? err.message : 'Gagal memuat board.');
        }
      } finally {
        if (!opts?.silent && mountedRef.current && moduleIdRef.current === moduleId) {
          setLoading(false);
        }
      }
    },
    [moduleId, applyBoardData]
  );

  // Initial load with AbortController so rapid module switching never applies stale responses
  useEffect(() => {
    const controller = new AbortController();
    etagRef.current = null;
    queuesRef.current.clear();
    activeOpsRef.current = 0;
    setPendingCount(0);
    setSyncError('');
    setLoading(true);
    void loadBoard({ signal: controller.signal });
    return () => controller.abort();
  }, [moduleId, loadBoard]);

  // Track browser online/offline state and resync immediately when back online
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      if (activeOpsRef.current === 0) {
        void loadBoard({ silent: true });
      }
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [loadBoard]);

  // Smart adaptive polling: OFF for solo classes (memberCount <= 1), ETag 304 + idle backoff for shared classes
  const memberCount = board?.class.memberCount ?? 1;
  useEffect(() => {
    let active = true;
    let timerId: number | null = null;
    let controller: AbortController | null = null;
    let unchangedStreak = 0;

    async function pollOnce() {
      if (!active || activeOpsRef.current > 0) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

      controller?.abort();
      controller = new AbortController();
      const epochBefore = mutationEpochRef.current;

      try {
        const res = await api.getBoard(moduleId, {
          etag: etagRef.current,
          signal: controller.signal,
        });
        if (!active || activeOpsRef.current > 0 || mutationEpochRef.current !== epochBefore) {
          return;
        }
        if (res.notModified) {
          unchangedStreak += 1;
        } else {
          unchangedStreak = 0;
          applyBoardData(res.data, res.etag);
        }
      } catch {
        // Silent retry on next tick; keep active checklist uninterrupted
      }
    }

    function scheduleNext() {
      if (!active || memberCount <= 1) return;
      // 5s while active; back off to 15s after ~1 minute without remote changes
      const delayMs = unchangedStreak >= 12 ? 15_000 : 5_000;
      timerId = window.setTimeout(async () => {
        await pollOnce();
        scheduleNext();
      }, delayMs);
    }

    if (memberCount > 1) {
      scheduleNext();
    }

    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        unchangedStreak = 0;
        void pollOnce();
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    return () => {
      active = false;
      if (timerId !== null) window.clearTimeout(timerId);
      controller?.abort();
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [moduleId, memberCount, applyBoardData]);

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

  const updatePendingBadge = useCallback(() => {
    let queued = 0;
    for (const q of queuesRef.current.values()) {
      queued += q.ops.length;
    }
    setPendingCount(activeOpsRef.current + queued);
  }, []);

  const drainStudentQueue = useCallback(
    async (studentId: string, targetModuleId: string) => {
      const queue = queuesRef.current.get(studentId);
      if (!queue || queue.running) return;
      queue.running = true;

      try {
        while (queue.ops.length > 0) {
          const op = queue.ops.shift()!;
          activeOpsRef.current += 1;
          updatePendingBadge();

          try {
            if (op.kind === 'toggle') {
              await api.toggleTask(targetModuleId, {
                studentId,
                taskNumber: op.taskNumber,
                completed: op.completed,
              });
            } else {
              await api.completeAllTasks(targetModuleId, {
                studentId,
                completed: op.completed,
              });
            }
            etagRef.current = null; // local write invalidated cached ETag
          } catch (err) {
            // Stop stale queued ops for this student and re-sync true server state
            queue.ops.length = 0;
            if (mountedRef.current && moduleIdRef.current === targetModuleId) {
              setSyncError(err instanceof Error ? err.message : 'Gagal menyimpan perubahan.');
              etagRef.current = null;
              void loadBoard({ silent: true });
            }
          } finally {
            activeOpsRef.current = Math.max(0, activeOpsRef.current - 1);
            updatePendingBadge();
          }
        }
      } finally {
        queue.running = false;
        if (queue.ops.length === 0) {
          queuesRef.current.delete(studentId);
        }
        updatePendingBadge();
      }
    },
    [loadBoard, updatePendingBadge]
  );

  const enqueueStudentOp = useCallback(
    (studentId: string, op: StudentOp) => {
      mutationEpochRef.current += 1;
      let queue = queuesRef.current.get(studentId);
      if (!queue) {
        queue = { running: false, ops: [] };
        queuesRef.current.set(studentId, queue);
      }

      if (op.kind === 'all') {
        // Supersedes any unsent per-task toggles for this student
        queue.ops = [op];
      } else {
        // Coalesce repeated taps on the same taskNumber after the last 'all' op
        let lastAllIdx = -1;
        for (let i = queue.ops.length - 1; i >= 0; i -= 1) {
          if (queue.ops[i].kind === 'all') {
            lastAllIdx = i;
            break;
          }
        }
        const existingIdx = queue.ops.findIndex(
          (item, idx) => idx > lastAllIdx && item.kind === 'toggle' && item.taskNumber === op.taskNumber
        );
        if (existingIdx >= 0) {
          queue.ops[existingIdx] = op;
        } else {
          queue.ops.push(op);
        }
      }

      updatePendingBadge();
      void drainStudentQueue(studentId, moduleIdRef.current);
    },
    [drainStudentQueue, updatePendingBadge]
  );

  const handleToggle = useCallback(
    (studentId: string, taskNumber: number) => {
      if (!boardRef.current) return;
      const currentSet = completionsRef.current[studentId] || EMPTY_SET;
      const nextCompleted = !currentSet.has(taskNumber);

      vibrateLight();
      setSyncError('');
      setCompletions((prev) => {
        const nextSet = new Set(prev[studentId] || []);
        if (nextCompleted) nextSet.add(taskNumber);
        else nextSet.delete(taskNumber);
        const next = { ...prev, [studentId]: nextSet };
        completionsRef.current = next;
        return next;
      });

      enqueueStudentOp(studentId, { kind: 'toggle', taskNumber, completed: nextCompleted });
    },
    [enqueueStudentOp]
  );

  const handleCompleteAll = useCallback(
    (studentId: string, targetCompleted: boolean) => {
      const currentBoard = boardRef.current;
      if (!currentBoard) return;
      const allTasks = Array.from({ length: currentBoard.module.taskCount }, (_, i) => i + 1);

      vibrateLight();
      setSyncError('');
      setCompletions((prev) => {
        const next = {
          ...prev,
          [studentId]: targetCompleted ? new Set(allTasks) : new Set<number>(),
        };
        completionsRef.current = next;
        return next;
      });

      enqueueStudentOp(studentId, { kind: 'all', completed: targetCompleted });
    },
    [enqueueStudentOp]
  );

  const taskNumbers = useMemo(() => {
    if (!board) return [];
    return Array.from({ length: board.module.taskCount }, (_, i) => i + 1);
  }, [board]);

  const counts = useMemo(() => {
    if (!board) return { all: 0, incomplete: 0, complete: 0, avgScore: 0 };
    let complete = 0;
    let totalScore = 0;
    for (const st of board.students) {
      const done = completions[st.id]?.size ?? 0;
      if (done >= board.module.taskCount) complete += 1;
      totalScore += calcScore(done, board.module.taskCount);
    }
    const all = board.students.length;
    return {
      all,
      complete,
      incomplete: all - complete,
      avgScore: all > 0 ? Math.min(100, Math.ceil(totalScore / all - 1e-9)) : 0,
    };
  }, [board, completions]);

  const seatNumberById = useMemo(() => {
    const map = new Map<string, number>();
    if (!board) return map;
    board.students.forEach((st, idx) => {
      map.set(st.id, idx + 1);
    });
    return map;
  }, [board]);

  const visibleStudents = useMemo(() => {
    if (!board) return [];
    const q = query.trim().toLowerCase();
    return board.students.filter((st) => {
      const done = completions[st.id]?.size ?? 0;
      const isFull = done >= board.module.taskCount;
      if (filter === 'complete' && !isFull) return false;
      if (filter === 'incomplete' && isFull) return false;
      const seatNo = String(seatNumberById.get(st.id) ?? '');
      if (
        q &&
        seatNo !== q &&
        !st.nim.toLowerCase().includes(q) &&
        !st.name.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [board, completions, filter, query, seatNumberById]);

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#F6F7F9] flex flex-col">
        <div className="bg-white border-b border-slate-200/80 px-3 sm:px-4 py-3 safe-top">
          <div className="max-w-5xl mx-auto space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-1.5 w-1/2">
                <div className="h-3 w-36 rounded skeleton-shimmer" />
                <div className="h-5 w-52 rounded-lg skeleton-shimmer" />
              </div>
              <div className="flex gap-2">
                <div className="h-9 w-24 rounded-full skeleton-shimmer" />
                <div className="h-9 w-20 rounded-xl skeleton-shimmer" />
              </div>
            </div>
            <div className="h-1.5 w-full rounded-full skeleton-shimmer" />
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="h-11 flex-1 rounded-xl skeleton-shimmer" />
              <div className="h-11 w-full sm:w-64 rounded-xl skeleton-shimmer" />
            </div>
          </div>
        </div>
        <div className="max-w-5xl w-full mx-auto px-3 sm:px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="surface-card rounded-2xl p-4 space-y-3">
              <div className="flex justify-between gap-3">
                <div className="flex items-center gap-2.5 w-2/3">
                  <div className="w-8 h-8 rounded-xl skeleton-shimmer shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-4 w-3/4 rounded skeleton-shimmer" />
                    <div className="h-3 w-1/2 rounded skeleton-shimmer" />
                  </div>
                </div>
                <div className="h-7 w-11 rounded-xl skeleton-shimmer" />
              </div>
              <div className="h-1 w-full rounded-full skeleton-shimmer" />
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((t) => (
                  <div key={t} className="h-12 rounded-xl skeleton-shimmer" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (loadError || !board) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-[#F6F7F9] px-4 gap-3 text-center">
        <p className="text-sm font-medium text-slate-600">{loadError || 'Board tidak ditemukan.'}</p>
        <button
          type="button"
          onClick={() => void loadBoard()}
          className="min-h-[44px] px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  const completePct = counts.all > 0 ? Math.round((counts.complete / counts.all) * 100) : 0;

  return (
    <div className="min-h-dvh bg-[#F6F7F9] flex flex-col">
      {/* Sticky Board Header + Progress Ribbon + Search/Filter */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 safe-top">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 pt-2 pb-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                type="button"
                onClick={() => onBackToClass(board.class.id)}
                aria-label="Kembali ke kelas"
                className="min-h-[44px] min-w-[44px] -ml-1 inline-flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 shrink-0 transition"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500 truncate">
                  {board.class.title}
                  {board.module.moduleDate ? ` · ${formatModuleDate(board.module.moduleDate)}` : ''}
                </p>
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="font-bold text-sm sm:text-base text-slate-900 truncate leading-tight">
                    {board.module.title}
                  </h1>
                  <span className="hidden sm:inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-medium text-slate-600 tabular-nums shrink-0">
                    {board.module.taskCount} tugas · @{board.module.pointsPerTask}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Live Save / Offline Status Pill */}
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                  !isOnline
                    ? 'bg-slate-100 text-slate-600 border-slate-300'
                    : syncError
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : pendingCount > 0
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-emerald-50/80 text-emerald-700 border-emerald-200/70'
                }`}
                title={
                  !isOnline
                    ? 'Koneksi terputus'
                    : syncError || (pendingCount > 0 ? 'Menyimpan...' : 'Semua perubahan tersimpan')
                }
              >
                {!isOnline ? (
                  <WifiOff className="w-3.5 h-3.5 text-slate-500" />
                ) : (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      syncError
                        ? 'bg-rose-500'
                        : pendingCount > 0
                          ? 'bg-amber-500 animate-pulse'
                          : 'bg-emerald-500'
                    }`}
                  />
                )}
                <span className="hidden sm:inline">
                  {!isOnline
                    ? 'Offline'
                    : syncError
                      ? 'Gagal'
                      : pendingCount > 0
                        ? 'Menyimpan'
                        : 'Tersimpan'}
                </span>
              </span>

              {wakeLockSupported && (
                <button
                  type="button"
                  onClick={toggleWakeLock}
                  title={wakeLockActive ? 'Layar dijaga tetap menyala' : 'Jaga layar tetap menyala'}
                  aria-label="Toggle layar tetap menyala"
                  aria-pressed={wakeLockActive}
                  className={`min-h-[40px] px-2.5 inline-flex items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold transition ${
                    wakeLockActive
                      ? 'bg-amber-50 border-amber-300 text-amber-800 shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Sun className="w-4 h-4" />
                  <span className="hidden md:inline">
                    {wakeLockActive ? 'Layar Aktif' : 'Wake Lock'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onOpenRecap(board.module.id)}
                className="min-h-[40px] px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Rekap
              </button>
            </div>
          </div>

          {/* Compact Live Progress Bar */}
          {counts.all > 0 && (
            <div className="flex items-center gap-3 text-[11px] text-slate-500 tabular-nums">
              <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full transition-all duration-300"
                  style={{ width: `${completePct}%` }}
                />
              </div>
              <span className="shrink-0 font-medium">
                <strong className="text-emerald-700">{counts.complete}</strong>/{counts.all} tuntas
                <span className="text-slate-300 mx-1.5">·</span>
                Rata-rata <strong className="text-slate-800">{counts.avgScore}</strong>
              </span>
            </div>
          )}

          {/* Search + Filter Segmented Control */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari no. meja, NIM, atau nama praktikan..."
                className="w-full min-h-[44px] pl-10 pr-11 rounded-xl border border-slate-200/90 bg-slate-50/70 focus:bg-white text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Hapus pencarian"
                  className="min-h-[44px] min-w-[44px] absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center text-slate-400 hover:text-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <kbd className="hidden lg:inline-flex items-center justify-center px-1.5 h-5 text-[11px] font-mono text-slate-400 bg-white border border-slate-200 rounded absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  /
                </kbd>
              )}
            </div>

            <div className="grid grid-cols-3 sm:flex items-center bg-slate-100/90 p-1 rounded-xl gap-1 shrink-0">
              {(
                [
                  ['all', 'Semua', counts.all],
                  ['incomplete', 'Belum', counts.incomplete],
                  ['complete', 'Tuntas', counts.complete],
                ] as const
              ).map(([key, label, count]) => {
                const active = filter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`min-h-[36px] px-2.5 sm:px-3 rounded-lg text-xs font-semibold tabular-nums whitespace-nowrap inline-flex items-center justify-center gap-1.5 transition ${
                      active
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <span>{label}</span>
                    <span
                      className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                        active
                          ? key === 'complete'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-700'
                          : 'text-slate-400'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {syncError && (
            <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                {syncError}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSyncError('');
                  void loadBoard();
                }}
                className="font-semibold underline shrink-0"
              >
                Muat ulang
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Board Content (renders ONLY the active viewport layout -> 50% fewer DOM nodes) */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-4 py-4 pb-16">
        {board.students.length === 0 ? (
          <div className="surface-card rounded-2xl p-10 text-center">
            <p className="text-sm font-semibold text-slate-900">Belum ada praktikan di kelas ini</p>
            <p className="text-xs text-slate-500 mt-1">
              Tambahkan atau impor daftar praktikan dari halaman kelas terlebih dahulu.
            </p>
            <button
              type="button"
              onClick={() => onBackToClass(board.class.id)}
              className="mt-4 min-h-[42px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition"
            >
              Kembali ke Kelas
            </button>
          </div>
        ) : visibleStudents.length === 0 ? (
          <div className="surface-card rounded-2xl p-10 text-center space-y-2">
            <p className="text-sm font-medium text-slate-700">
              Tidak ada praktikan pada filter ini.
            </p>
            {(query || filter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              >
                Tampilkan semua praktikan
              </button>
            )}
          </div>
        ) : !isDesktop ? (
          /* MOBILE (1-col) & TABLET (2-col) */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {visibleStudents.map((st, idx) => (
              <StudentBoardCard
                key={st.id}
                student={st}
                seatNo={seatNumberById.get(st.id) ?? idx + 1}
                doneSet={completions[st.id] || EMPTY_SET}
                taskNumbers={taskNumbers}
                taskCount={board.module.taskCount}
                onToggle={handleToggle}
                onCompleteAll={handleCompleteAll}
              />
            ))}
          </div>
        ) : (
          /* DESKTOP (>= 1024px) High-Density Matrix */
          <div className="surface-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-200/80 text-left text-xs font-semibold text-slate-500">
                    <th className="py-3 px-4 w-12" title="Nomor Meja">
                      No
                    </th>
                    <th className="py-3 px-3 w-36">NIM</th>
                    <th className="py-3 px-3 min-w-[200px]">Nama Praktikan</th>
                    {taskNumbers.map((num) => (
                      <th key={num} className="py-3 px-1 text-center w-12">
                        T{num}
                      </th>
                    ))}
                    <th className="py-3 px-3 text-right w-20">Nilai</th>
                    <th className="py-3 px-4 text-right w-32">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {visibleStudents.map((st, idx) => (
                    <StudentBoardRow
                      key={st.id}
                      student={st}
                      seatNo={seatNumberById.get(st.id) ?? idx + 1}
                      doneSet={completions[st.id] || EMPTY_SET}
                      taskNumbers={taskNumbers}
                      taskCount={board.module.taskCount}
                      onToggle={handleToggle}
                      onCompleteAll={handleCompleteAll}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 tabular-nums">
              <span>
                Menampilkan <strong className="text-slate-700">{visibleStudents.length}</strong>{' '}
                dari {board.students.length} praktikan
              </span>
              <span>Tekan `/` untuk mencari · `Esc` untuk reset</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
