export const offerFlowTheme = {
  colors: {
    paper: "#f4f0e7",
    paperTranslucent: "rgb(244 240 231 / 0.18)",
    paperSurface: "#fffdfb",
    ink: "#171714",
    rust: "#ad6042",
    moss: "#65715a",
    sand: "#cda86b",
    warmLine: "#d9d0c2",
    workspaceCanvas: "#f2f0eb",
    publicCanvas: "#f4f0e7",
    sidebar: "#f5f2ec",
    groupSurface: "#eeeae2",
    structuralLine: "#bfb5a8",
    brand: "#ad6042",
    brandHover: "#8c4832",
    brandSoft: "#faf2ed",
    canvas: "#f2f0eb",
    surface: "#fffdfb",
    surfaceRaised: "#ffffff",
    surfaceMuted: "#eeeae2",
    surfaceSunken: "#e7e2d9",
    text: "#1a1917",
    textStrong: "#11100e",
    textMuted: "#4c4842",
    textSubtle: "#655f58",
    line: "#d2c9bc",
    lineStructural: "#bfb5a8",
    lineStrong: "#8f8477",
    lineControl: "#8f8477",
    lineSubtle: "#e3ddd4",
    primary: "#171714",
    primaryHover: "#2b2b26",
    primaryText: "#fffdfb",
    link: "#245a8d",
    linkHover: "#17456f",
    info: "#356f9b",
    infoSoft: "#e7f0f5",
    danger: "#a33f37",
    dangerSoft: "#f7e6e0",
    success: "#5b664f",
    successIndicator: "#65715a",
    successSoft: "#e8ede5",
    warning: "#8b631d",
    warningSoft: "#f7ebd3"
  },
  font: {
    sans: '"Noto Sans SC", "Source Han Sans SC", "HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, -apple-system, "Segoe UI", sans-serif',
    serif: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", STSong, SimSun, Georgia, serif',
    mono: '"SFMono-Regular", Consolas, "Liberation Mono", "Courier New", monospace'
  },
  fontSize: {
    caption: "0.8125rem",
    label: "0.875rem",
    body: "1rem",
    bodyLarge: "1.125rem",
    headingSmall: "1.25rem",
    headingMedium: "1.5rem",
    headingLarge: "2rem",
    pageTitle: "clamp(2rem, 3vw, 2.75rem)",
    display: "clamp(2.375rem, 6vw, 4.5rem)"
  },
  lineHeight: {
    tight: 1.12,
    heading: 1.2,
    ui: 1.4,
    body: 1.6
  },
  space: {
    0: "0",
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    8: "2rem",
    10: "2.5rem",
    12: "3rem",
    16: "4rem",
    20: "5rem",
    24: "6rem"
  },
  controlHeight: {
    small: "2.5rem",
    medium: "2.75rem",
    large: "3rem",
    xlarge: "3.5rem"
  },
  radius: {
    small: "0.75rem",
    medium: "1rem",
    large: "1.125rem",
    xlarge: "1.75rem",
    control: "0.75rem",
    card: "1.125rem",
    hero: "1.75rem",
    pill: "999px"
  },
  shadow: {
    card: "0 0 0 1px rgb(23 23 20 / 0.055), 0 1px 2px rgb(23 23 20 / 0.035)",
    float: "0 0 0 1px rgb(23 23 20 / 0.07), 0 18px 48px -24px rgb(23 23 20 / 0.3)",
    dialog: "0 0 0 1px rgb(23 23 20 / 0.08), 0 28px 80px -28px rgb(23 23 20 / 0.38)"
  },
  zIndex: {
    base: 0,
    sticky: 10,
    header: 20,
    dropdown: 30,
    overlay: 40,
    modal: 50,
    toast: 60,
    skipLink: 100
  },
  motion: {
    durationInstant: "50ms",
    durationFast: "160ms",
    durationBase: "200ms",
    durationSlow: "240ms",
    easingStandard: "cubic-bezier(0.2, 0, 0, 1)",
    easingOut: "cubic-bezier(0.16, 1, 0.3, 1)",
    pressScale: 0.96
  },
  breakpoint: {
    small: "30rem",
    medium: "48rem",
    large: "64rem",
    xlarge: "80rem"
  }
} as const;

export * from "./primitives";
