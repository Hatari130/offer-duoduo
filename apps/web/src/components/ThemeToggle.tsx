import { Moon, Sun } from "lucide-react";
import type { ColorTheme } from "../app/theme";

export function ThemeToggle({ theme, className = "", onToggle }: {
  theme: ColorTheme;
  className?: string;
  onToggle: () => void;
}) {
  const isDark = theme === "dark";
  const label = isDark ? "切换到日间模式" : "切换到黑夜模式";

  return (
    <button
      className={`theme-toggle${className ? ` ${className}` : ""}`}
      type="button"
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      onClick={onToggle}
    >
      <span className="theme-toggle__icons" aria-hidden="true">
        <Sun className="theme-toggle__sun" size={18} strokeWidth={1.9} />
        <Moon className="theme-toggle__moon" size={18} strokeWidth={1.9} />
      </span>
    </button>
  );
}
