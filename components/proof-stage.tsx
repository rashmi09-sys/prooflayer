import type { CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
import type { Box, RunArtifact } from "@/lib/shared/types.ts";
import { formatTimestamp, shortSha } from "@/lib/ui/format.ts";
import { pixelScale } from "@/lib/shared/flows.ts";

// ------------------------------------------------------------ rendered page

export function cropFor(a: RunArtifact): Box {
  const k = pixelScale(a);
  const W = (a.width ?? 1200) / k;
  const H = (a.height ?? 760) / k;
  const ann = a.annotations;
  if (!ann?.content) return { x: 0, y: 0, width: W, height: H };
  let { x, y, width, height } = ann.content;
  for (const m of ann.matches) for (const b of m.boxes) {
    const x2 = Math.max(x + width, b.x + b.width);
    const y2 = Math.max(y + height, b.y + b.height);
    x = Math.min(x, b.x);
    y = Math.min(y, b.y);
    width = x2 - x;
    height = y2 - y;
  }
  const pad = 36;
  x = Math.max(0, x - pad);
  y = Math.max(0, y - pad);
  width = Math.min(W - x, width + pad * 2);
  height = Math.min(H - y, height + pad * 2);
  // Keep a calm landscape frame between 1.35:1 and 2:1.
  if (width / height < 1.35) width = Math.min(W - x, Math.round(height * 1.35));
  if (width / height > 2) height = Math.min(H - y, Math.round(width / 2));
  return { x, y, width, height };
}

export function RenderedPage({
  artifact,
  runId,
  commitSha,
  caption = true,
  annotate = true,
  crop: doCrop = true,
  animate = true,
  tone = "dark",
  ringDelayMs,
}: {
  artifact: RunArtifact;
  runId: string;
  commitSha: string;
  caption?: boolean;
  /** Draw rings where assertion values were found. A separate layer: the image itself is never altered. */
  annotate?: boolean;
  /** Frame to the measured content; false shows the whole capture. */
  crop?: boolean;
  /** Draw the rings in, used only for a result observed live. */
  animate?: boolean;
  tone?: "dark" | "light";
  ringDelayMs?: number;
}) {
  const run = { id: runId, commitSha };
  const src = `/api/runs/${runId}/artifacts/${artifact.id}`;
  const k = pixelScale(artifact);
  const W = (artifact.width ?? 1200) / k;
  const H = (artifact.height ?? 760) / k;
  // A phone-sized frame is shown whole, at phone width; a desktop page is framed to its content.
  const portrait = H > W;
  const crop = doCrop && !portrait ? cropFor(artifact) : { x: 0, y: 0, width: W, height: H };
  const matches = annotate ? (artifact.annotations?.matches ?? []).filter((m) => m.found) : [];
  const fs = Math.max(11, crop.width * 0.024);
  const desc = matches.length
    ? `Screenshot of ${artifact.pageUrl} at commit ${shortSha(run.commitSha)}. Highlighted: ${matches.map((m) => `${m.role} value ${m.value} in “${m.text}”`).join("; ")}.`
    : `Screenshot of ${artifact.pageUrl} at commit ${shortSha(run.commitSha)}, captured during this run.`;

  return (
    <figure className={`min-w-0 ${portrait ? "mx-auto w-full max-w-[300px]" : ""}`} style={ringDelayMs !== undefined ? ({ ["--ring-delay" as string]: `${ringDelayMs}ms` } as CSSProperties) : undefined}>
      <div className={`overflow-hidden rounded-xl border bg-white ${tone === "dark" ? "border-white/10 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)]" : "border-line-strong shadow-[0_1px_2px_rgba(24,20,31,0.06),0_18px_40px_-18px_rgba(24,20,31,0.22)]"}`}>
        <div className="flex items-center gap-1.5 border-b border-black/10 bg-[#f3f3f4] px-3 py-2">
          <span aria-hidden className="size-2.5 rounded-full bg-[#ff5f57]/80" />
          <span aria-hidden className="size-2.5 rounded-full bg-[#febc2e]/80" />
          <span aria-hidden className="size-2.5 rounded-full bg-[#28c840]/80" />
          <span className="ml-2 min-w-0 flex-1 truncate rounded bg-white px-2 py-0.5 font-mono text-[11px] text-[#555]">
            localhost{artifact.pageUrl}
            {artifact.annotations?.frame ? ` · ${artifact.annotations.frame.journeyName.toLowerCase()}` : ""}
            {artifact.label?.includes("after clicking") ? " · after clicking “Show breakdown”" : ""}
          </span>
        </div>
        <svg role="img" aria-label={desc} viewBox={`${crop.x} ${crop.y} ${crop.width} ${crop.height}`} className="block h-auto w-full" preserveAspectRatio="xMidYMid meet">
          <rect x={crop.x} y={crop.y} width={crop.width} height={crop.height} fill="#ffffff" />
          <image href={src} x={0} y={0} width={W} height={H} />
          {matches.flatMap((m, mi) =>
            m.boxes.slice(0, 2).map((b, bi) => {
              const pad = 6;
              const r = { x: b.x - pad, y: b.y - pad, w: b.width + pad * 2, h: b.height + pad * 2 };
              const color = m.role === "received" ? "#e5483d" : "#139a5d";
              const label = `${m.role === "received" ? "Received" : "Expected"} ${m.value}`;
              const lw = label.length * fs * 0.6 + fs * 1.2;
              const lh = fs * 1.5;
              // Beside the ring when it fits, otherwise below it, never over page text above.
              const right = r.x + r.w + 10 + lw <= crop.x + crop.width;
              const lx = right ? r.x + r.w + 10 : r.x;
              const ly = right ? r.y + (r.h - lh) / 2 : r.y + r.h + 6;
              return (
                <g key={`${mi}-${bi}`}>
                  <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={8} fill={`${color}14`} />
                  <rect
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.h}
                    rx={8}
                    fill="none"
                    stroke={color}
                    strokeWidth={3}
                    className={animate ? "pl-ring" : undefined}
                    style={{ ["--perim" as string]: `${2 * (r.w + r.h)}` }}
                  />
                  <g transform={`translate(${lx}, ${ly})`}>
                    <rect width={lw} height={lh} rx={fs * 0.45} fill={color} />
                    <text x={fs * 0.6} y={fs * 1.06} fontSize={fs} fontFamily="Geist Mono Variable, ui-monospace, monospace" fontWeight={600} fill="#fff">
                      {label}
                    </text>
                  </g>
                </g>
              );
            }),
          )}
        </svg>
      </div>
      <figcaption hidden={!caption} className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-stage-ink-3">
        <span>
          Chromium · {artifact.width}×{artifact.height} · captured {formatTimestamp(artifact.capturedAt)}. Not a test result.
        </span>
        <a href={src} target="_blank" rel="noreferrer" className="inline-flex min-h-6 items-center gap-0.5 font-medium text-stage-accent hover:underline">
          Full screenshot <ArrowUpRight className="size-3" aria-hidden />
        </a>
      </figcaption>
    </figure>
  );
}
