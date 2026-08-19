import { AlertCircle, AlertTriangle, CheckCircle2, ShieldAlert, type LucideIcon } from "lucide-react";
import type { RiskLevel, TransactionRecord } from "@/lib/types";

export const UNKNOWN = "Unknown";
export const RISK_SEVERITY_DESC: readonly RiskLevel[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

export function normalizeRisk(level: string | null | undefined): RiskLevel {
  if (!level) return "LOW";
  const upper = String(level).trim().toUpperCase();
  if (upper === "CRITICAL") return "CRITICAL";
  if (upper === "HIGH") return "HIGH";
  if (upper === "MEDIUM") return "MEDIUM";
  return "LOW";
}

export function riskRank(level: string | null | undefined): number {
  const norm = normalizeRisk(level);
  switch (norm) {
    case "CRITICAL":
      return 4;
    case "HIGH":
      return 3;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 1;
  }
}

export interface RiskStyleDefinition {
  label: string;
  description: string;
  Icon: LucideIcon;
  chip: string;
  fg: string;
  bg: string;
  border: string;
  colorVar: string;
  rule: string;
  rank: number;
}

export const RISK_STYLES: Record<RiskLevel, RiskStyleDefinition> = {
  CRITICAL: {
    label: "Critical",
    description: "Extreme velocity or safety rule breach requiring immediate intervention.",
    Icon: ShieldAlert,
    chip: "bg-red-500/10 text-red-500 ring-red-500/20",
    fg: "text-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    colorVar: "var(--severity-critical, #ef4444)",
    rule: "bg-[var(--severity-critical,#ef4444)]",
    rank: 4,
  },
  HIGH: {
    label: "High",
    description: "Multivariate outlier flagged by both Autoencoder and Isolation Forest.",
    Icon: AlertTriangle,
    chip: "bg-amber-500/10 text-amber-500 ring-amber-500/20",
    fg: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    colorVar: "var(--severity-high, #f59e0b)",
    rule: "bg-[var(--severity-high,#f59e0b)]",
    rank: 3,
  },
  MEDIUM: {
    label: "Medium",
    description: "Elevated anomaly score requiring analyst review.",
    Icon: AlertCircle,
    chip: "bg-yellow-500/10 text-yellow-500 ring-yellow-500/20",
    fg: "text-yellow-500",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
    colorVar: "var(--severity-medium, #eab308)",
    rule: "bg-[var(--severity-medium,#eab308)]",
    rank: 2,
  },
  LOW: {
    label: "Low",
    description: "Within normal expected statistical range.",
    Icon: CheckCircle2,
    chip: "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20",
    fg: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    colorVar: "var(--severity-low, #10b981)",
    rule: "bg-[var(--severity-low,#10b981)]",
    rank: 1,
  },
};

export const field = {
  id: (r: TransactionRecord) => r.transaction_id || "—",
  accountId: (r: TransactionRecord) => r.account_id || "—",
  at: (r: TransactionRecord) => r.created_at || r.timestamp || r.TransactionDate || "",
  amount: (r: TransactionRecord) => (typeof r.amount === "number" ? r.amount : (r as any).TransactionAmount || 0),
  balance: (r: TransactionRecord) => (typeof r.balance === "number" ? r.balance : typeof r.account_balance === "number" ? r.account_balance : (r as any).AccountBalance || 0),
  velocity: (r: TransactionRecord) => (typeof r.velocity_12h === "number" ? r.velocity_12h : (r as any).Txn_Count_12H || 1),
  velocitySum: (r: TransactionRecord) => (typeof r.velocity_24h_sum === "number" ? r.velocity_24h_sum : (r as any).Txn_Sum_24H || r.amount || 0),
  velocity24hSum: (r: TransactionRecord) => (typeof r.velocity_24h_sum === "number" ? r.velocity_24h_sum : (r as any).Txn_Sum_24H || r.amount || 0),
  type: (r: TransactionRecord) => r.transaction_type || (r as any).TransactionType || UNKNOWN,
  channel: (r: TransactionRecord) => r.channel || (r as any).Channel || UNKNOWN,
  occupation: (r: TransactionRecord) => r.occupation || (r as any).CustomerOccupation || UNKNOWN,
  duration: (r: TransactionRecord) => (typeof r.duration === "number" ? r.duration : (r as any).TransactionDuration || 60),
  loginAttempts: (r: TransactionRecord) => (typeof r.login_attempts === "number" ? r.login_attempts : (r as any).LoginAttempts || 1),
};

export interface TriageSignal {
  label: string;
  detail: string;
  severity: RiskLevel;
}

export function triageSignals(transaction: TransactionRecord): TriageSignal[] {
  const signals: TriageSignal[] = [];
  const level = normalizeRisk(transaction.risk_level);
  const amount = field.amount(transaction);
  const balance = field.balance(transaction);
  const logins = field.loginAttempts(transaction);
  const vel = field.velocity(transaction);
  const mse = transaction.autoencoder_mse || 0;
  const iso = transaction.isolation_score || 0;

  if (logins >= 3) {
    signals.push({
      label: "Multiple Failed Logins",
      detail: `${logins} consecutive authentication attempts before transaction initiation.`,
      severity: "CRITICAL",
    });
  }

  if (balance > 0 && amount > balance * 0.9) {
    signals.push({
      label: "Critical Balance Drain",
      detail: `Transaction moves ${(amount / balance * 100).toFixed(0)}% of total account funds.`,
      severity: "CRITICAL",
    });
  }

  if (amount >= 10000) {
    signals.push({
      label: "High Value Surge",
      detail: `Transaction size exceeds $10,000 threshold.`,
      severity: "HIGH",
    });
  }

  if (vel >= 4) {
    signals.push({
      label: "High 12H Velocity",
      detail: `${vel} transactions logged from this account within rolling 12-hour window.`,
      severity: "HIGH",
    });
  }

  if (mse > 0.05) {
    signals.push({
      label: "Autoencoder Reconstruction Anomaly",
      detail: `Reconstruction MSE of ${mse.toFixed(4)} exceeds baseline manifold bound.`,
      severity: "HIGH",
    });
  }

  if (iso < 0 || iso >= 0.55) {
    signals.push({
      label: "Isolation Forest Anomaly",
      detail: `Outlier isolation score of ${iso.toFixed(4)} across multidimensional features.`,
      severity: "MEDIUM",
    });
  }

  if (signals.length === 0) {
    signals.push({
      label: "Standard Transaction Pattern",
      detail: "All numerical, temporal, and categorical attributes remain within normal bounds.",
      severity: level === "LOW" ? "LOW" : "MEDIUM",
    });
  }

  return signals;
}
