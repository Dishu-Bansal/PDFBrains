import { Moon, Sun } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

function resolveInitial(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(resolveInitial);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("pdfbrains-theme", theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  const next = theme === "dark" ? "light" : "dark";
  const Icon = theme === "dark" ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="inline-flex size-10 items-center justify-center rounded-full text-muted transition hover:bg-raised hover:text-ink active:scale-[0.96]"
    >
      <Icon size={19} weight="regular" />
    </button>
  );
}
