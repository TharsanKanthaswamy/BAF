import * as React from "react";

export const PAGE_SIZE_CHOICES = [25, 50, 100, 250] as const;
export const POLL_CHOICES = [2000, 4000, 8000, 15000, 0] as const;
export const ROW_LIMIT_CHOICES = [1000, 2500, 5000, 10000, 25000] as const;

export interface ConsoleSettings {
  rowLimit: number;
  pollMs: number;
  pageSize: number;
  density: "comfortable" | "compact";
}

export const DEFAULT_SETTINGS: ConsoleSettings = {
  rowLimit: 2500,
  pollMs: 4000,
  pageSize: 50,
  density: "comfortable",
};

const STORAGE_KEY = "fraud_console_settings_v1";

let currentSettings: ConsoleSettings = { ...DEFAULT_SETTINGS };
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      currentSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {}
}

export function describePoll(pollMs: number): string {
  if (pollMs === 0) return "Manual (paused)";
  if (pollMs < 1000) return `${pollMs}ms`;
  return `${pollMs / 1000}s`;
}

export function updateSettings(partial: Partial<ConsoleSettings>): void {
  currentSettings = { ...currentSettings, ...partial };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
    } catch {}
  }
  notify();
}

export function resetSettings(): void {
  currentSettings = { ...DEFAULT_SETTINGS };
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }
  notify();
}

export function useConsoleSettings(): ConsoleSettings {
  const [settings, setSettings] = React.useState<ConsoleSettings>(currentSettings);

  React.useEffect(() => {
    const handleUpdate = () => setSettings({ ...currentSettings });
    listeners.add(handleUpdate);
    return () => {
      listeners.delete(handleUpdate);
    };
  }, []);

  return settings;
}
