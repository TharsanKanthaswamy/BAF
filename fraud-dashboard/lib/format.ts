export function formatCurrency(amount: number | null | undefined, wholeOnly = false): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: wholeOnly ? 0 : 2,
    maximumFractionDigits: wholeOnly ? 0 : 2,
  }).format(amount);
}

export function formatCompactCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "$0";
  if (Math.abs(amount) >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(amount) >= 1_000) {
    return `$${(amount / 1_000).toFixed(1)}k`;
  }
  return formatCurrency(amount, true);
}

export function formatInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

export function formatDecimal(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "0.00";
  return value.toFixed(decimals);
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "0%";
  const pct = value <= 1 && value >= -1 ? value * 100 : value;
  return `${pct.toFixed(decimals)}%`;
}

export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined || !Number.isFinite(score)) return "0.0000";
  return score.toFixed(4);
}

export function formatTimestamp(timestamp: string | number | null | undefined): string {
  if (!timestamp) return "—";
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return String(timestamp);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return String(timestamp);
  }
}

export function formatRelative(
  timestamp: string | number | null | undefined,
  baseTime: number | Date | null = Date.now()
): string {
  if (!timestamp) return "—";
  try {
    const t = typeof timestamp === "number" ? timestamp : new Date(timestamp).getTime();
    if (!Number.isFinite(t)) return String(timestamp);

    const now = typeof baseTime === "number" ? baseTime : baseTime instanceof Date ? baseTime.getTime() : Date.now();
    const diffSec = Math.round((now - t) / 1000);

    if (diffSec < 5) return "just now";
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay}d ago`;
  } catch {
    return String(timestamp);
  }
}

export function truncateId(id: string | null | undefined, maxLen = 12): string {
  if (!id) return "—";
  if (id.length <= maxLen) return id;
  const half = Math.floor((maxLen - 3) / 2);
  return `${id.slice(0, half)}...${id.slice(-half)}`;
}
