import { Moon, Sun } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

function resolveInitial(): "light" | "dark" {
  // Guarded for prerendering: no document in Node, default to light.
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  // Fixed initial value: SSR and the first client render must be identical
  // or hydration fails (React #418) and the whole root falls back to a
  // client render (#423). The real theme — set pre-paint by the inline
  // script in index.html — is adopted in an effect below, never guessed
  // during render.
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const skipWrite = useRef(true);

  useEffect(() => {
    // First invocation is the mount render: the DOM already carries the
    // correct theme, so take notes and write nothing (avoids any flash).
    if (skipWrite.current) {
      skipWrite.current = false;
      return;
    }
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("pdfbrains-theme", theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  useEffect(() => {
    // Adopt the pre-paint theme without writing it back. Runs after the
    // write effect's skipped first invocation, so the DOM value survives.
    setTheme(resolveInitial());
  }, []);

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
