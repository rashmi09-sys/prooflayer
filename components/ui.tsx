import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover shadow-sm",
  secondary: "border border-line-strong bg-surface-2 text-ink hover:border-ink-3/50 hover:bg-surface-3 shadow-sm",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "border border-fail/35 bg-transparent text-fail hover:bg-fail-soft",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Panel({
  children,
  className = "",
  as: Tag = "section",
  ...rest
}: { children: ReactNode; className?: string; as?: "section" | "div" | "article" } & Record<string, unknown>) {
  return (
    <Tag className={`rounded-xl border border-line bg-surface shadow-sm ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function PanelHeader({ title, description, action, id }: { title: string; description?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 id={id} className="text-sm font-semibold text-ink">
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-xs text-ink-3">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Sha({ sha, className = "" }: { sha: string; className?: string }) {
  return (
    <code className={`font-mono text-[0.92em] text-ink-2 ${className}`} title={sha}>
      {sha.slice(0, 7)}
    </code>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-3">{icon}</div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {children ? <div className="mt-1 max-w-sm text-sm text-ink-3">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** Inline note used for system conditions (worker offline, missing config). */
export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "warn" | "fail";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const t = {
    info: "border-accent/25 bg-accent-soft/60",
    warn: "border-warn/30 bg-warn-soft",
    fail: "border-fail/30 bg-fail-soft",
  }[tone];
  return (
    <div role={tone === "info" ? "status" : "alert"} className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border px-4 py-3 ${t}`}>
      <div className="min-w-0 text-sm">
        <p className="font-medium text-ink">{title}</p>
        {children ? <div className="mt-0.5 text-ink-2">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}
