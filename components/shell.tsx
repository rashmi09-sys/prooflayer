"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  CircleDot,
  Eye,
  GitCompareArrows,
  History,
  LogOut,
  Menu,
  PanelsTopLeft,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { Wordmark, LogoMark } from "./logo.tsx";
import { CommandPalette, type PaletteItem } from "./command-palette.tsx";

export interface ShellProject {
  slug: string;
  name: string;
  repo: string;
}

export interface ShellRecentRun {
  id: string;
  label: string;
  hint: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: typeof History;
  match?: (p: string) => boolean;
}

export function Shell({
  children,
  projects = [],
  projectSlug,
  userEmail,
  banner,
  recentRuns = [],
  wide = false,
  minimal = false,
}: {
  children: ReactNode;
  projects?: ShellProject[];
  projectSlug?: string;
  userEmail?: string | null;
  banner?: ReactNode;
  recentRuns?: ShellRecentRun[];
  /** Workspace pages: full-width content and a rail that starts collapsed. */
  wide?: boolean;
  /** The demonstration itself: identity, Workspace and a way into the evidence; no sidebar. */
  minimal?: boolean;
}) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [collapsed, setCollapsed] = useState(wide);
  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    try {
      const v = localStorage.getItem("pl-rail");
      if (v === "open") setCollapsed(false);
      if (v === "closed") setCollapsed(true);
    } catch {
      /* storage blocked */
    }
  }, []);
  const toggleRail = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("pl-rail", c ? "open" : "closed");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  const project = projects.find((p) => p.slug === projectSlug) ?? (projectSlug ? null : projects[0] ?? null);
  const slug = project?.slug;

  const projectNav: NavItem[] = slug
    ? [
        { href: `/p/${slug}`, label: "Workspace", icon: PanelsTopLeft, match: (p) => p === `/p/${slug}` },
        { href: `/p/${slug}/flows`, label: "Protected Flows", icon: ShieldCheck, match: (p) => p.startsWith(`/p/${slug}/flows`) },
        { href: `/p/${slug}/runs`, label: "Runs", icon: History, match: (p) => p.startsWith(`/p/${slug}/runs`) || p.startsWith(`/p/${slug}/verify`) || p.startsWith("/runs/") },
        { href: `/p/${slug}/compare`, label: "Compare", icon: GitCompareArrows, match: (p) => p.startsWith(`/p/${slug}/compare`) },
      ]
    : [];

  const paletteItems: PaletteItem[] = [
    ...projectNav.map((n) => ({ id: n.href, group: project?.name ?? "Project", label: n.label, icon: <n.icon className="size-4" />, href: n.href })),
    ...recentRuns.map((r) => ({ id: r.id, group: "Recent runs", label: r.label, hint: r.hint, icon: <CircleDot className="size-4" />, href: `/runs/${r.id}` })),
    ...projects
      .filter((p) => p.slug !== slug)
      .map((p) => ({ id: `proj-${p.slug}`, group: "Switch project", label: p.name, hint: p.repo, icon: <PanelsTopLeft className="size-4" />, href: `/p/${p.slug}` })),
  ];

  const rail = (mini: boolean) => (
    <div className="flex h-full flex-col gap-4">
      <div className={`hidden items-center lg:flex ${mini ? "justify-center" : "justify-between px-1"}`}>
        <Link href={slug ? `/p/${slug}` : "/"} className="rounded-md p-1" aria-label="ProofLayer home">
          {mini ? <LogoMark /> : <Wordmark />}
        </Link>
        {!mini ? (
          <button type="button" onClick={toggleRail} className="rounded-md p-1.5 text-nav-ink hover:bg-nav-hover hover:text-nav-ink-strong" aria-label="Collapse sidebar">
            <ChevronsLeft className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {projects.length > 0 ? <ProjectSwitcher projects={projects} current={project} mini={mini} /> : null}

      <button
        type="button"
        onClick={() => setPalette(true)}
        title={mini ? "Jump to… (⌘K)" : undefined}
        aria-label={mini ? "Open command palette" : undefined}
        className={`flex items-center gap-2.5 rounded-lg border border-nav-line bg-surface/60 text-left text-sm text-nav-ink transition-colors hover:border-line-strong hover:text-nav-ink-strong ${mini ? "justify-center p-2" : "px-2.5 py-1.5"}`}
      >
        <Search className="size-4" aria-hidden />
        {!mini ? (
          <>
            <span className="flex-1">Jump to…</span>
            <kbd className="rounded border border-nav-line px-1 font-mono text-[10px] text-nav-ink">⌘K</kbd>
          </>
        ) : null}
      </button>

      <nav aria-label="Main" className="flex-1">
        <ul className="space-y-0.5">
          {projectNav.map((i) => (
            <NavLink key={i.href} item={i} pathname={pathname} mini={mini} />
          ))}
        </ul>
      </nav>

      <div className="space-y-3 border-t border-nav-line pt-3">
        {userEmail ? (
          <form action="/api/auth/logout" method="post" className={`flex items-center gap-2 ${mini ? "justify-center" : "justify-between px-1"}`}>
            {!mini ? (
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-ink">
                  {userEmail[0]?.toUpperCase()}
                </span>
                <span className="truncate text-2xs text-nav-ink" title={userEmail}>
                  {userEmail}
                </span>
              </span>
            ) : null}
            <button type="submit" className="rounded-md p-1.5 text-nav-ink hover:bg-nav-hover hover:text-nav-ink-strong" aria-label="Sign out" title="Sign out">
              <LogOut className="size-4" aria-hidden />
            </button>
          </form>
        ) : (
          <p className={`flex items-center gap-2 text-2xs text-nav-ink ${mini ? "justify-center" : "px-1"}`} title="Public demo: recorded runs, read-only">
            <Eye className="size-4 shrink-0" aria-hidden />
            {!mini ? <span>Recorded demo · read-only</span> : <span className="sr-only">Recorded demo, read-only</span>}
          </p>
        )}
        {mini ? (
          <button type="button" onClick={toggleRail} className="mx-auto flex rounded-md p-1.5 text-nav-ink hover:bg-nav-hover hover:text-nav-ink-strong" aria-label="Expand sidebar" title="Expand sidebar">
            <ChevronsRight className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );

  if (minimal) {
    return (
      <div className="min-h-dvh">
        <header className="sticky top-0 z-30 border-b border-nav-line/70 bg-bg/80 backdrop-blur-md">
          <div className="mx-auto flex h-14 w-full max-w-[1480px] items-center gap-4 px-4 sm:px-6 lg:px-8">
            <Link href={slug ? `/p/${slug}` : "/"} aria-label="ProofLayer home" className="shrink-0">
              <Wordmark />
            </Link>
            <span aria-current="page" className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-ink-2">
              Workspace
            </span>
            <span className="flex-1" />
            {userEmail ? (
              <form action="/api/auth/logout" method="post">
                <button type="submit" className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Sign out" title={`Sign out ${userEmail}`}>
                  <LogOut className="size-4" aria-hidden />
                </button>
              </form>
            ) : null}
          </div>
        </header>
        {banner}
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1480px] px-4 py-8 outline-none sm:px-6 lg:px-8 lg:py-10">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className={`min-h-dvh lg:grid ${collapsed ? "lg:grid-cols-[68px_minmax(0,1fr)]" : "lg:grid-cols-[236px_minmax(0,1fr)]"}`}>
      <aside className={`sticky top-0 hidden h-dvh border-r border-nav-line bg-nav-bg py-4 lg:block ${collapsed ? "px-2.5" : "px-3"}`}>{rail(collapsed)}</aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-nav-line bg-nav-bg/95 px-4 backdrop-blur lg:hidden">
        <Link href={slug ? `/p/${slug}` : "/"} aria-label="ProofLayer home">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPalette(true)} className="rounded-md p-2 text-nav-ink hover:bg-nav-hover" aria-label="Open command palette">
            <Search className="size-5" aria-hidden />
          </button>
          <button type="button" onClick={() => setDrawer((o) => !o)} aria-expanded={drawer} aria-controls="mobile-nav" className="rounded-md p-2 text-nav-ink hover:bg-nav-hover">
            {drawer ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
            <span className="sr-only">{drawer ? "Close menu" : "Open menu"}</span>
          </button>
        </div>
      </header>
      {drawer ? (
        <div id="mobile-nav" className="pl-scroll fixed inset-x-0 top-14 z-20 max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-b border-nav-line bg-nav-bg px-3 py-4 shadow-md lg:hidden">
          {rail(false)}
        </div>
      ) : null}

      <div className="min-w-0">
        {banner}
        <main id="main" tabIndex={-1} className={`mx-auto w-full px-4 py-6 outline-none sm:px-6 lg:py-8 ${wide ? "max-w-[1680px] lg:px-8" : "max-w-[1240px] lg:px-10"}`}>
          {children}
        </main>
      </div>
      <CommandPalette items={paletteItems} open={palette} onOpenChange={setPalette} />
    </div>
  );
}

function NavLink({ item, pathname, mini }: { item: NavItem; pathname: string; mini: boolean }) {
  const active = item.match ? item.match(pathname) : pathname === item.href;
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        title={mini ? item.label : undefined}
        aria-label={mini ? item.label : undefined}
        className={`group relative flex items-center gap-2.5 rounded-lg text-sm transition-colors duration-200 ${mini ? "justify-center p-2.5" : "px-2.5 py-2"} ${
          active ? "bg-nav-active font-medium text-nav-ink-strong" : "text-nav-ink hover:bg-nav-hover hover:text-nav-ink-strong"
        }`}
      >
        <Icon className={`size-[18px] ${active ? "text-nav-accent" : ""}`} aria-hidden />
        {!mini ? item.label : null}
      </Link>
    </li>
  );
}

function ProjectSwitcher({ projects, current, mini }: { projects: ShellProject[]; current: ShellProject | null; mini: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const shown = current ?? projects[0];
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={mini ? `${shown.name} · switch project` : undefined}
        className={`flex w-full items-center gap-2.5 rounded-xl border border-nav-line bg-surface text-left shadow-sm transition-colors hover:border-line-strong ${mini ? "justify-center p-1.5" : "px-2.5 py-2"}`}
      >
        <Monogram name={shown.name} />
        {!mini ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-nav-ink-strong">{shown.name}</span>
              <span className="block truncate font-mono text-[11px] text-nav-ink">{shown.repo}</span>
            </span>
            <ChevronsUpDown className="size-4 text-nav-ink" aria-hidden />
          </>
        ) : null}
        <span className="sr-only">Switch project</span>
      </button>
      {open ? (
        <div className={`pl-enter absolute top-full z-40 mt-1.5 w-64 rounded-xl border border-line-strong bg-surface p-1 shadow-md ${mini ? "left-0" : "inset-x-0 w-auto"}`}>
          <p className="px-2.5 pb-1 pt-1.5 text-2xs text-ink-3">Projects</p>
          <ul>
            {projects.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/p/${p.slug}`}
                  onClick={() => setOpen(false)}
                  aria-current={p.slug === shown.slug ? "true" : undefined}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
                >
                  <Monogram name={p.name} small />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {p.slug === shown.slug ? <Check className="size-4 text-accent" aria-hidden /> : null}
                </Link>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-2.5 py-2 text-[11px] leading-snug text-ink-3">Demo repositories, verified on a server-side allowlist.</p>
        </div>
      ) : null}
    </div>
  );
}

export function Monogram({ name, small = false, large = false }: { name: string; small?: boolean; large?: boolean }) {
  const size = large ? "size-12 text-xl rounded-2xl" : small ? "size-5 text-[10px] rounded" : "size-8 text-sm rounded-lg";
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center bg-gradient-to-br from-[#8a75ff] to-[#5145f5] font-display font-bold text-white ${size}`}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
