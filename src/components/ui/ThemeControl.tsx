import { Icon } from "@/components/ui/Icon";
import { useTheme, type ThemePreference } from "@/core/theme/ThemeProvider";

export function ThemeControl({ className = "" }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const icon = preference === "system" ? "monitor" : preference === "dark" ? "moon" : "sun";

  return (
    <label className={`theme-control${className ? ` ${className}` : ""}`}>
      <Icon name={icon} size={16} />
      <select
        aria-label="Color theme"
        title="Color theme"
        value={preference}
        onChange={(event) => setPreference(event.target.value as ThemePreference)}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
