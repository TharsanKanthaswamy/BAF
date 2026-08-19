import type {
  DeleteResult,
  PredictPayload,
  TransactionRecord,
  TransactionSource,
  UploadResult,
} from "@/lib/types";

export type { DeleteResult };

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ||
  "https://npnfraud-tk.onrender.com";

export interface EngineMetrics {
  silhouette_score: number;
  contamination_rate_mean: number;
  target_operational_budget: number;
  models: {
    preprocessor: string;
    autoencoder: string;
    isolation_forest: string;
  };
  engine_status: string;
}

export async function fetchHistory(limit = 5000, signal?: AbortSignal): Promise<TransactionRecord[]> {
  const res = await fetch(`${BACKEND_URL}/history?limit=${limit}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch history: ${res.statusText}`);
  }
  return res.json();
}

export async function predict(payload: PredictPayload): Promise<TransactionRecord> {
  const res = await fetch(`${BACKEND_URL}/predict`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Prediction request failed");
  }
  return res.json();
}

export async function uploadCsv(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BACKEND_URL}/upload-csv`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "CSV upload failed");
  }
  return res.json();
}

export async function simulate(count = 5): Promise<any> {
  const res = await fetch(`${BACKEND_URL}/simulate?count=${count}`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Simulation failed");
  }
  return res.json();
}

export async function clearHistory(): Promise<any> {
  const res = await fetch(`${BACKEND_URL}/history`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`Failed to reset history: ${res.statusText}`);
  }
  return res.json();
}

export async function deleteTransactions(
  arg: string[] | { transactionIds?: string[]; transaction_ids?: string[]; sources?: string[] }
): Promise<DeleteResult> {
  const payload = Array.isArray(arg)
    ? { transaction_ids: arg }
    : {
        transaction_ids: arg.transactionIds || arg.transaction_ids || [],
        sources: arg.sources || [],
      };

  const res = await fetch(`${BACKEND_URL}/history/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to delete transactions");
  }
  return res.json();
}

export async function deleteBySource(sources: TransactionSource[]): Promise<DeleteResult> {
  const res = await fetch(`${BACKEND_URL}/history/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sources }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to delete by source");
  }
  return res.json();
}

export async function getMetrics(signal?: AbortSignal): Promise<EngineMetrics> {
  const res = await fetch(`${BACKEND_URL}/metrics`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch engine metrics: ${res.statusText}`);
  }
  return res.json();
}

export const fetchMetrics = getMetrics;
