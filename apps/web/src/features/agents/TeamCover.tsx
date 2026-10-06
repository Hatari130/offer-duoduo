import type { ChatAgentName } from "@offerflow/domain";

/** Code-drawn team covers: a slogan plus one motif per team. Swap for illustrations later. */
const PALETTE: Record<ChatAgentName, { paper: string; ink: string; accent: string; soft: string }> = {
  resume_coach: { paper: "#eef2ff", ink: "#26324f", accent: "#3f56b8", soft: "#cbd4ff" },
  interview_coach: { paper: "#fff1ec", ink: "#4a2a22", accent: "#c4533b", soft: "#f6c9bb" },
  job_radar: { paper: "#e9f6f2", ink: "#1f3f38", accent: "#2f7d6d", soft: "#b7e0d5" },
  career_planner: { paper: "#fff6e3", ink: "#4a3415", accent: "#a8671c", soft: "#f1d6a4" }
};

function Motif({ team, accent, soft }: { team: ChatAgentName; accent: string; soft: string }) {
  if (team === "resume_coach") {
    return (
      <g transform="translate(196 34) rotate(6)">
        <rect width="96" height="124" rx="8" fill="#fff" stroke={soft} strokeWidth="2" />
        {[22, 38, 54, 70, 86, 102].map((y, index) => (
          <rect key={y} x="14" y={y} width={index % 3 === 2 ? 44 : 68} height="5" rx="2.5" fill={soft} />
        ))}
        <rect x="10" y="49" width="76" height="14" rx="3" fill={accent} opacity="0.22" />
        <path d="M70 112 l10 -10 6 6 -10 10z" fill={accent} />
      </g>
    );
  }
  if (team === "interview_coach") {
    return (
      <g transform="translate(184 40)">
        <rect width="88" height="54" rx="14" fill="#fff" stroke={soft} strokeWidth="2" />
        <path d="M18 54 l-4 14 16 -14z" fill="#fff" stroke={soft} strokeWidth="2" />
        <text x="44" y="36" textAnchor="middle" fontSize="26" fontWeight="700" fill={accent}>?</text>
        <rect x="34" y="70" width="88" height="48" rx="14" fill={accent} opacity="0.9" />
        <path d="M104 118 l6 12 -16 -12z" fill={accent} opacity="0.9" />
        {[52, 66, 80].map((x) => <circle key={x} cx={x + 12} cy="94" r="4" fill="#fff" />)}
      </g>
    );
  }
  if (team === "job_radar") {
    return (
      <g transform="translate(240 100)">
        {[66, 46, 26].map((r) => <circle key={r} r={r} fill="none" stroke={soft} strokeWidth="2" />)}
        <path d="M0 0 L66 0 A66 66 0 0 0 46.7 -46.7 Z" fill={accent} opacity="0.18" />
        <line x1="0" y1="0" x2="46.7" y2="-46.7" stroke={accent} strokeWidth="2.5" />
        <circle r="5" fill={accent} />
        {[[30, -34], [-40, 20], [16, 44], [-22, -50]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="5" fill={accent} opacity="0.75" />)}
      </g>
    );
  }
  return (
    <g transform="translate(190 38)">
      <rect width="104" height="112" rx="10" fill="#fff" stroke={soft} strokeWidth="2" />
      <rect width="104" height="22" rx="10" fill={accent} opacity="0.85" />
      {Array.from({ length: 12 }, (_, index) => {
        const x = 12 + (index % 4) * 22;
        const y = 34 + Math.floor(index / 4) * 24;
        const done = index < 6;
        return (
          <g key={index}>
            <rect x={x} y={y} width="16" height="16" rx="4" fill={done ? accent : soft} opacity={done ? 0.85 : 0.6} />
            {done && <path d={`M${x + 4} ${y + 8} l3 3 6 -6`} stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />}
          </g>
        );
      })}
    </g>
  );
}

export function TeamCover({ team, tagline }: { team: ChatAgentName; tagline: string }) {
  const colors = PALETTE[team];
  const words = tagline.split(/(?<=\.)\s+/);
  return (
    <svg className="team-cover" viewBox="0 0 320 180" role="img" aria-label={tagline}>
      <rect width="320" height="180" fill={colors.paper} />
      <circle cx="292" cy="16" r="58" fill={colors.soft} opacity="0.45" />
      <circle cx="-6" cy="178" r="46" fill={colors.soft} opacity="0.35" />
      <Motif team={team} accent={colors.accent} soft={colors.soft} />
      {words.map((word, index) => (
        <text
          key={word}
          x="22"
          y={52 + index * 34}
          fontFamily="'Noto Serif SC', 'Source Han Serif SC', Georgia, serif"
          fontSize="27"
          fontWeight="700"
          fill={colors.ink}
        >
          {word}
        </text>
      ))}
    </svg>
  );
}
