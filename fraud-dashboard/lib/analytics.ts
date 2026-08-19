import { field, normalizeRisk, riskRank } from "@/lib/risk";
import { SYNTHETIC_SOURCES, type RiskLevel, type TransactionRecord, type TransactionSource } from "@/lib/types";

export interface FilterState {
  risk: RiskLevel | "ALL";
  source: TransactionSource | "SYNTHETIC" | "ALL";
  channel: string | "ALL";
  verdict?: "ALL" | "FLAGGED" | "CLEARED";
  query?: string;
  search?: string;
  minAmount?: number | null;
  maxAmount?: number | null;
}

export const DEFAULT_FILTERS: FilterState = {
  risk: "ALL",
  source: "ALL",
  channel: "ALL",
  verdict: "ALL",
  query: "",
  search: "",
  minAmount: null,
  maxAmount: null,
};

export interface RiskSlice {
  level: RiskLevel;
  count: number;
  share: number;
  value: number;
}

export interface VelocityBucket {
  label: string;
  timestamp: number;
  count: number;
  flagged: number;
  exposure: number;
  value: number;
}

export interface AccountRollup {
  accountId: string;
  count: number;
  flagged: number;
  exposure: number;
  worst: RiskLevel;
  lastSeen: string | number;
  occupation?: string;
}

export interface AnalyticsDelta {
  exposure: number | null;
  flagged: number | null;
  volume: number | null;
  flagRate: number | null;
}

export interface Analytics {
  total: number;
  flagged: number;
  critical: number;
  exposure: number;
  flagRate: number;
  accounts: number;
  peakVelocity: number;
  buckets: VelocityBucket[];
  bucketMs: number;
  slices: RiskSlice[];
  riskMix: RiskSlice[];
  topAccounts: AccountRollup[];
  avgMse: number;
  avgIsolation: number;
  delta: AnalyticsDelta;
}

export function rowSource(row: TransactionRecord): TransactionSource {
  const raw = String(row.source || "").trim().toLowerCase();
  if (raw === "seed" || raw === "stream" || raw === "upload" || raw === "manual") {
    return raw as TransactionSource;
  }
  const id = String(row.transaction_id || "").toUpperCase();
  if (id.startsWith("TXN_LIVE") || id.startsWith("TXN_SIM") || id.startsWith("TXN-SIM") || id.startsWith("STREAM")) {
    return "stream";
  }
  if (id.startsWith("TXN_MANUAL") || id.startsWith("TXN-") || id.startsWith("TXN_SIMULATED") || id.startsWith("MANUAL")) {
    return "manual";
  }
  if (id.startsWith("TXN_UPLOAD") || id.startsWith("BATCH") || id.startsWith("UPLOAD")) {
    return "upload";
  }
  return "seed";
}

export function sourceCounts(rows: TransactionRecord[]): Record<TransactionSource, number> {
  const counts: Record<TransactionSource, number> = {
    seed: 0,
    stream: 0,
    upload: 0,
    manual: 0,
  };
  for (const row of rows) {
    const src = rowSource(row);
    counts[src] = (counts[src] || 0) + 1;
  }
  return counts;
}

export function channelOptions(rows: TransactionRecord[]): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const ch = field.channel(row);
    if (ch && ch !== "Unknown") set.add(ch);
  }
  return Array.from(set).sort();
}

export function applyFilters(rows: TransactionRecord[], filters: FilterState): TransactionRecord[] {
  const rawQuery = filters.query !== undefined ? filters.query : (filters.search || "");
  const query = rawQuery.trim().toLowerCase();

  return rows.filter((row) => {
    if (filters.risk && filters.risk !== "ALL" && normalizeRisk(row.risk_level) !== filters.risk) {
      return false;
    }

    if (filters.source && filters.source !== "ALL") {
      const src = rowSource(row);
      if (filters.source === "SYNTHETIC") {
        if (!SYNTHETIC_SOURCES.includes(src)) return false;
      } else if (src !== filters.source) {
        return false;
      }
    }

    if (filters.channel && filters.channel !== "ALL" && field.channel(row) !== filters.channel) {
      return false;
    }

    if (filters.verdict === "FLAGGED" && !row.is_fraud) {
      return false;
    }
    if (filters.verdict === "CLEARED" && row.is_fraud) {
      return false;
    }

    const amt = field.amount(row);
    if (filters.minAmount !== null && filters.minAmount !== undefined && amt < filters.minAmount) {
      return false;
    }
    if (filters.maxAmount !== null && filters.maxAmount !== undefined && amt > filters.maxAmount) {
      return false;
    }

    if (query) {
      const tid = (row.transaction_id || "").toLowerCase();
      const aid = (row.account_id || "").toLowerCase();
      const exp = (row.ai_explanation || "").toLowerCase();
      const type = (field.type(row) || "").toLowerCase();
      const occ = (field.occupation(row) || "").toLowerCase();
      const ch = (field.channel(row) || "").toLowerCase();
      const src = rowSource(row).toLowerCase();
      if (
        !tid.includes(query) &&
        !aid.includes(query) &&
        !exp.includes(query) &&
        !type.includes(query) &&
        !occ.includes(query) &&
        !ch.includes(query) &&
        !src.includes(query)
      ) {
        return false;
      }
    }

    return true;
  });
}

export function sortNewestFirst(rows: TransactionRecord[]): TransactionRecord[] {
  return rows.slice().sort((a, b) => {
    const timeA = new Date(field.at(a) || 0).getTime() || 0;
    const timeB = new Date(field.at(b) || 0).getTime() || 0;
    return timeB - timeA;
  });
}

export function accountRollup(rows: TransactionRecord[]): AccountRollup[] {
  const map = new Map<string, {
    count: number;
    flagged: number;
    exposure: number;
    worst: RiskLevel;
    lastSeen: string | number;
    occupation?: string;
  }>();

  for (const row of rows) {
    const aid = field.accountId(row);
    const amt = field.amount(row);
    const isFraud = Boolean(row.is_fraud);
    const level = normalizeRisk(row.risk_level);
    const at = field.at(row);

    const existing = map.get(aid);
    if (!existing) {
      map.set(aid, {
        count: 1,
        flagged: isFraud ? 1 : 0,
        exposure: amt,
        worst: level,
        lastSeen: at,
        occupation: field.occupation(row),
      });
    } else {
      existing.count += 1;
      if (isFraud) existing.flagged += 1;
      existing.exposure += amt;
      if (riskRank(level) > riskRank(existing.worst)) {
        existing.worst = level;
      }
      if (new Date(at).getTime() > new Date(existing.lastSeen).getTime()) {
        existing.lastSeen = at;
      }
    }
  }

  return Array.from(map.entries()).map(([accountId, data]) => ({
    accountId,
    ...data,
  }));
}

export function analyse(rows: TransactionRecord[], clock: number): Analytics {
  const total = rows.length;
  let flagged = 0;
  let critical = 0;
  let exposure = 0;
  const accountsSet = new Set<string>();

  const riskCounts: Record<RiskLevel, { count: number; value: number }> = {
    CRITICAL: { count: 0, value: 0 },
    HIGH: { count: 0, value: 0 },
    MEDIUM: { count: 0, value: 0 },
    LOW: { count: 0, value: 0 },
  };

  const timestamps: number[] = [];

  for (const row of rows) {
    const amt = field.amount(row);
    const isFraud = Boolean(row.is_fraud);
    const level = normalizeRisk(row.risk_level);
    const aid = field.accountId(row);
    if (aid && aid !== "—") accountsSet.add(aid);

    riskCounts[level].count += 1;
    riskCounts[level].value += amt;

    if (isFraud) {
      flagged += 1;
      exposure += amt;
    }
    if (level === "CRITICAL") {
      critical += 1;
    }

    const t = new Date(field.at(row)).getTime();
    if (Number.isFinite(t)) timestamps.push(t);
  }

  const slices: RiskSlice[] = (["CRITICAL", "HIGH", "MEDIUM", "LOW"] as RiskLevel[]).map((level) => ({
    level,
    count: riskCounts[level].count,
    share: total > 0 ? riskCounts[level].count / total : 0,
    value: riskCounts[level].value,
  }));

  // Build time velocity buckets
  const bucketCount = 16;
  const minTime = timestamps.length ? Math.min(...timestamps) : clock - 3600000;
  const maxTime = timestamps.length ? Math.max(...timestamps) : clock;
  const span = Math.max(maxTime - minTime, 60000);
  const bucketMs = Math.ceil(span / bucketCount);

  const buckets: VelocityBucket[] = Array.from({ length: bucketCount }, (_, i) => {
    const bStart = minTime + i * bucketMs;
    const dateObj = new Date(bStart);
    return {
      label: dateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
      timestamp: bStart,
      count: 0,
      flagged: 0,
      exposure: 0,
      value: 0,
    };
  });

  for (const row of rows) {
    const t = new Date(field.at(row)).getTime();
    if (!Number.isFinite(t)) continue;
    const bIndex = Math.min(Math.max(0, Math.floor((t - minTime) / bucketMs)), bucketCount - 1);
    const b = buckets[bIndex];
    if (b) {
      b.count += 1;
      b.value += field.amount(row);
      if (row.is_fraud) {
        b.flagged += 1;
        b.exposure += field.amount(row);
      }
    }
  }

  let peakVelocity = 0;
  for (const b of buckets) {
    if (b.count > peakVelocity) peakVelocity = b.count;
  }

  // Calculate halving deltas
  let delta: AnalyticsDelta = { exposure: null, flagged: null, volume: null, flagRate: null };
  if (total >= 4) {
    const half = Math.floor(total / 2);
    const newer = rows.slice(0, half);
    const older = rows.slice(half);

    const expNewer = newer.reduce((acc, r) => acc + (r.is_fraud ? field.amount(r) : 0), 0);
    const expOlder = older.reduce((acc, r) => acc + (r.is_fraud ? field.amount(r) : 0), 0);
    const expDelta = expOlder > 0 ? (expNewer - expOlder) / expOlder : null;

    const flagNewer = newer.filter((r) => r.is_fraud).length;
    const flagOlder = older.filter((r) => r.is_fraud).length;
    const flagDelta = flagOlder > 0 ? (flagNewer - flagOlder) / flagOlder : null;

    const volDelta = older.length > 0 ? (newer.length - older.length) / older.length : null;

    const rateNewer = newer.length ? flagNewer / newer.length : 0;
    const rateOlder = older.length ? flagOlder / older.length : 0;
    const rateDelta = rateNewer - rateOlder;

    delta = {
      exposure: expDelta,
      flagged: flagDelta,
      volume: volDelta,
      flagRate: rateDelta,
    };
  }

  // Compute top accounts
  const rollups = accountRollup(rows);
  const topAccounts = rollups
    .sort((a, b) => {
      const diff = riskRank(b.worst) - riskRank(a.worst);
      if (diff !== 0) return diff;
      return b.exposure - a.exposure;
    })
    .slice(0, 5);

  // Compute average MSE and Isolation score
  const totalMse = rows.reduce((acc, r) => acc + (r.autoencoder_mse || 0), 0);
  const totalIso = rows.reduce((acc, r) => acc + (r.isolation_score || 0), 0);
  const avgMse = total > 0 ? totalMse / total : 0;
  const avgIsolation = total > 0 ? totalIso / total : 0;

  return {
    total,
    flagged,
    critical,
    exposure,
    flagRate: total > 0 ? flagged / total : 0,
    accounts: accountsSet.size,
    peakVelocity,
    buckets,
    bucketMs,
    slices,
    riskMix: slices,
    topAccounts,
    avgMse,
    avgIsolation,
    delta,
  };
}
