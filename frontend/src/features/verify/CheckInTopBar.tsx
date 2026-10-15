import { Button } from "../../components/ui";

interface CheckInTopBarProps {
  theme: string;
  onToggleTheme: () => void;
  onLogout: () => void;
}

export function CheckInTopBar({ theme, onToggleTheme, onLogout }: CheckInTopBarProps) {
  return (
    <header className="verify-topbar">
      <div className="verify-topbar-left">
        <span className="brand-badge-logo" style={{ width: 32, height: 32, fontSize: 13 }} aria-hidden="true">
          CP
        </span>
        <span style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>CampusPass</span>
      </div>

      <div className="verify-topbar-right">
        <Button variant="ghost" size="sm" onClick={onToggleTheme} aria-label="Toggle theme">
          {theme === "dark" ? "☀" : "☾"}
        </Button>
        <Button variant="outline" size="sm" onClick={onLogout}>
          Sign out
        </Button>
      </div>
    </header>
  );
}
