import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  maxWidthClass?: string;
}

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  maxWidthClass = 'sm:max-w-md',
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 backdrop-blur-[2px] sm:items-center sm:p-4 no-print animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`w-full ${maxWidthClass} max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl shadow-slate-900/15 ring-1 ring-slate-200/80 overflow-hidden safe-bottom animate-sheet-up`}
      >
        {/* Mobile drag handle cue */}
        <div className="pt-2.5 pb-0.5 flex justify-center sm:hidden shrink-0">
          <span className="w-10 h-1 rounded-full bg-slate-200" aria-hidden="true" />
        </div>

        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-3.5 sm:pt-5 pb-4 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
            {subtitle && (
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 inline-flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 sm:px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
