export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#14532d" />
        <path d="M10 7h9l5 5v13a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" fill="#f0fdf4" />
        <path d="M19 7v5h5" fill="#bbf7d0" />
        <path d="M12.5 21.5l6.5-6.5 2 2-6.5 6.5h-2z" fill="#f97316" />
      </svg>
      <span>
        Edit<span className="text-accent-500">PDF</span>
      </span>
    </span>
  );
}
