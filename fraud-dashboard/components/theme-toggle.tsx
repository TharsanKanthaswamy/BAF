"use client";

import { useTheme } from "@/components/theme-provider";
import { Monitor, Moon, Sun } from "lucide-react";

import { useMounted } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "system", label: "System", Icon: Monitor },
  { value: "dark", label: "Dark", Icon: Moon },
] as const;

/**
 * A segmented control with one pill that slides between the three positions.
 * Rendered inert until mounted, because `theme` is unknown on the server and a
 * guessed initial position would visibly jump on hydration.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  const activeIndex = Math.max(
    0,
    OPTIONS.findIndex((o) => o.value === (mounted ? theme : "system"))
  );

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="material-control relative inline-flex h-8 items-center rounded-full p-0.5 [--glass-blur:14px]"
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-0.5 left-0.5 size-7 rounded-full",
          "bg-[var(--control-thumb)]",
          "shadow-[0_1px_3px_rgb(0_0_0/0.12),0_1px_1px_rgb(0_0_0/0.06)]",
          // A spring on the thumb, not an ease-out: the overshoot is what makes
          // a physical switch feel thrown rather than animated.
          "transition-transform duration-[420ms] ease-[var(--ease-spring)]",
          !mounted && "opacity-0"
        )}
        style={{ transform: `translateX(${activeIndex * 1.75}rem)` }}
      />
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "relative z-10 grid size-7 place-items-center rounded-full outline-none",
              "transition-colors duration-150 ease-[var(--ease-out-quint)]",
              "focus-visible:ring-2 focus-visible:ring-ring",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
