import type { ChatAgentName } from "@offerflow/domain";

/**
 * Code-drawn team covers: a slogan plus one motif per team. Swap for illustrations later.
 * Colours come from CSS variables (agents.css) so the covers follow the dark theme.
 */
const PAPER = { fill: "var(--cover-paper)" };
const INK = { fill: "var(--cover-ink)" };
const ACCENT = { fill: "var(--cover-accent)" };
const SOFT = { fill: "var(--cover-soft)" };
const CARD = { fill: "var(--cover-card)", stroke: "var(--cover-soft)", strokeWidth: 2 };

function Motif({ team }: { team: ChatAgentName }) {
  if (team === "resume_coach") {
    return (
      <g transform="translate(204 36) rotate(6)">
        <rect width="92" height="120" rx="8" style={CARD} />
        {[22, 38, 54, 70, 86, 102].map((y, index) => (
          <rect key={y} x="14" y={y} width={index % 3 === 2 ? 40 : 64} height="5" rx="2.5" style={SOFT} />
        ))}
        <rect x="10" y="49" width="72" height="14" rx="3" style={ACCENT} opacity="0.25" />
        <path d="M66 108 l10 -10 6 6 -10 10z" style={ACCENT} />
      </g>
    );
  }
  if (team === "interview_coach") {
    return (
      <g transform="translate(190 40)">
        <rect width="84" height="52" rx="14" style={CARD} />
        <path d="M18 52 l-4 14 16 -14z" style={CARD} />
        <text x="42" y="35" textAnchor="middle" fontSize="26" fontWeight="700" style={ACCENT}>?</text>
        <rect x="32" y="68" width="84" height="46" rx="14" style={ACCENT} opacity="0.9" />
        <path d="M98 114 l6 12 -16 -12z" style={ACCENT} opacity="0.9" />
        {[48, 62, 76].map((x) => <circle key={x} cx={x + 12} cy="91" r="4" style={{ fill: "var(--cover-card)" }} />)}
      </g>
    );
  }
  if (team === "job_radar") {
    return (
      <g transform="translate(244 100)">
        {[62, 42, 22].map((r) => <circle key={r} r={r} style={{ fill: "none", stroke: "var(--cover-soft)", strokeWidth: 2 }} />)}
        <path d="M0 0 L62 0 A62 62 0 0 0 43.8 -43.8 Z" style={ACCENT} opacity="0.2" />
        <line x1="0" y1="0" x2="43.8" y2="-43.8" style={{ stroke: "var(--cover-accent)", strokeWidth: 2.5 }} />
        <circle r="5" style={ACCENT} />
        {[[28, -32], [-38, 18], [14, 42], [-20, -46]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="5" style={ACCENT} opacity="0.75" />)}
      </g>
    );
  }
  return (
    <g transform="translate(206 40)">
      <rect width="96" height="104" rx="10" style={CARD} />
      <rect width="96" height="20" rx="10" style={ACCENT} opacity="0.85" />
      {Array.from({ length: 12 }, (_, index) => {
        const x = 10 + (index % 4) * 20;
        const y = 32 + Math.floor(index / 4) * 22;
        const done = index < 6;
        return (
          <g key={index}>
            <rect x={x} y={y} width="15" height="15" rx="4" style={done ? ACCENT : SOFT} opacity={done ? 0.85 : 0.6} />
            {done && <path d={`M${x + 4} ${y + 7.5} l3 3 5 -5.5`} style={{ fill: "none", stroke: "var(--cover-card)", strokeWidth: 2, strokeLinecap: "round" }} />}
          </g>
        );
      })}
    </g>
  );
}

/** Wide (16:9) for the dialog; square for the home deck, with the motif moved under the slogan. */
export function TeamCover({ team, tagline, square = false }: { team: ChatAgentName; tagline: string; square?: boolean }) {
  // One phrase per line: split after a full stop, Chinese or English.
  const words = tagline.split(/(?<=[.。])\s*/).filter(Boolean);
  const [width, height] = square ? [240, 240] : [320, 180];
  return (
    <svg
      className={`team-cover${square ? " team-cover--square" : ""}`}
      data-team={team}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={tagline}
    >
      <rect width={width} height={height} style={PAPER} />
      <circle cx={width - 28} cy="16" r="58" style={SOFT} opacity="0.45" />
      <circle cx="-6" cy={height - 2} r="46" style={SOFT} opacity="0.35" />
      <g transform={square ? "translate(-62 84)" : undefined}>
        <Motif team={team} />
      </g>
      {words.map((word, index) => (
        <text
          key={word}
          x="22"
          y={52 + index * 34}
          fontFamily="'Noto Serif SC', 'Source Han Serif SC', Georgia, serif"
          fontSize="27"
          fontWeight="700"
          style={INK}
        >
          {word}
        </text>
      ))}
    </svg>
  );
}
