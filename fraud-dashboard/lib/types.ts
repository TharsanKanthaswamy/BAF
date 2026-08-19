export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export const RISK_LEVELS: readonly RiskLevel[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export type TransactionSource = "seed" | "stream" | "upload" | "manual";
export const TRANSACTION_SOURCES: readonly TransactionSource[] = ["seed", "stream", "upload", "manual"];

export const SYNTHETIC_SOURCES: readonly TransactionSource[] = ["seed", "stream"];

export const SOURCE_LABEL: Record<string, string> = {
  seed: "Historical Seed",
  stream: "Live Simulation",
  upload: "Batch Upload",
  manual: "Manual Entry",
  unknown: "External",
};

export const SOURCE_BLURB: Record<string, string> = {
  seed: "Loaded from historical dataset during startup.",
  stream: "Injected via real-time stream simulation.",
  upload: "Imported via batch CSV upload.",
  manual: "Submitted via single transaction evaluation form.",
  unknown: "Origin unknown.",
};

export interface TransactionRecord {
  id?: string | number;
  transaction_id: string;
  account_id: string;
  amount: number;
  account_balance?: number;
  balance?: number;
  is_fraud: boolean;
  risk_level: RiskLevel | string;
  isolation_score: number;
  autoencoder_mse: number;
  velocity_12h?: number;
  velocity_24h_sum?: number;
  login_attempts?: number;
  duration?: number;
  transaction_type?: string;
  channel?: string;
  occupation?: string;
  ai_explanation?: string;
  created_at?: string;
  timestamp?: string;
  source?: TransactionSource | string;
  TransactionDate?: string;
}

export interface PredictPayload {
  TransactionID?: string;
  AccountID: string;
  TransactionDate?: string;
  TransactionAmount: number;
  AccountBalance: number;
  LoginAttempts?: number;
  TransactionDuration?: number;
  TransactionType?: string;
  Channel?: string;
  CustomerOccupation?: string;
  Txn_Count_12H?: number;
  Txn_Sum_24H?: number;
}

export interface UploadResult {
  total_processed?: number;
  flagged_fraud?: number;
  critical_count?: number;
  high_count?: number;
  data?: TransactionRecord[];
  rows?: number;
  processed?: number;
  flagged?: number;
  message?: string;
}

export interface DeleteResult {
  status?: string;
  deleted: number;
  deleted_in_supabase?: number;
  remaining: number;
}
