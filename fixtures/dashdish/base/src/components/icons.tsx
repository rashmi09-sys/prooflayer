import type { ReactNode } from "react";

// A small, consistent line-icon set drawn for DashDish (24px grid, 1.8 stroke).

function Icon({ children, size = 20, label }: { children: ReactNode; size?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {children}
    </svg>
  );
}

export const Pin = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Icon>
);
export const Search = (p: { size?: number }) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Icon>
);
export const Star = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="m12 3.5 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8Z" fill="currentColor" stroke="none" />
  </Icon>
);
export const Clock = (p: { size?: number }) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);
export const Bike = (p: { size?: number }) => (
  <Icon {...p}>
    <circle cx="6" cy="16.5" r="3.5" />
    <circle cx="18" cy="16.5" r="3.5" />
    <path d="M6 16.5 9.5 9h5l3.5 7.5M14.5 9l-2-3H10" />
  </Icon>
);
export const Bag = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8Z" />
    <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
  </Icon>
);
export const Home = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M4 11 12 4l8 7v8.5a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19.5Z" />
  </Icon>
);
export const Back = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M15 5 8 12l7 7" />
  </Icon>
);
export const Plus = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const Minus = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M5 12h14" />
  </Icon>
);
export const Check = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);
export const Tag = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M3.5 12.5V5a1.5 1.5 0 0 1 1.5-1.5h7.5l8 8-9 9Z" />
    <circle cx="8" cy="8" r="1.5" />
  </Icon>
);
export const Calendar = (p: { size?: number }) => (
  <Icon {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icon>
);
export const Alert = (p: { size?: number }) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5v5.5M12 16.4v.1" />
  </Icon>
);
export const Flame = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-2.5 2-3 4-3 6-1-1-1.5-2-1.5-3C7.5 10 6 12.5 6 15a6 6 0 0 0 6 6Z" />
  </Icon>
);
export const Heart = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.1a4.4 4.4 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20Z" />
  </Icon>
);
