import { useId, type ReactNode } from "react";
import type { ArtKey } from "../lib/menu.ts";

// Original, hand-built dish illustrations for the DashDish demo. Pure SVG:
// no photographs, no external assets. Seeded scatter keeps every render
// identical, so screenshots are reproducible.

function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Points scattered inside a circle, deterministic for a seed. */
function scatter(seed: number, n: number, r: number, cx = 100, cy = 100) {
  const rand = rng(seed);
  return Array.from({ length: n }, () => {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * r;
    return { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, r: rand(), a: a * (180 / Math.PI) };
  });
}

export function DishArt({ art, className, label }: { art: ArtKey; className?: string; label?: string }) {
  const uid = useId().replace(/:/g, "");
  const id = (s: string) => `${uid}-${s}`;
  const body = ART[art](id);
  return (
    <svg viewBox="0 0 200 200" className={className} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <radialGradient id={id("shadow")} cx="50%" cy="54%" r="50%">
          <stop offset="70%" stopColor="#000" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("plate")} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#3b3d45" />
          <stop offset="100%" stopColor="#1c1d22" />
        </radialGradient>
        <radialGradient id={id("plateIn")} cx="45%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#2c2e35" />
          <stop offset="100%" stopColor="#202127" />
        </radialGradient>
      </defs>
      {body}
    </svg>
  );
}

type Id = (s: string) => string;

const shadow = (id: Id, r = 92) => <circle cx="100" cy="106" r={r} fill={`url(#${id("shadow")})`} />;
const plate = (id: Id, r = 88) => (
  <>
    {shadow(id, r + 6)}
    <circle cx="100" cy="100" r={r} fill={`url(#${id("plate")})`} />
    <circle cx="100" cy="100" r={r - 10} fill={`url(#${id("plateIn")})`} />
    <path d={`M ${100 - r + 14} 82 A ${r - 14} ${r - 14} 0 0 1 82 ${100 - r + 14}`} stroke="#fff" strokeOpacity="0.07" strokeWidth="3" fill="none" strokeLinecap="round" />
  </>
);
const bowl = (id: Id, inner: string, innerId: string) => (
  <>
    {shadow(id, 90)}
    <circle cx="100" cy="100" r="86" fill="#e9e3d9" />
    <circle cx="100" cy="100" r="86" fill="none" stroke="#b9b0a3" strokeWidth="2" />
    <circle cx="100" cy="100" r="74" fill={`url(#${id(innerId)})`} />
    <circle cx="100" cy="100" r="74" fill="none" stroke="#000" strokeOpacity="0.18" strokeWidth="3" />
    <path d="M 40 70 A 66 66 0 0 1 70 38" stroke="#fff" strokeOpacity="0.5" strokeWidth="4" fill="none" strokeLinecap="round" />
    <desc>{inner}</desc>
  </>
);

function leaf(x: number, y: number, rot: number, s = 1, fill = "#3f8f3a", key?: string | number): ReactNode {
  return (
    <g key={key} transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <path d="M -11 0 C -6 -8 6 -8 11 0 C 6 8 -6 8 -11 0 Z" fill={fill} />
      <path d="M -9 0 L 9 0" stroke="#1f5a1f" strokeOpacity="0.6" strokeWidth="0.9" />
    </g>
  );
}

const ART: Record<ArtKey, (id: Id) => ReactNode> = {
  pizza: (id) => (
    <>
      <defs>
        <radialGradient id={id("crust")} cx="50%" cy="50%" r="50%">
          <stop offset="78%" stopColor="#e7a85a" />
          <stop offset="90%" stopColor="#c97a32" />
          <stop offset="100%" stopColor="#8f4d1d" />
        </radialGradient>
        <radialGradient id={id("sauce")} cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#e2482c" />
          <stop offset="100%" stopColor="#b02a18" />
        </radialGradient>
      </defs>
      {shadow(id, 90)}
      <circle cx="100" cy="100" r="86" fill={`url(#${id("crust")})`} />
      {scatter(11, 16, 6, 100, 100).map((p, i) => {
        const a = (i / 16) * Math.PI * 2;
        return <circle key={i} cx={100 + Math.cos(a) * 80} cy={100 + Math.sin(a) * 80} r={2 + p.r * 3} fill="#5a2c10" opacity={0.55} />;
      })}
      <circle cx="100" cy="100" r="70" fill={`url(#${id("sauce")})`} />
      {scatter(5, 11, 56).map((p, i) => (
        <ellipse key={i} cx={p.x} cy={p.y} rx={10 + p.r * 7} ry={8 + p.r * 5} transform={`rotate(${p.a} ${p.x} ${p.y})`} fill="#fbf1d9" />
      ))}
      {scatter(5, 11, 56).map((p, i) => (
        <ellipse key={`h${i}`} cx={p.x - 3} cy={p.y - 3} rx={4} ry={2.5} fill="#fff" opacity="0.7" />
      ))}
      {scatter(23, 6, 52).map((p, i) => leaf(p.x, p.y, p.a, 0.9 + p.r * 0.3, "#2f8a3b", i))}
      {[0, 60, 120].map((d) => (
        <line key={d} x1="100" y1="100" x2={100 + Math.cos((d * Math.PI) / 180) * 86} y2={100 + Math.sin((d * Math.PI) / 180) * 86} stroke="#7a3d14" strokeOpacity="0.35" strokeWidth="1.2" />
      ))}
      {[180, 240, 300].map((d) => (
        <line key={d} x1="100" y1="100" x2={100 + Math.cos((d * Math.PI) / 180) * 86} y2={100 + Math.sin((d * Math.PI) / 180) * 86} stroke="#7a3d14" strokeOpacity="0.35" strokeWidth="1.2" />
      ))}
      <path d="M 52 60 Q 70 40 100 38" stroke="#fff" strokeOpacity="0.35" strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  ),

  ramen: (id) => (
    <>
      <defs>
        <radialGradient id={id("broth")} cx="45%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#e3a65a" />
          <stop offset="100%" stopColor="#a5601f" />
        </radialGradient>
      </defs>
      {shadow(id, 92)}
      <circle cx="100" cy="100" r="88" fill="#1d1e24" />
      <circle cx="100" cy="100" r="88" fill="none" stroke="#c0392b" strokeWidth="3" strokeOpacity="0.7" />
      <circle cx="100" cy="100" r="76" fill={`url(#${id("broth")})`} />
      {Array.from({ length: 9 }, (_, i) => (
        <path key={i} d={`M ${52 + i * 3} ${86 + i * 5} q 12 -10 24 0 t 24 0 t 24 0`} stroke="#f6e3a8" strokeWidth="3.2" fill="none" strokeLinecap="round" opacity={0.95} />
      ))}
      <rect x="118" y="38" width="30" height="46" rx="2" fill="#16301f" transform="rotate(18 133 61)" />
      <rect x="121" y="41" width="24" height="40" rx="1" fill="#1f4029" transform="rotate(18 133 61)" />
      <g transform="translate(70 62)">
        <ellipse cx="0" cy="0" rx="16" ry="12" fill="#fbf7ee" />
        <ellipse cx="1" cy="0" rx="8" ry="6.5" fill="#f19a2a" />
        <ellipse cx="-1" cy="-2" rx="3" ry="2" fill="#ffd27a" opacity="0.8" />
      </g>
      <g transform="translate(96 54)">
        <ellipse cx="0" cy="0" rx="15" ry="11" fill="#fbf7ee" />
        <ellipse cx="0" cy="1" rx="7.5" ry="6" fill="#ee8f20" />
      </g>
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${70 + i * 18} ${132 - i * 6}) rotate(${-15 + i * 12})`}>
          <ellipse rx="17" ry="13" fill="#c98b6a" />
          <ellipse rx="12" ry="9" fill="#e3b496" />
          <path d="M -10 2 Q 0 -6 10 2" stroke="#f6ddc8" strokeWidth="1.5" fill="none" />
        </g>
      ))}
      {scatter(41, 14, 60).map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.2" fill="none" stroke="#6fbf4a" strokeWidth="2" />
      ))}
      <rect x="20" y="160" width="170" height="5" rx="2.5" fill="#6b4a2c" transform="rotate(-24 105 162)" />
      <rect x="26" y="170" width="170" height="5" rx="2.5" fill="#7d5735" transform="rotate(-24 111 172)" />
    </>
  ),

  bowl: (id) => (
    <>
      <defs>
        <radialGradient id={id("in")} cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#d9c7a0" />
          <stop offset="100%" stopColor="#b59b6c" />
        </radialGradient>
      </defs>
      {bowl(id, "grain bowl", "in")}
      {scatter(7, 70, 30, 82, 120).map((p, i) => (
        <ellipse key={i} cx={p.x} cy={p.y} rx="2.4" ry="1.6" fill="#8d6a3f" transform={`rotate(${p.a} ${p.x} ${p.y})`} />
      ))}
      {scatter(13, 9, 18, 128, 118).map((p, i) => (
        <rect key={i} x={p.x - 6} y={p.y - 6} width="12" height="12" rx="3" fill="#ec8a2f" transform={`rotate(${p.a} ${p.x} ${p.y})`} />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i} transform={`translate(${86 + i * 7} ${66 + i * 2}) rotate(${-40 + i * 14})`}>
          <path d="M -16 0 C -10 -10 10 -10 16 0 C 10 6 -10 6 -16 0 Z" fill="#9cc65a" />
          <path d="M -13 0 C -8 -6 8 -6 13 0" stroke="#d7e9a5" strokeWidth="2" fill="none" />
        </g>
      ))}
      {scatter(29, 7, 14, 140, 76).map((p, i) => leaf(p.x, p.y, p.a, 1.1, "#2f7d3a", i))}
      <path d="M 50 100 C 80 86 110 120 150 96" stroke="#f3ead6" strokeWidth="4" fill="none" strokeLinecap="round" />
      {scatter(37, 18, 50).map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="1.4" fill="#2a241b" />
      ))}
    </>
  ),

  burger: (id) => (
    <>
      <defs>
        <linearGradient id={id("bun")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0a54c" />
          <stop offset="100%" stopColor="#b9651e" />
        </linearGradient>
        <linearGradient id={id("patty")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6b3519" />
          <stop offset="100%" stopColor="#3d1c0c" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="168" rx="86" ry="14" fill="#000" opacity="0.4" />
      <path d="M 26 150 Q 100 176 174 150 L 170 140 Q 100 160 30 140 Z" fill="#c9772b" />
      <path d="M 24 136 Q 100 152 176 136 L 176 146 Q 100 162 24 146 Z" fill={`url(#${id("patty")})`} />
      <path d="M 26 122 Q 100 136 174 122 L 176 136 Q 100 150 24 136 Z" fill={`url(#${id("patty")})`} />
      <path d="M 30 126 L 46 140 L 58 128 L 74 142 L 88 128 L 104 143 L 118 128 L 134 142 L 148 128 L 164 140 L 172 126 Z" fill="#f6c23e" />
      <path d="M 22 118 C 40 108 50 128 66 116 C 82 106 92 126 108 116 C 124 106 134 126 150 116 C 164 108 172 122 180 116 L 176 126 Q 100 140 24 126 Z" fill="#5fae3c" />
      <path d="M 26 116 C 26 60 174 60 174 116 Q 100 128 26 116 Z" fill={`url(#${id("bun")})`} />
      {scatter(9, 16, 40, 100, 86).map((p, i) => (
        <ellipse key={i} cx={p.x} cy={Math.min(p.y, 108)} rx="2.6" ry="1.4" fill="#fbecc6" transform={`rotate(${p.a} ${p.x} ${p.y})`} />
      ))}
      <path d="M 52 78 Q 80 62 112 64" stroke="#fff" strokeOpacity="0.45" strokeWidth="4" fill="none" strokeLinecap="round" />
    </>
  ),

  sushi: (id) => (
    <>
      <defs>
        <linearGradient id={id("board")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7a5432" />
          <stop offset="100%" stopColor="#51361f" />
        </linearGradient>
      </defs>
      <rect x="14" y="44" width="176" height="122" rx="14" fill="#000" opacity="0.35" />
      <rect x="10" y="36" width="180" height="120" rx="14" fill={`url(#${id("board")})`} />
      {[0, 1, 2].map((i) => (
        <line key={i} x1="10" y1={60 + i * 34} x2="190" y2={58 + i * 34} stroke="#3c2715" strokeOpacity="0.35" />
      ))}
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${46 + i * 46} 72)`}>
          <rect x="-18" y="-8" width="36" height="22" rx="10" fill="#f8f5ee" />
          <rect x="-20" y="-14" width="40" height="18" rx="9" fill="#f37a4a" />
          {[0, 1, 2, 3].map((k) => (
            <path key={k} d={`M ${-14 + k * 9} -12 l 6 14`} stroke="#ffd6c0" strokeWidth="2" />
          ))}
        </g>
      ))}
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(${38 + i * 34} 124)`}>
          <circle r="15" fill="#13261a" />
          <circle r="12" fill="#f8f5ee" />
          <circle r="5.5" fill={i % 2 ? "#f37a4a" : "#7fc26a"} />
        </g>
      ))}
      <path d="M 166 112 q 8 -6 14 0 q -4 10 -14 0 Z" fill="#9ccf55" />
      <path d="M 160 136 c 6 -8 18 -8 20 2 c -8 4 -14 4 -20 -2 Z" fill="#f7b8b0" />
    </>
  ),

  tacos: (id) => (
    <>
      {plate(id)}
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${60 + i * 40} ${100 + (i === 1 ? -10 : 8)}) rotate(${-20 + i * 20})`}>
          <path d="M -32 6 A 32 32 0 0 1 32 6 Z" fill="#efc76a" />
          <path d="M -26 6 A 26 22 0 0 1 26 6 Z" fill="#8b3a1c" />
          {scatter(3 + i, 6, 12, 0, -4).map((p, k) => (
            <circle key={k} cx={p.x - 100 + 100} cy={p.y} r="2.8" fill={k % 2 ? "#f4f0e6" : "#e43c2c"} />
          ))}
          {leaf(-6, -8, 20, 0.6, "#4aa04a")}
        </g>
      ))}
    </>
  ),

  dessert: (id) => (
    <>
      <defs>
        <linearGradient id={id("cocoa")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a8703f" />
          <stop offset="100%" stopColor="#6b3d1f" />
        </linearGradient>
      </defs>
      {plate(id)}
      <rect x="52" y="56" width="96" height="96" rx="12" fill="#000" opacity="0.35" />
      <rect x="50" y="50" width="96" height="96" rx="12" fill="#f4e7cc" />
      <rect x="56" y="56" width="84" height="84" rx="8" fill={`url(#${id("cocoa")})`} />
      {scatter(17, 70, 40, 98, 98).map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={0.7 + p.r * 1.1} fill="#3b1d0b" opacity="0.55" />
      ))}
      <path d="M 64 66 L 92 64" stroke="#fff" strokeOpacity="0.25" strokeWidth="3" strokeLinecap="round" />
      <circle cx="124" cy="76" r="9" fill="#d7263d" />
      <circle cx="121" cy="73" r="2.5" fill="#fff" opacity="0.6" />
      {leaf(110, 70, -30, 0.8, "#3b8f4a")}
      <path d="M 40 150 q 30 10 60 0" stroke="#f1e2c4" strokeOpacity="0.7" strokeWidth="2" fill="none" />
    </>
  ),

  salad: (id) => (
    <>
      <defs>
        <radialGradient id={id("in")} cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#7fbf55" />
          <stop offset="100%" stopColor="#3f7d2c" />
        </radialGradient>
      </defs>
      {bowl(id, "caesar salad", "in")}
      {scatter(51, 16, 52).map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.a})`}>
          <path d="M -16 0 C -10 -12 10 -12 16 0 C 10 10 -10 10 -16 0 Z" fill={i % 3 ? "#8fd05e" : "#b6e07a"} />
          <path d="M -13 0 L 13 0" stroke="#e5f5c9" strokeWidth="1.4" />
        </g>
      ))}
      {scatter(61, 8, 46).map((p, i) => (
        <rect key={i} x={p.x - 5} y={p.y - 5} width="10" height="10" rx="2" fill="#d9a050" transform={`rotate(${p.a} ${p.x} ${p.y})`} />
      ))}
      {scatter(71, 9, 50).map((p, i) => (
        <path key={i} d={`M ${p.x - 7} ${p.y} l 14 -3 l -3 6 Z`} fill="#fbf3dc" />
      ))}
    </>
  ),

  dumplings: (id) => (
    <>
      {plate(id)}
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const x = 100 + Math.cos(a) * 44;
        const y = 100 + Math.sin(a) * 44;
        return (
          <g key={i} transform={`translate(${x} ${y}) rotate(${(a * 180) / Math.PI + 90})`}>
            <path d="M -22 6 C -20 -18 20 -18 22 6 Z" fill="#f4e6c8" />
            <path d="M -22 6 Q 0 14 22 6" fill="#c98a3e" />
            {[-12, -4, 4, 12].map((k) => (
              <path key={k} d={`M ${k} -10 q 2 6 0 12`} stroke="#d8c39a" strokeWidth="1.4" fill="none" />
            ))}
          </g>
        );
      })}
      <circle cx="100" cy="100" r="16" fill="#3b1d10" />
      <circle cx="100" cy="100" r="12" fill="#5c2a14" />
      {scatter(81, 6, 8).map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="1.3" fill="#d7442a" />
      ))}
    </>
  ),

  pasta: (id) => (
    <>
      {plate(id)}
      <circle cx="100" cy="100" r="58" fill="#c2401f" opacity="0.9" />
      {scatter(91, 26, 48).map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.a})`}>
          <rect x="-11" y="-5" width="22" height="10" rx="4" fill="#f2c56b" />
          <rect x="-11" y="-5" width="22" height="10" rx="4" fill="none" stroke="#c98d2f" strokeWidth="1" />
          <ellipse cx="11" cy="0" rx="2" ry="4.5" fill="#a6461f" />
        </g>
      ))}
      {scatter(93, 5, 40).map((p, i) => leaf(p.x, p.y, p.a, 0.9, "#2f8a3b", i))}
      {scatter(97, 20, 46).map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width="3" height="1.6" fill="#fff8e0" transform={`rotate(${p.a} ${p.x} ${p.y})`} />
      ))}
    </>
  ),

  smoothie: (id) => (
    <>
      <defs>
        <linearGradient id={id("drink")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e05a8a" />
          <stop offset="100%" stopColor="#9a2c62" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="176" rx="46" ry="9" fill="#000" opacity="0.35" />
      <path d="M 62 40 L 138 40 L 128 170 Q 100 178 72 170 Z" fill="#fff" opacity="0.12" />
      <path d="M 66 62 L 134 62 L 127 166 Q 100 174 73 166 Z" fill={`url(#${id("drink")})`} />
      <rect x="112" y="10" width="7" height="80" rx="3" fill="#f6efe2" transform="rotate(14 115 50)" />
      <circle cx="84" cy="56" r="10" fill="#4b2a7a" />
      <circle cx="102" cy="52" r="9" fill="#d7263d" />
      <circle cx="82" cy="53" r="2.4" fill="#fff" opacity="0.5" />
      <path d="M 70 70 L 74 160" stroke="#fff" strokeOpacity="0.3" strokeWidth="4" strokeLinecap="round" />
    </>
  ),

  fries: (id) => (
    <>
      {plate(id)}
      {scatter(101, 22, 40, 92, 96).map((p, i) => (
        <rect key={i} x={p.x - 4} y={p.y - 22} width="8" height="44" rx="3" fill={i % 3 ? "#f3c24a" : "#e8a92e"} transform={`rotate(${p.a} ${p.x} ${p.y})`} />
      ))}
      <circle cx="148" cy="138" r="18" fill="#2a2b31" />
      <circle cx="148" cy="138" r="14" fill="#f4ecd2" />
      {scatter(103, 6, 30, 92, 96).map((p, i) => leaf(p.x, p.y, p.a, 0.4, "#5a9a46", i))}
    </>
  ),
};
