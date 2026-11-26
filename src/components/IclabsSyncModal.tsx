import { useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Modal } from './Modal';
import { api } from '../lib/api';
import type { IclabsPreviewClass, IclabsSyncResponse } from '../types';

interface IclabsSyncModalProps {
  open: boolean;
  onClose: () => void;
  onSynced: () => void;
  presetClass?: {
    externalClassId: string;
    title: string;
    courseCode?: string | null;
    groupName?: string | null;
  } | null;
}

const STEPS = [
  { key: 'credentials', label: 'Login' },
  { key: 'select', label: 'Pilih Kelas' },
  { key: 'done', label: 'Selesai' },
] as const;

const SYNC_CHUNK_SIZE = 5;

export function IclabsSyncModal({
  open,
  onClose,
  onSynced,
  presetClass = null,
}: IclabsSyncModalProps) {
  const [step, setStep] = useState<'credentials' | 'select' | 'done'>('credentials');
  const [identitas, setIdentitas] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [periode, setPeriode] = useState('');
  const [iclabsToken, setIclabsToken] = useState('');
  const [previewClasses, setPreviewClasses] = useState<IclabsPreviewClass[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [syncResult, setSyncResult] = useState<IclabsSyncResponse | null>(null);
  const [syncProgress, setSyncProgress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function resetAndClose() {
    setStep('credentials');
    setPassword('');
    setShowPassword(false);
    setIclabsToken('');
    setPreviewClasses([]);
    setSelectedIds(new Set());
    setSyncResult(null);
    setSyncProgress('');
    setError('');
    setLoading(false);
    onClose();
  }

  async function handleFetchPreview(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (presetClass) {
        const res = await api.iclabsSync({
          identitas,
          password,
          periode: periode.trim() || undefined,
          classes: [
            {
              externalClassId: presetClass.externalClassId,
              title: presetClass.title,
              courseCode: presetClass.courseCode || '',
              groupName: presetClass.groupName || '',
            },
          ],
        });
        setPassword('');
        setSyncResult(res);
        setStep('done');
        onSynced();
        return;
      }

      const res = await api.iclabsPreview({
        identitas,
        password,
        periode: periode.trim() || undefined,
      });
      setPassword('');
      setIclabsToken(res.iclabsToken);
      setPreviewClasses(res.classes);
      setSelectedIds(new Set(res.classes.map((c) => c.externalClassId)));
      setStep('select');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghubungi ICLabs.');
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(extId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(extId)) next.delete(extId);
      else next.add(extId);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === previewClasses.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(previewClasses.map((c) => c.externalClassId)));
    }
  }

  async function handleConfirmSync() {
    const chosen = previewClasses.filter((c) => selectedIds.has(c.externalClassId));
    if (chosen.length === 0) {
      setError('Pilih minimal satu kelas.');
      return;
    }
    setError('');
    setLoading(true);
    setSyncProgress('');
    try {
      const aggregated: IclabsSyncResponse = {
        summary: {
          classesCreated: 0,
          classesJoined: 0,
          classesUpdated: 0,
          studentsInserted: 0,
          studentsUpdated: 0,
        },
        syncedClasses: [],
      };

      for (let i = 0; i < chosen.length; i += SYNC_CHUNK_SIZE) {
        const chunk = chosen.slice(i, i + SYNC_CHUNK_SIZE);
        const doneSoFar = Math.min(i + chunk.length, chosen.length);
        if (chosen.length > SYNC_CHUNK_SIZE) {
          setSyncProgress(`Menyinkronkan ${doneSoFar}/${chosen.length} kelas...`);
        }
        const res = await api.iclabsSync({
          iclabsToken,
          classes: chunk.map((c) => ({
            externalClassId: c.externalClassId,
            title: c.localTitle || c.suggestedTitle,
            courseCode: c.courseCode,
            groupName: c.groupName,
          })),
        });
        aggregated.summary.classesCreated += res.summary.classesCreated;
        aggregated.summary.classesJoined =
          (aggregated.summary.classesJoined ?? 0) + (res.summary.classesJoined ?? 0);
        aggregated.summary.classesUpdated += res.summary.classesUpdated;
        aggregated.summary.studentsInserted += res.summary.studentsInserted;
        aggregated.summary.studentsUpdated += res.summary.studentsUpdated;
        aggregated.syncedClasses.push(...res.syncedClasses);
      }

      setIclabsToken('');
      setSyncResult(aggregated);
      setStep('done');
      onSynced();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyinkronkan data ICLabs.');
    } finally {
      setSyncProgress('');
      setLoading(false);
    }
  }

  const currentStepIdx = STEPS.findIndex((s) => s.key === step);

  return (
    <Modal
      open={open}
      onClose={resetAndClose}
      title={presetClass ? 'Sync Ulang ICLabs' : 'Sync dari ICLabs'}
      subtitle={
        presetClass
          ? `Perbarui peserta ${presetClass.title}. Nilai yang sudah tercatat tetap aman.`
          : 'Tarik daftar kelas & praktikan langsung dari akun ICLabs Anda.'
      }
      maxWidthClass="sm:max-w-lg"
    >
      {/* Visual Step Indicator (for full sync flow) */}
      {!presetClass && (
        <div className="flex items-center gap-2 mb-5">
          {STEPS.map((s, idx) => {
            const done = idx < currentStepIdx;
            const active = idx === currentStepIdx;
            return (
              <div key={s.key} className="flex items-center gap-2 flex-1 last:flex-none">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`w-6 h-6 rounded-full text-[11px] font-bold inline-flex items-center justify-center transition ${
                      done
                        ? 'bg-emerald-600 text-white'
                        : active
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {done ? <Check className="w-3.5 h-3.5 stroke-[2.75]" /> : idx + 1}
                  </span>
                  <span
                    className={`text-xs font-semibold ${
                      active ? 'text-slate-900' : done ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={`h-px flex-1 ${done ? 'bg-emerald-400' : 'bg-slate-200'}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {step === 'credentials' && (
        <form onSubmit={handleFetchPreview} className="space-y-4">
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-indigo-50/70 border border-indigo-100 text-xs text-indigo-900">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <span>
              Kredensial ICLabs hanya digunakan satu kali saat proses sinkronisasi dan tidak
              disimpan di database.
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Email / Username ICLabs
            </label>
            <input
              type="text"
              required
              value={identitas}
              onChange={(e) => setIdentitas(e.target.value)}
              placeholder="Akun ICLabs"
              className="w-full min-h-[46px] px-3.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Password ICLabs
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password ICLabs"
                className="w-full min-h-[46px] pl-3.5 pr-12 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                className="min-h-[44px] min-w-[44px] absolute right-0.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {!presetClass && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                ID Periode <span className="text-slate-400 font-normal">(opsional)</span>
              </label>
              <input
                type="text"
                value={periode}
                onChange={(e) => setPeriode(e.target.value)}
                placeholder="Kosongkan untuk periode aktif"
                className="w-full min-h-[46px] px-3.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition"
              />
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200/80 rounded-xl px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-1">
            <button
              type="button"
              onClick={resetAndClose}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : presetClass ? (
                <RefreshCw className="w-4 h-4" />
              ) : null}
              {presetClass ? 'Sync Sekarang' : 'Lanjutkan'}
            </button>
          </div>
        </form>
      )}

      {step === 'select' && (
        <div className="space-y-4">
          {previewClasses.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm text-slate-600">Tidak ada kelas pada periode ini.</p>
              <button
                type="button"
                onClick={() => setStep('credentials')}
                className="min-h-[44px] px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition"
              >
                Kembali
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium">
                  {previewClasses.length} kelas ditemukan ·{' '}
                  <strong className="text-slate-900">{selectedIds.size} dipilih</strong>
                </span>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  {selectedIds.size === previewClasses.length ? 'Batal semua' : 'Pilih semua'}
                </button>
              </div>

              <div className="border border-slate-200/90 rounded-xl divide-y divide-slate-100 max-h-[45dvh] overflow-y-auto">
                {previewClasses.map((cls) => {
                  const checked = selectedIds.has(cls.externalClassId);
                  return (
                    <button
                      key={cls.externalClassId}
                      type="button"
                      onClick={() => toggleSelect(cls.externalClassId)}
                      className={`w-full text-left px-3.5 py-3 transition flex items-start gap-3 ${
                        checked ? 'bg-indigo-50/45 hover:bg-indigo-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition ${
                          checked
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {checked && <Check className="w-3.5 h-3.5 stroke-[2.75]" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-sm text-slate-900 leading-snug">
                            {cls.localTitle || cls.suggestedTitle}
                          </p>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold shrink-0 ${
                              cls.alreadySynced
                                ? 'bg-indigo-50 text-indigo-700'
                                : cls.sharedExisting
                                  ? 'bg-teal-50 text-teal-700'
                                  : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {cls.alreadySynced
                              ? 'Update'
                              : cls.sharedExisting
                                ? 'Gabung'
                                : 'Baru'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                          #{cls.externalClassId}
                          {cls.participantCountHint != null
                            ? ` · ~${cls.participantCountHint} peserta`
                            : ''}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {error && (
                <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200/80 rounded-xl px-3.5 py-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setStep('credentials')}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm transition"
                >
                  Kembali
                </button>
                <button
                  type="button"
                  disabled={loading || selectedIds.size === 0}
                  onClick={handleConfirmSync}
                  className="flex-1 min-h-[44px] px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-sm shadow-indigo-600/20 transition"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {syncProgress || `Sinkronkan (${selectedIds.size} kelas)`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {step === 'done' && syncResult && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200/80 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-sm text-emerald-950">
              <p className="font-semibold">Sinkronisasi berhasil!</p>
              <p className="text-xs text-emerald-800 mt-1 tabular-nums leading-relaxed">
                {syncResult.summary.classesCreated} kelas baru
                {(syncResult.summary.classesJoined ?? 0) > 0
                  ? `, ${syncResult.summary.classesJoined} gabung sinkron`
                  : ''}
                , {syncResult.summary.classesUpdated} diperbarui ·{' '}
                {syncResult.summary.studentsInserted} praktikan baru,{' '}
                {syncResult.summary.studentsUpdated} diperbarui.
              </p>
            </div>
          </div>

          <div className="border border-slate-200/90 rounded-xl divide-y divide-slate-100 max-h-[38dvh] overflow-y-auto">
            {syncResult.syncedClasses.map((sc) => (
              <div key={sc.id} className="px-3.5 py-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-slate-900 truncate block">
                    {sc.title}
                  </span>
                  {sc.syncCode && (
                    <span className="text-[11px] font-mono text-slate-500">
                      Kode: {sc.syncCode}
                      {sc.joined ? ' · Tersinkron dengan asisten lain' : ''}
                    </span>
                  )}
                </div>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-xs font-medium text-slate-600 tabular-nums shrink-0">
                  {sc.participantCount} peserta
                </span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={resetAndClose}
            className="w-full min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm transition"
          >
            Selesai
          </button>
        </div>
      )}
    </Modal>
  );
}
