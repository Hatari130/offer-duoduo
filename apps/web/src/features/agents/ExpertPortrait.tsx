import { useId, type ReactNode } from "react";

/**
 * Code-drawn portraits for the official experts. Each has one detail that hints at
 * the role (小林's whistle, 老陈's tie, 小鹿's antlers, 小石's miner helmet…).
 * Drawn on a 48×48 grid and clipped to a circle, so they stay crisp at any size.
 */

const INK = "#2a2320";
const SKIN = "#ffe1c8";

interface Look {
  bg: string;
  shirt: string;
  /** Drawn before the body: antlers, pencils, a ponytail. */
  behind?: ReactNode;
  /** Drawn after the body, before the face: long hair over the shoulders. */
  back?: ReactNode;
  /** Drawn on the body: collars, ties, lanyards. */
  outfit?: ReactNode;
  /** Hair and headwear in front of the face. */
  front: ReactNode;
  /** Glasses, earrings, a headset. */
  extra?: ReactNode;
  mouth?: ReactNode;
}

const smile = <path d="M21.8 29.6 Q24 31.6 26.2 29.6" fill="none" stroke={INK} strokeWidth="1.1" strokeLinecap="round" />;

const LOOKS: Record<string, Look> = {
  // 复盘教练 小林: sporty ponytail, headband, a whistle to call time.
  "answer-coach": {
    bg: "#ffe3d6",
    shirt: "#ff9f7a",
    behind: <path d="M30 14 C37 11 41.5 18 39 27 C38 31 35.5 33 34 33 C36 28 36 21 31.5 17Z" fill="#3a2a26" />,
    outfit: (
      <>
        <path d="M18.5 35.5 L24 41 L29.5 35.5" fill="none" stroke="#fff" strokeWidth="1.2" />
        <rect x="22.2" y="40.2" width="3.8" height="2.6" rx="1.2" fill="#ffd25e" />
      </>
    ),
    front: (
      <>
        <path d="M13.2 25 C12.4 15.5 18 12 24 12 C30 12 35.6 15.5 34.8 25 C33.5 21 31 18.6 27 18 C26 20 22 21 18.5 20.5 C16 21.5 14.2 23 13.2 25Z" fill="#3a2a26" />
        <path d="M14.6 19.6 C18 14.4 30 14.4 33.4 19.6" fill="none" stroke="#ff7a59" strokeWidth="2.4" strokeLinecap="round" />
      </>
    )
  },
  // 面试官 老陈: greying temples, rectangular glasses, suit and tie.
  "business-interviewer": {
    bg: "#dfe6f5",
    shirt: "#2f3a5c",
    outfit: (
      <>
        <path d="M20 34.6 L24 39.6 L28 34.6Z" fill="#fff" />
        <path d="M23 38.6 L25 38.6 L25.8 44.4 L24 46.4 L22.2 44.4Z" fill="#d9534f" />
      </>
    ),
    front: (
      <>
        <path d="M13.4 23 C12.8 14.5 18 12.2 24 12.2 C30 12.2 35.2 14.5 34.6 23 C33.6 19.4 31.6 17.6 28.5 17.2 C25 16.8 21 17.6 18.5 17.4 C15.8 18 14.2 20 13.4 23Z" fill="#3d3f46" />
        <path d="M13.4 23 C13.3 21 13.7 19.6 14.6 18.6 L15.2 23.4Z M34.6 23 C34.7 21 34.3 19.6 33.4 18.6 L32.8 23.4Z" fill="#a3a8b0" />
        <path d="M18.3 22.4 L21.8 22 M26.2 22 L29.7 22.4" stroke="#3d3f46" strokeWidth="1.1" strokeLinecap="round" />
      </>
    ),
    extra: (
      <g fill="#ffffff33" stroke="#2b2d33" strokeWidth="1.1">
        <rect x="16.8" y="23.4" width="6.4" height="4.9" rx="1.6" />
        <rect x="24.8" y="23.4" width="6.4" height="4.9" rx="1.6" />
        <path d="M23.2 25.4 L24.8 25.4" fill="none" />
      </g>
    ),
    mouth: <path d="M22 30 Q24 31.2 26 30" fill="none" stroke={INK} strokeWidth="1.1" strokeLinecap="round" />
  },
  // 规划师 安姐: a neat bob, gold earrings, a warm cardigan.
  "career-planner": {
    bg: "#fff0cf",
    shirt: "#f2b84b",
    back: <path d="M12 31 C10.5 17 16 10.8 24 10.8 C32 10.8 37.5 17 36 31 C35.6 33 33 33.4 32.2 31.4 L15.8 31.4 C15 33.4 12.4 33 12 31Z" fill="#5a3427" />,
    outfit: <path d="M20.5 34.8 L24 40 L27.5 34.8Z" fill="#fff" />,
    front: <path d="M14.2 23.5 C14.5 15.5 20 12.6 25.5 12.8 C31 13 34.5 16.5 34.4 22 C31.5 18.6 27 17.4 22.5 18.8 C19 19.8 16 21.5 14.2 23.5Z" fill="#5a3427" />,
    extra: (
      <>
        <circle cx="14.2" cy="30.4" r="1.2" fill="#f2c14e" />
        <circle cx="33.8" cy="30.4" r="1.2" fill="#f2c14e" />
      </>
    )
  },
  // 复盘分析师 小数: tidy side part, round glasses, a hoodie.
  "funnel-analyst": {
    bg: "#d8f1ec",
    shirt: "#4fb3a9",
    outfit: (
      <>
        <path d="M15 38 C18.5 35 29.5 35 33 38" fill="none" stroke="#3b9188" strokeWidth="1.4" />
        <path d="M21.5 36.5 L21.5 41 M26.5 36.5 L26.5 41" stroke="#fff" strokeWidth="1" strokeLinecap="round" />
      </>
    ),
    front: <path d="M13.4 24 C12.8 14.8 18.5 12 24.5 12 C30.5 12 35.4 15 34.6 24 C34 20.5 32.5 18.5 30 17.6 C26 19.6 19.5 19.8 15.5 18.6 C14.2 20 13.6 22 13.4 24Z" fill="#232323" />,
    extra: (
      <g fill="#ffffff33" stroke="#2a6f8f" strokeWidth="1.1">
        <circle cx="20" cy="25.8" r="3.2" />
        <circle cx="28" cy="25.8" r="3.2" />
        <path d="M23.2 25.6 Q24 25 24.8 25.6" fill="none" />
      </g>
    )
  },
  // 群面教练 阿凯: spiky hair and a headset, running the group discussion.
  "group-interview": {
    bg: "#e7e2ff",
    shirt: "#8e7cf0",
    front: <path d="M13.2 24 C12.6 18 14 15 16 13.5 L15.5 10.5 L19 12.4 L20.5 9 L23.5 11.6 L26 8.6 L28 11.6 L31.5 9.8 L31.6 13.4 C34 15.5 35.2 19 34.8 24 C33 20 30 18.2 26.5 18 C22 18.5 17.5 19 13.2 24Z" fill="#2b2420" />,
    extra: (
      <>
        <path d="M12.6 25 C12.6 11.5 35.4 11.5 35.4 25" fill="none" stroke="#4a4a52" strokeWidth="1.6" />
        <rect x="10.8" y="22.4" width="3.6" height="6" rx="1.6" fill="#ff7a59" />
        <rect x="33.6" y="22.4" width="3.6" height="6" rx="1.6" fill="#ff7a59" />
        <path d="M12.8 28.4 C14 33 18 33.6 20.4 32.4" fill="none" stroke="#4a4a52" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="21" cy="32.1" r="1.1" fill="#4a4a52" />
      </>
    ),
    mouth: <path d="M21.4 29 Q24 32.8 26.6 29Z" fill="#7a2e2e" stroke={INK} strokeWidth="0.8" strokeLinejoin="round" />
  },
  // HR 小周: long hair, a yellow hair clip, a blazer.
  "hr-screener": {
    bg: "#dde4ff",
    shirt: "#3f56b8",
    back: <path d="M11.8 39 C10 22 14 11 24 11 C34 11 38 22 36.2 39 C35.5 41 32 41 31.5 39 L16.5 39 C16 41 12.5 41 11.8 39Z" fill="#2d211d" />,
    outfit: <path d="M20.6 34.8 L24 40.4 L27.4 34.8Z" fill="#fff" />,
    front: (
      <>
        <path d="M13.4 25 C13.4 16 18 12.2 24 12.6 C30 12.2 34.6 16 34.6 25 C33 20 28.5 16.5 24 15.6 C19.5 16.5 15 20 13.4 25Z" fill="#2d211d" />
        <rect x="28.4" y="15.2" width="4.4" height="1.9" rx="0.95" fill="#ffd25e" transform="rotate(-28 30.6 16.15)" />
      </>
    )
  },
  // 岗位分析师 小鹿: a deer-antler headband and fluffy fringe.
  "job-analyst": {
    bg: "#e6f6ec",
    shirt: "#6cc39a",
    behind: (
      <g stroke="#b07a4f" strokeWidth="1.8" strokeLinecap="round" fill="none">
        <path d="M17.5 14.5 L14.6 7.8 M15.8 10.6 L12 9.6 M15.1 9.2 L16.8 6" />
        <path d="M30.5 14.5 L33.4 7.8 M32.2 10.6 L36 9.6 M32.9 9.2 L31.2 6" />
      </g>
    ),
    extra: (
      <>
        <ellipse cx="12.2" cy="19.6" rx="3.2" ry="1.7" fill="#c98b5e" transform="rotate(-28 12.2 19.6)" />
        <ellipse cx="35.8" cy="19.6" rx="3.2" ry="1.7" fill="#c98b5e" transform="rotate(28 35.8 19.6)" />
      </>
    ),
    front: <path d="M13.4 24 C12.5 15.5 18 12.2 24 12.2 C30 12.2 35.5 15.5 34.6 24 C33.8 21.6 32.4 20 30.6 19.8 C29.6 21 27.6 21.2 26.4 19.9 C25.2 21.2 22.8 21.2 21.6 19.9 C20.4 21.2 18.4 21 17.4 19.8 C15.6 20 14.2 21.6 13.4 24Z" fill="#a0643c" />
  },
  // 文字编辑 阿简: a bun held with a pencil, a turtleneck.
  "plain-editor": {
    bg: "#f1e6fb",
    shirt: "#b892e0",
    behind: (
      <g transform="rotate(-28 24 10.5)">
        <rect x="14" y="9.2" width="18" height="2.6" fill="#ffcf4a" />
        <path d="M32 9.2 L35.2 10.5 L32 11.8Z" fill="#f3d7b0" />
        <path d="M34.2 10.1 L35.2 10.5 L34.2 10.9Z" fill={INK} />
        <rect x="12.2" y="9.2" width="2" height="2.6" fill="#ff8fa3" />
      </g>
    ),
    outfit: <rect x="19" y="33.2" width="10" height="3.6" rx="1.8" fill="#a37fd0" />,
    front: (
      <>
        <circle cx="24" cy="10.8" r="4.8" fill="#3b2c35" />
        <path d="M13.4 25 C12.6 15.5 18 12.4 24 12.4 C30 12.4 35.4 15.5 34.6 25 C33.4 20 29.5 17.4 24 17.2 C18.5 17.4 14.6 20 13.4 25Z" fill="#3b2c35" />
      </>
    )
  },
  // 学长 阿远: a backwards cap and a hoodie, the easygoing senior.
  "senior-peer": {
    bg: "#fde7d7",
    shirt: "#f08c5a",
    outfit: <path d="M15 38 C18.5 35 29.5 35 33 38" fill="none" stroke="#d9703f" strokeWidth="1.4" />,
    front: (
      <>
        <path d="M13.6 21 L34.4 21 C34.6 23.6 33.6 25 32.4 25.4 C31.6 23.2 29.6 22.4 27.4 22.6 L20.6 22.6 C18.4 22.4 16.4 23.2 15.6 25.4 C14.4 25 13.4 23.6 13.6 21Z" fill="#3a2a22" />
        <path d="M13 21.4 C13 11.6 35 11.6 35 21.4Z" fill="#3aa66a" />
        <rect x="13" y="19.6" width="22" height="2.4" rx="1" fill="#2f8a57" />
        <path d="M30 13.6 C34 12 38 13 39.2 15.2 C36.4 15.8 33.6 16.4 31.4 17.2Z" fill="#2f8a57" />
        <circle cx="24" cy="12.4" r="1" fill="#2f8a57" />
      </>
    )
  },
  // 国企 HR 王姐: a curly perm, pearl earrings, a red blouse.
  "soe-hr": {
    bg: "#fde2e0",
    shirt: "#d9534f",
    outfit: <path d="M19.4 34.8 L24 38 L28.6 34.8 L27 38.6 L24 38 L21 38.6Z" fill="#fff" />,
    front: (
      <g fill="#2a201c">
        {[[14.4, 21.4, 3.8], [16.6, 16.4, 4.2], [20.6, 13.2, 4.3], [26, 12.8, 4.4], [31, 15, 4.2], [33.8, 19.6, 3.9], [14.2, 24.6, 2.6], [34, 23.8, 2.8]].map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
        ))}
      </g>
    ),
    extra: (
      <>
        <circle cx="13.6" cy="30.2" r="1.3" fill="#fff" stroke="#e3d6d0" strokeWidth="0.5" />
        <circle cx="34.4" cy="30.2" r="1.3" fill="#fff" stroke="#e3d6d0" strokeWidth="0.5" />
      </>
    )
  },
  // 追问师 小石: a miner's helmet with a lamp, digging up forgotten material.
  "star-digger": {
    bg: "#e3eefb",
    shirt: "#4c7fbf",
    outfit: (
      <>
        <path d="M18.4 36 L18.4 48 M29.6 36 L29.6 48" stroke="#3a6aa5" strokeWidth="2" />
        <circle cx="18.4" cy="40.2" r="0.9" fill="#ffd25e" />
        <circle cx="29.6" cy="40.2" r="0.9" fill="#ffd25e" />
      </>
    ),
    front: (
      <>
        <path d="M12.8 22 C12.8 10.8 35.2 10.8 35.2 22Z" fill="#ffc93c" />
        <path d="M24 11.8 L24 20.6" stroke="#f0a92a" strokeWidth="1.6" />
        <rect x="11" y="20.4" width="26" height="2.8" rx="1.4" fill="#f0a92a" />
        <circle cx="24" cy="16.2" r="2.6" fill="#fff6c8" stroke="#f0a92a" strokeWidth="1" />
      </>
    ),
    extra: (
      <g fill="#c9875a">
        <circle cx="17.6" cy="28.2" r="0.45" />
        <circle cx="18.8" cy="29.1" r="0.45" />
        <circle cx="29.2" cy="29.1" r="0.45" />
        <circle cx="30.4" cy="28.2" r="0.45" />
      </g>
    )
  }
};

export function hasPortrait(id: string): boolean {
  return id in LOOKS;
}

export function ExpertPortrait({ id }: { id: string }) {
  const clip = useId();
  const look = LOOKS[id];
  if (!look) return null;
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <clipPath id={clip}><circle cx="24" cy="24" r="24" /></clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect width="48" height="48" fill={look.bg} />
        {/* Scaled up around the face so it still reads at 24px. */}
        <g transform="translate(24 28) scale(1.18) translate(-24 -28)">
        {look.behind}
        <rect x="21" y="30" width="6" height="6" rx="2" fill={SKIN} />
        <path d="M6 48 C7 38.5 14 34.4 24 34.4 C34 34.4 41 38.5 42 48Z" fill={look.shirt} />
        {look.outfit}
        {look.back}
        <ellipse cx="13.4" cy="25.6" rx="2" ry="2.6" fill={SKIN} />
        <ellipse cx="34.6" cy="25.6" rx="2" ry="2.6" fill={SKIN} />
        <circle cx="24" cy="24.6" r="10.6" fill={SKIN} />
        <circle cx="17.6" cy="29" r="1.8" fill="#ff8a8a" opacity="0.35" />
        <circle cx="30.4" cy="29" r="1.8" fill="#ff8a8a" opacity="0.35" />
        <ellipse cx="20" cy="25.8" rx="1.35" ry="1.7" fill={INK} />
        <ellipse cx="28" cy="25.8" rx="1.35" ry="1.7" fill={INK} />
        <circle cx="20.45" cy="25.2" r="0.45" fill="#fff" />
        <circle cx="28.45" cy="25.2" r="0.45" fill="#fff" />
        {look.mouth ?? smile}
        {look.front}
        {look.extra}
        </g>
      </g>
    </svg>
  );
}
