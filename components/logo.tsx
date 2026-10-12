/** The ProofLayer mark: a five-segment seal (one per required check) around a check. */
export function LogoMark({ className = "size-6 text-nav-ink-strong" }: { className?: string }) {
  const segs = 5;
  const r = 9.5;
  const c = 2 * Math.PI * r;
  const gap = 2.2;
  const len = c / segs - gap;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      {Array.from({ length: segs }).map((_, i) => (
        <circle
          key={i}
          cx="12"
          cy="12"
          r={r}
          stroke="var(--accent)"
          strokeWidth="2.4"
          strokeDasharray={`${len} ${c - len}`}
          strokeDashoffset={-(i * (c / segs)) + c / 4}
          strokeLinecap="butt"
          opacity={i === 4 ? 0.45 : 1}
        />
      ))}
      <path d="m8.4 12.2 2.4 2.4 4.9-5.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ tone = "rail" }: { tone?: "rail" | "page" }) {
  return (
    <span className={`flex items-center gap-2 ${tone === "rail" ? "text-nav-ink-strong" : "text-ink"}`}>
      <LogoMark />
      <span className="font-display text-[16px] font-bold tracking-[-0.02em]">ProofLayer</span>
    </span>
  );
}
