"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import {
  realTimeAt,
  replayDuration,
  replayTimeline,
  storyAt,
  type ShowcaseData,
  type StoryState,
} from "@/lib/shared/showcase.ts";
import {
  matchIntent,
  SUPPORTED_EXAMPLE,
  UNSUPPORTED_MESSAGE,
} from "@/lib/shared/intent.ts";
import { projectMeta } from "@/lib/projects-meta.ts";

import { EASE, OFF_STEPS, ON_PACE, type Protection, type View } from "./studio-shared.ts";
import { Home } from "./studio-home.tsx";
import { Run } from "./studio-run.tsx";

//
// The composer's text is read by a deterministic matcher; only the
// scheduled-delivery request is supported. The protection toggle decides what
// happens to the SAME prepared change:
//   OFF  it ships as is; the broken checkout is then shown from an independent
//        evaluation of that revision (no regression gate, no repair).
//   ON   NeverBreak checks the protected journeys, catches the regression,
//        applies the prepared repair on an isolated branch and re-verifies.
// Live (operator, worker and Docker available) runs the checks now; otherwise
// the genuine recorded runs are replayed and labelled as such.

export function Studio({
  initial,
  operator = false,
}: {
  initial: ShowcaseData;
  operator?: boolean;
}) {
  const [data, setData] = useState(initial);
  const [view, setView] = useState<View>({ kind: "home" });
  const [protection, setProtection] = useState<Protection>("off");
  const [draft, setDraft] = useState(SUPPORTED_EXAMPLE);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [liveRun, setLiveRun] = useState<string | null>(null);
  const repairAsked = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const liveAvailable = operator && data.workerOnline;
  const scenario =
    projectMeta(data.project.slug).scenarios?.find(
      (s) => s.id === "scheduled-delivery",
    ) ?? null;
  const recordedReady = Boolean(
    scenario &&
    initial.baseline &&
    initial.source &&
    initial.change.sha.startsWith(scenario.change),
  );
  const running = view.kind === "run" ? view : null;

  // Clocks: OFF recorded steps through the evidence; ON recorded replays the runs' timestamps.
  const segs = useMemo(() => replayTimeline(data, ON_PACE), [data]);
  const total =
    running?.protection === "off" ? OFF_STEPS[3] + 0.5 : replayDuration(segs);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (running?.exec !== "recorded" || !playing) return;
    let raf = 0;
    const tick = (ts: number) => {
      if (last.current !== null)
        setV((x) => Math.min(total, x + (ts - last.current!) / 1000));
      last.current = ts;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      last.current = null;
    };
  }, [running?.exec, playing, total]);
  useEffect(() => {
    if (running?.exec === "recorded" && v >= total) setPlaying(false);
  }, [running?.exec, v, total]);

  // Live: follow what the worker records on the real clock.
  const poll = useCallback(async () => {
    if (!liveRun) return;
    const res = await fetch(
      `/api/projects/${data.project.slug}/showcase?run=${liveRun}`,
      { cache: "no-store" },
    ).catch(() => null);
    if (res?.ok) setData(await res.json());
  }, [data.project.slug, liveRun]);
  const liveActive =
    running?.exec === "live" &&
    (data.source?.id !== liveRun ||
      data.source?.status !== "completed" ||
      data.repair?.status === "running" ||
      (running.protection === "on" &&
        data.source?.verdict === "failed" &&
        !data.repair &&
        data.repairAvailable));
  useEffect(() => {
    if (running?.exec !== "live") return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (liveActive) poll();
    }, 1200);
    return () => clearInterval(t);
  }, [running?.exec, liveActive, poll]);
  // Live ON: when the regression is confirmed, run the existing controlled repair.
  useEffect(() => {
    if (
      running?.exec !== "live" ||
      running.protection !== "on" ||
      repairAsked.current ||
      !data.source ||
      data.source.id !== liveRun
    )
      return;
    if (
      data.source.status === "completed" &&
      data.source.verdict === "failed" &&
      !data.repair &&
      data.repairAvailable
    ) {
      repairAsked.current = true;
      fetch(`/api/runs/${data.source.id}/repair`, { method: "POST" })
        .then(async (r) => {
          if (!r.ok)
            setError(
              (await r.json()).error?.message ?? "The repair couldn't start.",
            );
          poll();
        })
        .catch(() => setError("The repair couldn't start."));
    }
  }, [running, data, liveRun, poll]);

  const story: StoryState = useMemo(() => {
    if (running?.exec === "recorded" && running.protection === "on") {
      const r = realTimeAt(segs, v);
      return storyAt(data, r.t, r.intro);
    }
    return storyAt(
      data,
      running?.exec === "live" ? now : Number.MAX_SAFE_INTEGER,
    );
  }, [running, segs, v, data, now]);

  async function start(p: Protection, text: string) {
    setError(null);
    const intent = matchIntent(text);
    if (intent.kind === "empty") return inputRef.current?.focus();
    if (intent.kind === "unsupported") return setNotice(UNSUPPORTED_MESSAGE);
    setNotice(null);
    const prompt = text.trim();
    if (liveAvailable) {
      setBusy(true);
      try {
        const res = await fetch(`/api/projects/${data.project.slug}/requests`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt, protection: p }),
        });
        const body = await res.json();
        if (!res.ok)
          throw new Error(
            body.error?.message ?? "Live verification couldn't start.",
          );
        repairAsked.current = false;
        setLiveRun(body.runId);
        const r = await fetch(
          `/api/projects/${data.project.slug}/showcase?run=${body.runId}`,
          { cache: "no-store" },
        );
        if (r.ok) setData(await r.json());
        setNow(Date.now());
        enterRun();
        setView({ kind: "run", protection: p, exec: "live", prompt });
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!recordedReady)
      return setNotice(
        "No recorded verification of this scenario is available on this installation. Run npm run demo:init to import it.",
      );
    setData(initial);
    setV(0);
    setPlaying(true);
    enterRun();
    setView({ kind: "run", protection: p, exec: "recorded", prompt });
    window.scrollTo({ top: 0 });
  }

  // The run screen gets its own history entry, so the browser's Back button
  // (and the Back button on the run screen) returns to the main screen.
  function enterRun() {
    if (window.history.state?.plRun) window.history.replaceState({ ...window.history.state, plRun: true }, "");
    else window.history.pushState({ ...window.history.state, plRun: true }, "");
  }

  const showHome = useCallback(() => {
    setView({ kind: "home" });
    setPlaying(false);
    setV(0);
    setLiveRun(null);
    setData(initial);
    window.scrollTo({ top: 0 });
  }, [initial]);

  /** Back to the main screen now; then drop the run screen's history entry. */
  function reset() {
    showHome();
    if (window.history.state?.plRun) window.history.back();
  }

  // The browser's Back button leaves the run screen the same way.
  useEffect(() => {
    const onPop = () => {
      if (!window.history.state?.plRun) showHome();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [showHome]);

  return (
    <MotionConfig reducedMotion="user">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(55%_45%_at_78%_8%,rgba(117,92,255,0.15),transparent_70%),radial-gradient(35%_35%_at_92%_70%,rgba(255,112,72,0.06),transparent_70%)]"
      />
      <AnimatePresence mode="wait" initial={false}>
        {view.kind === "home" ? (
          <motion.div
            key="home"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <Home
              data={initial}
              protection={protection}
              setProtection={setProtection}
              draft={draft}
              setDraft={(t) => {
                setDraft(t);
                if (notice) setNotice(null);
              }}
              onSubmit={() => start(protection, draft)}
              notice={notice}
              error={error}
              busy={busy}
              liveAvailable={liveAvailable}
              inputRef={inputRef}
            />
          </motion.div>
        ) : (
          <motion.div
            key={`run-${view.protection}-${view.exec}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            <Run
              data={data}
              initial={initial}
              story={story}
              view={view}
              v={v}
              total={total}
              playing={playing}
              setPlaying={setPlaying}
              restart={() => {
                setV(0);
                setPlaying(true);
              }}
              skip={() => setV(total)}
              liveActive={liveActive}
              liveRun={liveRun}
              error={error}
              onReset={reset}
              onOther={() => {
                const other: Protection =
                  view.protection === "on" ? "off" : "on";
                setProtection(other);
                start(other, view.prompt);
              }}
              busy={busy}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}

/* ----------------------------------------------------------------- home */

