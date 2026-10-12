"use client";

import { AnimatePresence, motion } from "motion/react";
import { Camera, MousePointerClick, Loader2 } from "lucide-react";
import type { FrameLite } from "@/lib/shared/showcase.ts";

const SCREEN_W = 390;
const SCREEN_H = 844;
/** Device status bar above the app, so the camera cutout never covers content. */
const STATUS_BAR = 46;

export type PhoneContent =
  | { kind: "frame"; frame: FrameLite; runId: string; total: number; index: number; tag?: string }
  | { kind: "build"; url: string; sha: string; runId: string; label: string }
  | { kind: "empty"; title?: string; text: string };

/**
 * A device frame around either a recorded Chromium frame from a run, or the
 * exact static build a run verified, running interactively in a sandboxed
 * frame. The badge above it always says which one you are looking at.
 */
export function Phone({ content, width = 330, highlight = true, badge = true }: { content: PhoneContent; width?: number; highlight?: boolean; badge?: boolean }) {
  const scale = width / SCREEN_W;
  const height = SCREEN_H * scale;
  const bar = STATUS_BAR * scale;
  return (
    <div className="flex flex-col items-center">
      {badge ? <Badge content={content} /> : null}
      <div
        className="relative mt-3 rounded-[56px] p-[11px] shadow-[0_0_0_1px_rgba(255,255,255,0.07),0_40px_80px_-30px_rgba(0,0,0,0.9),0_0_120px_-40px_rgba(117,92,255,0.45)]"
        style={{ background: "linear-gradient(145deg, #3a3d48, #15161b 40%, #26282f)" }}
      >
        <div className="relative overflow-hidden rounded-[46px] bg-[#111216]" style={{ width, height: height + bar }}>
          <div aria-hidden className="flex items-center justify-between px-[9%] font-semibold text-[#f6f2ec]" style={{ height: bar, fontSize: 15 * scale }}>
            <span>9:41</span>
            <span className="flex items-center gap-[3px]">
              <span className="inline-block h-[0.6em] w-[1.1em] rounded-[2px] border border-current opacity-90" />
            </span>
          </div>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={content.kind === "frame" ? content.frame.id : content.kind === "build" ? content.url : `empty-${content.title ?? ""}`}
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.3, 0.7, 0.2, 1] }}
              className="absolute inset-x-0 bottom-0"
              style={{ top: bar }}
            >
              {content.kind === "frame" ? (
                <>
                  <img src={content.frame.url} alt={`Recorded screen: ${content.frame.journeyName}, ${content.frame.label}`} className="block w-full" style={{ height: height }} draggable={false} />
                  {highlight && content.frame.highlight ? <Ring box={content.frame.highlight} scale={scale} /> : null}
                </>
              ) : content.kind === "build" ? (
                <iframe
                  title={`DashDish, interactive build of ${content.sha.slice(0, 7)}`}
                  src={content.url}
                  sandbox="allow-scripts allow-forms"
                  className="block border-0"
                  style={{ width: SCREEN_W, height: SCREEN_H, transform: `scale(${scale})`, transformOrigin: "0 0" }}
                />
              ) : (
                <Waiting title={content.title} text={content.text} scale={scale} />
              )}
            </motion.div>
          </AnimatePresence>
          <span aria-hidden className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-black" style={{ top: 9 * scale + 2, height: 30 * scale, width: 104 * scale }} />
        </div>
      </div>
    </div>
  );
}

function Ring({ box, scale }: { box: NonNullable<FrameLite["highlight"]>; scale: number }) {
  const pad = 6;
  return (
    <motion.span
      aria-hidden
      initial={{ opacity: 0, scale: 1.08 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, delay: 0.2 }}
      className="pointer-events-none absolute rounded-2xl border-2 border-fail shadow-[0_0_0_6px_rgba(255,107,94,0.18),0_0_30px_rgba(255,107,94,0.35)]"
      style={{ left: (box.x - pad) * scale, top: (box.y - pad) * scale, width: (box.width + pad * 2) * scale, height: (box.height + pad * 2) * scale }}
    />
  );
}

function Badge({ content }: { content: PhoneContent }) {
  if (content.kind === "frame") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/80 px-3 py-1 text-xs text-ink-2 backdrop-blur">
        <Camera className="size-3.5 text-ink-3" aria-hidden />
        <span className="font-medium text-ink">Recorded</span> screen · {content.tag ?? content.frame.journeyName} · {content.frame.label}
      </span>
    );
  }
  if (content.kind === "build") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-coral/30 bg-coral-soft/70 px-3 py-1 text-xs text-ink-2 backdrop-blur">
        <MousePointerClick className="size-3.5 text-coral" aria-hidden />
        <span className="font-medium text-ink">Interactive</span> {content.label}
      </span>
    );
  }
  return <span className="h-[26px]" />;
}

/** A designed stand-in while nothing has been recorded yet: a skeleton of the app, never a fake screen. */
function Waiting({ title, text, scale }: { title?: string; text: string; scale: number }) {
  return (
    <div className="relative h-full overflow-hidden" style={{ padding: 20 * scale }}>
      <div aria-hidden className="space-y-[6%] opacity-[0.55]">
        <div className="nb-shimmer h-[22px] w-[55%] rounded-full bg-white/[0.06]" />
        <div className="nb-shimmer h-[120px] rounded-[22px] bg-white/[0.05]" />
        <div className="flex gap-[4%]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="nb-shimmer h-[54px] flex-1 rounded-2xl bg-white/[0.05]" />
          ))}
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-[5%]">
            <div className="nb-shimmer size-[64px] shrink-0 rounded-2xl bg-white/[0.05]" />
            <div className="flex-1 space-y-2">
              <div className="nb-shimmer h-[12px] w-[70%] rounded-full bg-white/[0.06]" />
              <div className="nb-shimmer h-[10px] w-[45%] rounded-full bg-white/[0.04]" />
            </div>
          </div>
        ))}
      </div>
      {title || text ? (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#111216] via-[#111216]/95 to-transparent px-7 pb-10 pt-20 text-center">
          {title ? (
            <p className="inline-flex items-center gap-2 text-sm font-medium text-ink">
              <Loader2 className="size-3.5 animate-spin text-accent-ink motion-reduce:animate-none" aria-hidden />
              {title}
            </p>
          ) : null}
          <p className="mt-1.5 text-[13px] leading-snug text-ink-3">{text}</p>
        </div>
      ) : null}
    </div>
  );
}
