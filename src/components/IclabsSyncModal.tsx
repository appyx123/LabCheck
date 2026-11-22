import { useState, type FormEvent } from 'react';
import { Check, Loader2, RefreshCw } from 'lucide-react';
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

export function IclabsSyncModal({
  open,
  onClose,
  onSynced,
  presetClass = null,
}: IclabsSyncModalProps) {
  const [step, setStep] = useState<'credentials' | 'select' | 'done'>('credentials');
  const [identitas, setIdentitas] = useState('');
  const [password, setPassword] = useState('');
  const [periode, setPeriode] = useState('');
  const [iclabsToken, setIclabsToken] = useState('');
  const [previewClasses, setPreviewClasses] = useState<IclabsPreviewClass[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [syncResult, setSyncResult] = useState<IclabsSyncResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function resetAndClose() {
    setStep('credentials');
    setPassword('');
    setIclabsToken('');
    setPreviewClasses([]);
    setSelectedIds(new Set());
    setSyncResult(null);
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
    try {
      const res = await api.iclabsSync({
        iclabsToken,
        classes: chosen.map((c) => ({
          externalClassId: c.externalClassId,
          title: c.localTitle || c.suggestedTitle,
          courseCode: c.courseCode,
          groupName: c.groupName,
        })),
      });
      setIclabsToken('');
      setSyncResult(res);
      setStep('done');
      onSynced();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyinkronkan data ICLabs.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={resetAndClose}
      title={presetClass ? 'Sync Ulang ICLabs' : 'Sync dari ICLabs'}
      subtitle={
        presetClass
          ? `Perbarui peserta ${presetClass.title}. Nilai yang ada tetap aman.`
          : 'Kredensial hanya dipakai sekali untuk menarik data dan tidak disimpan.'
      }
      maxWidthClass="sm:max-w-lg"
    >
      {step === 'credentials' && (
        <form onSubmit={handleFetchPreview} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1.5">
              Email / Username ICLabs
            </label>
            <input
              type="text"
              required
              value={identitas}
              onChange={(e) => setIdentitas(e.target.value)}
              placeholder="Akun ICLabs"
              className="w-full min-h-[44px] px-3 rounded-lg border border-neutral-300 text-base focus:outline-none focus:border-neutral-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1.5">
              Password ICLabs
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full min-h-[44px] px-3 rounded-lg border border-neutral-300 text-base focus:outline-none focus:border-neutral-900"
            />
          </div>

          {!presetClass && (
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                ID Periode <span className="text-neutral-400 font-normal">(opsional)</span>
              </label>
              <input
                type="text"
                value={periode}
                onChange={(e) => setPeriode(e.target.value)}
                placeholder="Kosongkan untuk periode aktif"
                className="w-full min-h-[44px] px-3 rounded-lg border border-neutral-300 text-base focus:outline-none focus:border-neutral-900"
              />
            </div>
          )}

          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
            <button
              type="button"
              onClick={resetAndClose}
              className="min-h-[44px] px-4 rounded-lg border border-neutral-300 text-neutral-700 font-medium text-sm hover:bg-neutral-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 min-h-[44px] px-4 rounded-lg bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white font-medium text-sm inline-flex items-center justify-center gap-2 transition"
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
            <div className="py-6 text-center space-y-3">
              <p className="text-sm text-neutral-600">Tidak ada kelas pada periode ini.</p>
              <button
                type="button"
                onClick={() => setStep('credentials')}
                className="min-h-[44px] px-4 rounded-lg border border-neutral-300 text-sm font-medium text-neutral-800"
              >
                Kembali
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>{previewClasses.length} kelas ditemukan</span>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="font-medium text-neutral-900 underline underline-offset-2"
                >
                  {selectedIds.size === previewClasses.length ? 'Batal semua' : 'Pilih semua'}
                </button>
              </div>

              <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-100 max-h-[45dvh] overflow-y-auto">
                {previewClasses.map((cls) => {
                  const checked = selectedIds.has(cls.externalClassId);
                  return (
                    <button
                      key={cls.externalClassId}
                      type="button"
                      onClick={() => toggleSelect(cls.externalClassId)}
                      className="w-full text-left px-3.5 py-3 hover:bg-neutral-50 transition flex items-start gap-3"
                    >
                      <span
                        className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition ${
                          checked
                            ? 'bg-neutral-900 border-neutral-900 text-white'
                            : 'border-neutral-300 bg-white'
                        }`}
                      >
                        {checked && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm text-neutral-900 leading-snug">
                          {cls.localTitle || cls.suggestedTitle}
                        </p>
                        <p className="text-xs text-neutral-500 mt-0.5 font-mono">
                          #{cls.externalClassId}
                          {cls.alreadySynced ? ' · update peserta' : ' · baru'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {error && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                  {error}
                </p>
              )}

              <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setStep('credentials')}
                  className="min-h-[44px] px-4 rounded-lg border border-neutral-300 text-neutral-700 font-medium text-sm"
                >
                  Kembali
                </button>
                <button
                  type="button"
                  disabled={loading || selectedIds.size === 0}
                  onClick={handleConfirmSync}
                  className="flex-1 min-h-[44px] px-4 rounded-lg bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white font-medium text-sm inline-flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Sinkronkan ({selectedIds.size})
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {step === 'done' && syncResult && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-lg bg-emerald-50/70 border border-emerald-200 text-sm text-emerald-950">
            <p className="font-medium">Sinkronisasi selesai.</p>
            <p className="text-xs text-emerald-800 mt-1 tabular-nums">
              {syncResult.summary.classesCreated} kelas baru, {syncResult.summary.classesUpdated}{' '}
              diperbarui · {syncResult.summary.studentsInserted} praktikan baru,{' '}
              {syncResult.summary.studentsUpdated} diperbarui.
            </p>
          </div>

          <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-100 max-h-[38dvh] overflow-y-auto">
            {syncResult.syncedClasses.map((sc) => (
              <div key={sc.id} className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-neutral-900 truncate">{sc.title}</span>
                <span className="text-xs text-neutral-500 tabular-nums shrink-0">
                  {sc.participantCount} peserta
                </span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={resetAndClose}
            className="w-full min-h-[44px] rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-sm"
          >
            Selesai
          </button>
        </div>
      )}
    </Modal>
  );
}
