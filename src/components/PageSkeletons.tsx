export function DashboardSkeleton() {
  return (
    <div className="min-h-dvh bg-[#F6F7F9] flex flex-col">
      <header className="sticky top-0 z-30 bg-white/85 border-b border-slate-200/80 safe-top">
        <div className="max-w-5xl mx-auto px-4 h-15 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl skeleton-shimmer" />
            <div className="h-4 w-24 rounded-md skeleton-shimmer" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full skeleton-shimmer" />
            <div className="h-4 w-20 rounded-md skeleton-shimmer hidden sm:block" />
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 sm:py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="h-3 w-28 rounded skeleton-shimmer" />
            <div className="h-7 w-48 rounded-lg skeleton-shimmer" />
            <div className="h-4 w-64 rounded skeleton-shimmer" />
          </div>
          <div className="flex gap-2.5">
            <div className="h-11 w-32 rounded-xl skeleton-shimmer" />
            <div className="h-11 w-32 rounded-xl skeleton-shimmer" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="surface-card rounded-2xl p-4 space-y-2">
              <div className="h-3 w-16 rounded skeleton-shimmer" />
              <div className="h-6 w-12 rounded-md skeleton-shimmer" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="surface-card rounded-2xl p-5 space-y-3">
              <div className="flex gap-1.5">
                <div className="h-5 w-16 rounded-md skeleton-shimmer" />
                <div className="h-5 w-24 rounded-md skeleton-shimmer" />
              </div>
              <div className="h-5 w-3/4 rounded-lg skeleton-shimmer" />
              <div className="h-4 w-1/2 rounded skeleton-shimmer" />
              <div className="pt-3 border-t border-slate-100 flex gap-4">
                <div className="h-4 w-20 rounded skeleton-shimmer" />
                <div className="h-4 w-16 rounded skeleton-shimmer" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export function WorkspaceSkeleton() {
  return (
    <div className="min-h-dvh bg-[#F6F7F9] flex flex-col">
      <header className="sticky top-0 z-30 bg-white/85 border-b border-slate-200/80 safe-top">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 h-15 flex items-center justify-between gap-2">
          <div className="space-y-1.5 w-1/2">
            <div className="h-4 w-48 rounded-md skeleton-shimmer" />
            <div className="h-3 w-36 rounded skeleton-shimmer" />
          </div>
          <div className="hidden md:block h-9 w-64 rounded-xl skeleton-shimmer" />
        </div>
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-1.5">
            <div className="h-5 w-32 rounded-lg skeleton-shimmer" />
            <div className="h-3.5 w-56 rounded skeleton-shimmer" />
          </div>
          <div className="h-11 w-32 rounded-xl skeleton-shimmer" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="surface-card rounded-2xl p-5 space-y-3">
              <div className="h-5 w-28 rounded-md skeleton-shimmer" />
              <div className="h-5 w-2/3 rounded-lg skeleton-shimmer" />
              <div className="h-2 w-full rounded-full skeleton-shimmer mt-3" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div className="min-h-dvh bg-[#F6F7F9] flex flex-col">
      <div className="bg-white border-b border-slate-200/80 px-3 sm:px-4 py-3 safe-top">
        <div className="max-w-5xl mx-auto space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-1.5 w-1/2">
              <div className="h-3 w-36 rounded skeleton-shimmer" />
              <div className="h-5 w-48 rounded-lg skeleton-shimmer" />
            </div>
            <div className="flex gap-2">
              <div className="h-9 w-24 rounded-full skeleton-shimmer" />
              <div className="h-9 w-20 rounded-xl skeleton-shimmer" />
            </div>
          </div>
          <div className="h-1.5 w-full rounded-full skeleton-shimmer" />
          <div className="h-11 w-full rounded-xl skeleton-shimmer" />
        </div>
      </div>
      <div className="max-w-5xl w-full mx-auto px-3 sm:px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {[1, 2, 3, 4].map((i) => (
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

export function RecapSkeleton() {
  return (
    <div className="min-h-dvh bg-[#F6F7F9] flex flex-col">
      <div className="bg-white border-b border-slate-200/80 h-15 safe-top" />
      <div className="max-w-5xl w-full mx-auto px-4 py-6 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="surface-card rounded-2xl p-4 space-y-2">
              <div className="h-3 w-16 rounded skeleton-shimmer" />
              <div className="h-6 w-12 rounded-md skeleton-shimmer" />
            </div>
          ))}
        </div>
        <div className="surface-card rounded-2xl p-5 space-y-3">
          <div className="h-4 w-40 rounded skeleton-shimmer" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded-xl skeleton-shimmer" />
            ))}
          </div>
        </div>
        <div className="surface-card rounded-2xl p-5 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-9 rounded-lg skeleton-shimmer" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function AuthSkeleton() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-auth-glow px-4 py-10">
      <div className="w-full max-w-[400px] space-y-6">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-12 h-12 rounded-2xl skeleton-shimmer" />
          <div className="h-6 w-32 rounded-lg skeleton-shimmer" />
          <div className="h-4 w-56 rounded skeleton-shimmer" />
        </div>
        <div className="surface-card rounded-2xl p-6 space-y-4">
          <div className="h-10 w-full rounded-xl skeleton-shimmer" />
          <div className="h-11 w-full rounded-xl skeleton-shimmer" />
          <div className="h-11 w-full rounded-xl skeleton-shimmer" />
          <div className="h-12 w-full rounded-xl skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}
