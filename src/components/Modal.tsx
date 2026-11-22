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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center sm:p-4 no-print"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`w-full ${maxWidthClass} max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-xl bg-white shadow-xl border border-neutral-200 overflow-hidden safe-bottom`}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-neutral-100 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-neutral-900">{title}</h2>
            {subtitle && <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 inline-flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
