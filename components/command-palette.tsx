"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { CornerDownLeft, Search } from "lucide-react";

export interface PaletteItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  href?: string;
  action?: () => void;
}

/**
 * Keyboard-first navigation: ⌘K / Ctrl+K opens it, arrows move, Enter runs,
 * Escape closes and returns focus to where it was.
 */
export function CommandPalette({ items, open, onOpenChange }: { items: PaletteItem[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const listId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) {
      restoreRef.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      restoreRef.current?.focus?.();
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.label} ${i.hint ?? ""} ${i.group}`.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  const run = (item: PaletteItem | undefined) => {
    if (!item) return;
    onOpenChange(false);
    if (item.action) item.action();
    else if (item.href) router.push(item.href);
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[#0b0c0f]/45 px-4 pt-[12vh] backdrop-blur-[3px]" onMouseDown={() => onOpenChange(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        className="pl-enter w-full max-w-[600px] overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-[0_30px_80px_-20px_rgba(11,12,15,0.55)]"
      >
        <div className="flex items-center gap-3 border-b border-line px-4 focus-within:border-accent/50">
          <Search className="size-4 text-accent" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(filtered[active]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onOpenChange(false);
              }
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={filtered[active] ? `${listId}-${filtered[active].id}` : undefined}
            placeholder="Go to a page or run…"
            className="h-14 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none"
          />
          <kbd className="rounded border border-line px-1.5 font-mono text-2xs text-ink-3">esc</kbd>
        </div>
        <ul id={listId} role="listbox" aria-label="Results" className="pl-scroll max-h-[50vh] overflow-y-auto p-2">
          {filtered.length === 0 ? <li className="px-3 py-6 text-center text-sm text-ink-3">Nothing matches “{query}”.</li> : null}
          {filtered.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.id} role="presentation">
                {header ? <p className="px-3 pb-1 pt-2.5 text-2xs text-ink-3">{header}</p> : null}
                <div
                  id={`${listId}-${item.id}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(item)}
                  className={`flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${i === active ? "bg-accent-soft text-ink" : "text-ink-2"}`}
                >
                  <span className={i === active ? "text-accent" : "text-ink-3"}>{item.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint ? <span className="truncate font-mono text-2xs text-ink-3">{item.hint}</span> : null}
                  {i === active ? <CornerDownLeft className="size-3.5 text-ink-3" aria-hidden /> : null}
                </div>
              </li>
            );
          })}
        </ul>
        <div aria-hidden className="hidden items-center gap-4 border-t border-line bg-surface-2 px-4 py-2 text-[11px] text-ink-3 sm:flex">
          <span><kbd className="font-mono">↑↓</kbd> move</span>
          <span><kbd className="font-mono">↵</kbd> open</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
          <span className="ml-auto"><kbd className="font-mono">⌘K</kbd> anywhere</span>
        </div>
      </div>
    </div>
  );
}
