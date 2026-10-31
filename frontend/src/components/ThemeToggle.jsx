import { Moon, Sun } from "lucide-react";
import { useTheme } from "../utils/theme";

export default function ThemeToggle({ className = "" }) {
  const { theme, toggle } = useTheme();
  const Icon = theme === "dark" ? Sun : Moon;
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  return (
    <button type="button" onClick={toggle} aria-label={label} title={label} className={`icon-btn ${className}`}>
      <Icon size={18} />
    </button>
  );
}
