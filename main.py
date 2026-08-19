import os
import io
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
import numpy as np
import pandas as pd
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Load environment variables
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=BASE_DIR / ".env")

# --- External Client Setup ---
ml_artifacts = {}
in_memory_transactions = []

# --- Retention / paging ---------------------------------------------------
# The console no longer shows a screenful of recent activity; it pages through
# the whole retained window, so the ceiling here is the retention buffer rather
# than "however many rows fit on a monitor".
HISTORY_LIMIT_DEFAULT = 10_000
HISTORY_LIMIT_MAX = 25_000

# Hard cap on the process-local buffer.
RETENTION_ROWS = 50_000

# How much of the sample CSV to score at startup. The default fills the queue
# with a realistic backlog instead of the 30 rows it used to seed, which made a
# 10,000-row window impossible to actually exercise. Set SEED_ROWS=0 to skip.
SEED_ROWS = int(os.environ.get("SEED_ROWS", "2500"))

# Where a retained row came from. Stamped on every record at write time, because
# "delete the synthetic traffic" is only answerable if origin is recorded rather
# than guessed: a seeded row and an uploaded row are both read from a CSV and are
# byte-identical afterwards, so sniffing the transaction_id prefix would silently
# delete real data the day someone uploads the sample file.
SOURCE_SEED = "seed"      # scored from the sample CSV at startup
SOURCE_STREAM = "stream"  # produced by POST /simulate
SOURCE_UPLOAD = "upload"  # arrived through POST /upload-csv
SOURCE_MANUAL = "manual"  # scored one at a time through POST /predict
KNOWN_SOURCES = (SOURCE_SEED, SOURCE_STREAM, SOURCE_UPLOAD, SOURCE_MANUAL)

# The two the console offers as "synthetic": neither came from an operator.
SYNTHETIC_SOURCES = (SOURCE_SEED, SOURCE_STREAM)


def remember(records: List[dict], source: str = SOURCE_UPLOAD) -> None:
    """Append scored records to the buffer, trimming the oldest past retention.

    Every write path funnels through here so the trim cannot be forgotten at one
    call site — which is how unbounded buffers happen. It is also the one place
    that stamps `source`, for the same reason.
    """
    if not records:
        return
    for record in records:
        record.setdefault("source", source)
    in_memory_transactions.extend(records)
    overflow = len(in_memory_transactions) - RETENTION_ROWS
    if overflow > 0:
        del in_memory_transactions[:overflow]

# Safe Groq Client Setup
groq_client = None
groq_api_key = os.environ.get("GROQ_API_KEY", "").strip()
if groq_api_key:
    try:
        from groq import AsyncGroq
        groq_client = AsyncGroq(api_key=groq_api_key)
        print("Groq AI Client initialized successfully.")
    except Exception as e:
        print(f"Warning: Failed to initialize Groq client: {e}")

# Safe Supabase Client Setup
supabase = None
raw_supabase_url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
supabase_key = os.environ.get("SUPABASE_KEY", "").strip()

if raw_supabase_url and supabase_key:
    try:
        from supabase import create_client
        supabase = create_client(raw_supabase_url, supabase_key)
        print("Supabase Client initialized successfully.")
    except Exception as e:
        print(f"Warning: Failed to initialize Supabase client: {e}")

def relax_unknown_categories(estimator) -> int:
    """Make a fitted encoder tolerate category values it never saw in training.

    scikit-learn's OneHotEncoder defaults to `handle_unknown="error"`, so a single
    unseen string anywhere in a batch makes `transform` raise and takes the whole
    request down with a 500. That is the wrong failure for this service twice over:

      * /simulate injects `TransactionType="Transfer"` to demonstrate an alert, and
        the sample data only ever contains Debit and Credit — so the demo endpoint
        could not succeed at all.
      * an operator uploading their own ledger will certainly bring a merchant,
        channel or occupation this model has never seen, and losing the entire file
        over one novel string is indefensible.

    "ignore" encodes an unseen category as all-zeros, which is the honest encoding:
    the model has no evidence about that value, so it contributes nothing. The
    numeric features still drive the score, and the rules engine reads the raw row,
    so an unknown category degrades one signal instead of failing the request.

    Walks pipelines and column transformers because the artifact on disk is opaque.
    Returns how many encoders were relaxed, for the startup log.
    """
    relaxed = 0
    seen: set[int] = set()

    def walk(node) -> None:
        nonlocal relaxed
        if node is None or id(node) in seen:
            return
        seen.add(id(node))

        name = type(node).__name__
        if name == "OneHotEncoder" and getattr(node, "handle_unknown", None) == "error":
            node.handle_unknown = "ignore"
            relaxed += 1
        elif name == "OrdinalEncoder" and getattr(node, "handle_unknown", None) == "error":
            # No all-zeros equivalent here, so unseen values land on a reserved
            # sentinel outside the fitted range rather than raising.
            node.handle_unknown = "use_encoded_value"
            node.unknown_value = -1
            relaxed += 1

        # ColumnTransformer keeps the fitted copies in `transformers_`, not
        # `transformers`; mutating the unfitted spec would have no effect.
        for attr in ("transformers_", "transformers", "steps", "transformer_list"):
            for entry in getattr(node, attr, None) or []:
                if isinstance(entry, (tuple, list)):
                    for part in entry:
                        if hasattr(part, "transform") or hasattr(part, "steps"):
                            walk(part)
        for attr in ("named_steps", "named_transformers_"):
            container = getattr(node, attr, None)
            if container:
                for part in dict(container).values():
                    walk(part)

    try:
        walk(estimator)
    except Exception as err:  # a surprising artifact shape must not stop startup
        print(f"Warning: could not relax unknown-category handling: {err}")
    return relaxed


# Helper to find model file path
def find_model_path(filenames: List[str]) -> Optional[Path]:
    models_dir = BASE_DIR / "models"
    for name in filenames:
        p = models_dir / name
        if p.exists():
            return p
        # Also check current working directory
        cwd_p = Path("models") / name
        if cwd_p.exists():
            return cwd_p
    return None

# ==========================================
# 1. LIFESPAN HANDLER (LOCAL JOBLIB + MLFLOW)
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Loading ML models...")
    import joblib

    # 1. Try Local Joblib Artifacts first (fast & reliable)
    preprocessor_path = find_model_path(["preprocessor.joblib"])
    autoencoder_path = find_model_path(["autoencoder_model.joblib", "autoencoder.joblib"])
    isolation_path = find_model_path(["isolation_forest_model.joblib", "isolation_forest.joblib"])

    if preprocessor_path and autoencoder_path and isolation_path:
        try:
            ml_artifacts["preprocessor"] = joblib.load(preprocessor_path)
            ml_artifacts["autoencoder"] = joblib.load(autoencoder_path)
            ml_artifacts["isolation_forest"] = joblib.load(isolation_path)
            relaxed = relax_unknown_categories(ml_artifacts["preprocessor"])
            print(f"Local .joblib models loaded successfully from {BASE_DIR / 'models'}")
            if relaxed:
                print(f"Relaxed {relaxed} encoder(s) to ignore unseen categories.")
        except Exception as local_err:
            print(f"Error loading local models: {local_err}")

    # 2. Try MLflow if explicitly configured and local models missing
    if not all(k in ml_artifacts for k in ["preprocessor", "autoencoder", "isolation_forest"]):
        mlflow_uri = os.environ.get("MLFLOW_TRACKING_URI")
        if mlflow_uri:
            try:
                import mlflow.sklearn
                mlflow.set_tracking_uri(mlflow_uri)
                ml_artifacts["preprocessor"] = mlflow.sklearn.load_model("models:/Fraud_Preprocessor/Production")
                ml_artifacts["autoencoder"] = mlflow.sklearn.load_model("models:/Autoencoder_Anomaly/Production")
                ml_artifacts["isolation_forest"] = mlflow.sklearn.load_model("models:/IsolationForest_Anomaly/Production")
                relax_unknown_categories(ml_artifacts["preprocessor"])
                print("MLflow Models successfully loaded.")
            except Exception as e:
                print(f"MLflow model load failed: {e}")

    # 3. Seed sample data into in-memory store on startup if empty
    try:
        sample_csv = BASE_DIR / "bank_transactions_data_2.csv"
        if SEED_ROWS > 0 and sample_csv.exists() and len(in_memory_transactions) == 0:
            sample_df = pd.read_csv(sample_csv, nrows=SEED_ROWS)
            processed_data = process_dataframe(sample_df)
            remember(processed_data, SOURCE_SEED)
            print(f"Seeded {len(processed_data)} sample transactions for initial dashboard state.")
    except Exception as seed_err:
        print(f"Initial sample seeding note: {seed_err}")

    yield
    ml_artifacts.clear()

app = FastAPI(title="Real-Time Fraud Triage Engine", lifespan=lifespan)

# Allow broad CORS for local dev across any port
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 2. SCHEMAS
# ==========================================
class TransactionPayload(BaseModel):
    TransactionID: Optional[str] = Field(default="TXN_SIMULATED")
    AccountID: str = Field(default="ACC_9999")
    TransactionDate: Optional[str] = Field(default=None)
    TransactionAmount: float = Field(default=150.0)
    AccountBalance: float = Field(default=5000.0)
    LoginAttempts: float = Field(default=1.0)
    TransactionDuration: float = Field(default=60.0)
    # Defaults have to be categories the fitted encoders have actually seen.
    # This dataset's TransactionType is only ever Debit or Credit, so the old
    # "Payment" default meant a caller who omitted the field handed the
    # preprocessor a value it had never been fitted on. Location, Channel and
    # Occupation below all appear in the training file as written.
    TransactionType: str = Field(default="Debit")
    Channel: str = Field(default="Online")
    CustomerOccupation: str = Field(default="Engineer")
    CustomerAge: Optional[int] = Field(default=35)
    Location: Optional[str] = Field(default="San Jose")
    DeviceID: Optional[str] = Field(default="DEV_123")
    MerchantID: Optional[str] = Field(default="MERCH_456")
    IPAddress: Optional[str] = Field(default="192.168.1.1")

# ==========================================
# 3. HELPER FUNCTIONS & RULES ENGINE
# ==========================================
def apply_business_rules(txn: dict) -> tuple[bool, list]:
    """Deterministic Rules Engine to catch obvious fraud before ML evaluation."""
    triggered_rules = []
    
    login_attempts = float(txn.get("LoginAttempts") if txn.get("LoginAttempts") is not None else txn.get("login_attempts", 0) or 0)
    txn_count_12h = float(txn.get("Txn_Count_12H") if txn.get("Txn_Count_12H") is not None else txn.get("velocity_12h", 0) or 0)
    txn_amount = float(txn.get("TransactionAmount") if txn.get("TransactionAmount") is not None else txn.get("amount", 0) or 0)
    account_balance = float(txn.get("AccountBalance") if txn.get("AccountBalance") is not None else (txn.get("balance") if txn.get("balance") is not None else txn.get("account_balance", 0)) or 0)
    txn_type = str(txn.get("TransactionType") or txn.get("transaction_type") or "")
    
    if login_attempts >= 5.0:
        triggered_rules.append(f"Excessive login attempts ({int(login_attempts)} attempts)")
        
    if txn_count_12h >= 15.0:
        triggered_rules.append(f"High 12H transaction velocity ({int(txn_count_12h)} txns)")
        
    if txn_type.lower() == "transfer" and txn_amount > (account_balance * 0.90) and txn_amount > 10000:
        triggered_rules.append(f"High-value transfer (${txn_amount:,.2f}) draining >90% of balance")

    if txn_amount > 50000:
        triggered_rules.append(f"Extreme transaction amount alert (${txn_amount:,.2f})")

    is_rule_fraud = len(triggered_rules) > 0
    return is_rule_fraud, triggered_rules

def compute_velocity_features(df: pd.DataFrame) -> pd.DataFrame:
    """Engineer velocity features using rolling time windows."""
    df_copy = df.copy()
    
    # Ensure standard column names
    if 'IP Address' in df_copy.columns and 'IPAddress' not in df_copy.columns:
        df_copy['IPAddress'] = df_copy['IP Address']

    if 'TransactionDate' in df_copy.columns:
        df_copy['Timestamp'] = pd.to_datetime(df_copy['TransactionDate'], errors='coerce')
    else:
        df_copy['Timestamp'] = pd.Timestamp.now(tz=None)

    # The fill value has to match the column's awareness. /simulate writes an
    # offset-bearing ISO string, which parses tz-aware, and filling that with a
    # naive Timestamp is either a raise or a silent object-dtype column depending
    # on the pandas build — after which `rolling('12h')` has no usable index.
    parsed_tz = getattr(getattr(df_copy['Timestamp'], 'dt', None), 'tz', None)
    df_copy['Timestamp'] = df_copy['Timestamp'].fillna(pd.Timestamp.now(tz=parsed_tz))
    
    if 'AccountID' not in df_copy.columns:
        df_copy['AccountID'] = 'ACC_UNKNOWN'
    if 'TransactionAmount' not in df_copy.columns:
        df_copy['TransactionAmount'] = 0.0

    df_copy = df_copy.sort_values(by=['AccountID', 'Timestamp'])
    df_copy = df_copy.set_index('Timestamp')

    # 1. 12-hour rolling transaction count
    df_copy['Txn_Count_12H'] = df_copy.groupby('AccountID')['TransactionAmount'].transform(
        lambda x: x.rolling('12h').count()
    )

    # 2. 24-hour rolling transaction spend sum
    df_copy['Txn_Sum_24H'] = df_copy.groupby('AccountID')['TransactionAmount'].transform(
        lambda x: x.rolling('24h').sum()
    )
    
    df_copy = df_copy.reset_index()
    return df_copy

import re

def build_contextual_explanation(
    record: dict,
    triggered_rules: list,
    is_ml_anomaly: bool,
    iso_score: float,
    mse: float,
    risk_level: str
) -> str:
    """Builds a precise, diverse, and human-meaningful triage explanation based on exact transaction data."""
    if risk_level == "LOW" and not triggered_rules and not is_ml_anomaly:
        return "Normal account activity: Transaction amount and velocity match typical profile baseline."

    amt = float(record.get("amount") or record.get("TransactionAmount") or 0.0)
    bal = float(record.get("balance") or record.get("AccountBalance") or 0.0)
    logins = int(float(record.get("login_attempts") or record.get("LoginAttempts") or 1))
    vel_count = int(float(record.get("velocity_12h") or record.get("Txn_Count_12H") or 1))
    vel_sum = float(record.get("velocity_24h_sum") or record.get("Txn_Sum_24H") or amt)
    channel = str(record.get("channel") or record.get("Channel") or "Online")
    ttype = str(record.get("transaction_type") or record.get("TransactionType") or "Transaction")
    occ = str(record.get("occupation") or record.get("CustomerOccupation") or "Customer")

    pct_drain = (amt / (bal + 1e-5)) * 100 if bal > 0 else 0

    reasons = []

    # 1. Login anomalies
    if logins >= 5:
        reasons.append(f"{logins} consecutive failed login attempts before authentication")
    elif logins >= 3:
        reasons.append(f"{logins} repeated login attempts")

    # 2. Balance drain / extreme amounts
    if amt >= 50000:
        reasons.append(f"extreme transaction volume of ${amt:,.2f}")
    elif ttype.lower() == "transfer" and pct_drain > 85 and amt > 5000:
        reasons.append(f"high-value {channel} transfer (${amt:,.2f}) that depletes {pct_drain:.0f}% of available balance")
    elif pct_drain > 90 and amt > 2500:
        reasons.append(f"spending ${amt:,.2f}, draining {pct_drain:.0f}% of account balance")
    elif amt > 10000:
        reasons.append(f"atypical high-value amount of ${amt:,.2f} for a {occ}")

    # 3. Velocity surges
    if vel_count >= 15:
        reasons.append(f"rapid velocity surge ({vel_count} transactions within 12 hours totaling ${vel_sum:,.2f})")
    elif vel_count >= 8:
        reasons.append(f"elevated 12-hour activity frequency ({vel_count} transactions)")

    # 4. Neural Network / Isolation Forest latent space deviations
    if is_ml_anomaly:
        if iso_score >= 0.44 and mse >= 1.0:
            reasons.append("multi-model statistical outlier across both Autoencoder reconstruction loss and Isolation Forest isolation paths")
        elif mse >= 1.05:
            reasons.append(f"unusual transactional behavioral signature (Autoencoder MSE: {mse:.2f})")
        elif iso_score >= 0.435:
            reasons.append(f"atypical feature combination (Isolation Score: {iso_score:.2f})")

    # Specific rule text if any remain unrepresented
    for rule in triggered_rules:
        if not any(k in rule.lower() for k in ["login", "transfer", "amount", "velocity"]):
            reasons.append(rule)

    if not reasons:
        if is_ml_anomaly:
            reasons.append("unusual transaction characteristics that deviate from this account's historical spending baseline")
        else:
            return "Normal account activity: Transaction parameters are consistent with expected behavior."

    # Format cleanly into 1-2 flowing natural sentences
    if len(reasons) == 1:
        return f"Anomaly detected: Flagged due to {reasons[0]}."
    elif len(reasons) == 2:
        return f"Anomaly detected: Flagged due to {reasons[0]}, combined with {reasons[1]}."
    else:
        return f"Anomaly detected: Flagged due to {reasons[0]}, {reasons[1]}, and {reasons[2]}."


async def generate_ai_explanation(record: dict, triggered_rules: list, is_ml_anomaly: bool, iso_score: float, mse: float) -> str:
    """Generates a plain-English, context-aware fraud triage explanation using Groq LLM with rich fallback."""
    amt = float(record.get('amount') or record.get('TransactionAmount') or 0.0)
    bal = float(record.get('balance') or record.get('AccountBalance') or 0.0)
    logins = int(float(record.get('login_attempts') or record.get('LoginAttempts') or 1))
    vel_count = int(float(record.get('velocity_12h') or record.get('Txn_Count_12H') or 1))
    vel_sum = float(record.get('velocity_24h_sum') or record.get('Txn_Sum_24H') or amt)
    channel = str(record.get('channel') or record.get('Channel') or "Online")
    ttype = str(record.get('transaction_type') or record.get('TransactionType') or "Payment")
    occ = str(record.get('occupation') or record.get('CustomerOccupation') or "Professional")
    risk_lvl = str(record.get('risk_level', 'HIGH'))

    if not (triggered_rules or is_ml_anomaly or risk_lvl in ('CRITICAL', 'HIGH')):
        return "Normal account activity: Spending amount and transaction frequency match regular account patterns."

    # Try Groq AI if client exists
    if groq_client:
        try:
            pct_drain = f"{(amt / (bal + 1e-5)) * 100:.0f}%" if bal > 0 else "N/A"
            rules_str = ', '.join(triggered_rules) if triggered_rules else 'None'
            
            prompt = (
                f"Analyze this suspicious bank transaction and write a 1-2 sentence explanation in simple, natural English explaining why it was flagged:\n\n"
                f"- Transaction: ${amt:,.2f} ({ttype}) via {channel}\n"
                f"- Customer Occupation: {occ}\n"
                f"- Account Balance: ${bal:,.2f} (This transaction drains {pct_drain} of balance)\n"
                f"- Failed/Repeated Login Attempts: {logins}\n"
                f"- 12-Hour Activity: {vel_count} txns (${vel_sum:,.2f} in 24h)\n"
                f"- Triggered Safety Rules: {rules_str}\n"
                f"- Model Diagnostics: Isolation Score={iso_score:.3f}, Autoencoder MSE={mse:.3f}\n"
                f"- Assigned Risk Tier: {risk_lvl}\n\n"
                f"Instructions:\n"
                f"1. Start the sentence with 'Anomaly detected:'.\n"
                f"2. Mention the specific numbers (e.g. ${amt:,.2f}, {logins} login attempts, balance drain, channel) that caused the alarm.\n"
                f"3. Do NOT include thinking tags, chain of thought, or markdown headers. Output only the 1-2 final sentences."
            )
            
            completion = await groq_client.chat.completions.create(
                model="groq/compound-mini",
                messages=[
                    {
                        "role": "system", 
                        "content": "You are a professional bank fraud analyst. You explain why a transaction is anomalous in 1 to 2 clear, specific, human-friendly sentences in plain English using the exact figures provided. Always start with 'Anomaly detected:'."
                    },
                    {"role": "user", "content": prompt}
                ],
                max_tokens=120,
                temperature=0.3
            )
            explanation = completion.choices[0].message.content.strip()
            
            # Strip thinking tags or thought process if present
            explanation = re.sub(r'<think>.*?</think>', '', explanation, flags=re.DOTALL).strip()
            if "<think>" in explanation:
                explanation = explanation.split("<think>")[-1].strip()
            if "Here's a thinking process:" in explanation:
                explanation = explanation.split("Here's a thinking process:")[-1].strip()
            
            # Normalize unicode characters
            explanation = explanation.replace('\u2011', '-').replace('\u2013', '-').replace('\u2014', '--')
            explanation = explanation.replace('\u2018', "'").replace('\u2019', "'").replace('\u201c', '"').replace('\u201d', '"')
            explanation = explanation.strip('"\'* \n')
            
            if explanation and len(explanation) > 15:
                return explanation
        except Exception as groq_err:
            print(f"Groq explanation fallback triggered: {groq_err}")

    # Fallback to high-quality dynamic contextual builder
    return build_contextual_explanation(record, triggered_rules, is_ml_anomaly, iso_score, mse, risk_lvl)


def process_dataframe(df: pd.DataFrame) -> List[dict]:
    """Applies feature engineering, Autoencoder reconstruction, Isolation Forest scoring, and calibrated ensemble rules."""
    preprocessor = ml_artifacts.get("preprocessor")
    ae = ml_artifacts.get("autoencoder")
    iso = ml_artifacts.get("isolation_forest")

    # If models are not loaded, load them on the fly
    if not all([preprocessor, ae, iso]):
        import joblib
        p_path = find_model_path(["preprocessor.joblib"])
        a_path = find_model_path(["autoencoder_model.joblib", "autoencoder.joblib"])
        i_path = find_model_path(["isolation_forest_model.joblib", "isolation_forest.joblib"])
        if p_path and a_path and i_path:
            preprocessor = joblib.load(p_path)
            ae = joblib.load(a_path)
            iso = joblib.load(i_path)
            relax_unknown_categories(preprocessor)
            ml_artifacts["preprocessor"] = preprocessor
            ml_artifacts["autoencoder"] = ae
            ml_artifacts["isolation_forest"] = iso

    # 1. Feature Velocity Calculation
    df = compute_velocity_features(df)

    # 2. Robust Domain Feature Engineering & Defaults for Preprocessor
    if "TransactionAmount" not in df.columns:
        df["TransactionAmount"] = 0.0
    df["TransactionAmount"] = pd.to_numeric(df["TransactionAmount"], errors="coerce").fillna(0.0)

    if "AccountBalance" not in df.columns:
        df["AccountBalance"] = 0.0
    df["AccountBalance"] = pd.to_numeric(df["AccountBalance"], errors="coerce").fillna(0.0)

    df["PercentBalance"] = df["TransactionAmount"] / (df["AccountBalance"] + 1e-5)

    if "AmountBalance" not in df.columns:
        df["AmountBalance"] = df["TransactionAmount"] - df["AccountBalance"]
    df["AmountBalance"] = pd.to_numeric(df["AmountBalance"], errors="coerce").fillna(0.0)

    if "CustomerAge" not in df.columns:
        df["CustomerAge"] = 35
    df["CustomerAge"] = pd.to_numeric(df["CustomerAge"], errors="coerce").fillna(35)

    if "TransactionDuration" not in df.columns:
        df["TransactionDuration"] = 60.0
    df["TransactionDuration"] = pd.to_numeric(df["TransactionDuration"], errors="coerce").fillna(60.0)

    if "LoginAttempts" not in df.columns:
        df["LoginAttempts"] = 1.0
    df["LoginAttempts"] = pd.to_numeric(df["LoginAttempts"], errors="coerce").fillna(1.0)

    if "TransactionPreviousDifferenceDays" not in df.columns:
        df["TransactionPreviousDifferenceDays"] = 0.0
    df["TransactionPreviousDifferenceDays"] = pd.to_numeric(df["TransactionPreviousDifferenceDays"], errors="coerce").fillna(0.0)

    # Temporal features
    if "Timestamp" in df.columns:
        dt = pd.to_datetime(df["Timestamp"], errors="coerce")
        df["DayOfWeek"] = dt.dt.dayofweek.fillna(0).astype(int)
        df["Month"] = dt.dt.month.fillna(1).astype(int)
        df["Hour"] = dt.dt.hour.fillna(12).astype(int)
    else:
        df["DayOfWeek"] = 0
        df["Month"] = 1
        df["Hour"] = 12

    # Standard identifier & metadata column defaults
    if "IP Address" not in df.columns:
        df["IP Address"] = df.get("IPAddress", "192.168.1.1")
    if "TransactionID" not in df.columns:
        df["TransactionID"] = "TXN_UNKNOWN"
    if "AccountID" not in df.columns:
        df["AccountID"] = "ACC_UNKNOWN"
    if "TransactionDate" not in df.columns:
        df["TransactionDate"] = datetime.now(timezone.utc).isoformat()
    if "TransactionTime" not in df.columns:
        df["TransactionTime"] = "12:00:00"
    if "DeviceID" not in df.columns:
        df["DeviceID"] = "DEV_UNKNOWN"
    if "MerchantID" not in df.columns:
        df["MerchantID"] = "MERCH_UNKNOWN"

    num_cols = ["LoginAttempts", "TransactionDuration", "Txn_Count_12H", "Txn_Sum_24H"]
    for col in num_cols:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    # Fill default values for required categorical columns if missing
    for col in ["TransactionType", "Location", "Channel", "CustomerOccupation"]:
        if col not in df.columns:
            df[col] = "Unknown"
        df[col] = df[col].fillna("Unknown").astype(str)

    # 3. Vectorized ML Inference
    if preprocessor and ae and iso:
        X_proc = preprocessor.transform(df)
        if hasattr(X_proc, "toarray"):
            X_proc = X_proc.toarray()

        X_pred = ae.predict(X_proc)
        mses = np.mean(np.power(X_proc - X_pred, 2), axis=1)

        X_hybrid = np.hstack((X_proc, mses.reshape(-1, 1)))
        raw_predictions = iso.predict(X_hybrid)
        iso_scores = -iso.score_samples(X_hybrid)
    else:
        # Fallback heuristic if models unavailable
        mses = np.zeros(len(df))
        raw_predictions = np.ones(len(df))
        iso_scores = np.zeros(len(df))

    # Dynamic percentiles for population-calibrated anomaly detection
    mse_95 = float(np.percentile(mses, 95)) if len(mses) > 10 else 1.0
    mse_99 = float(np.percentile(mses, 99)) if len(mses) > 10 else 1.15
    iso_95 = float(np.percentile(iso_scores, 95)) if len(iso_scores) > 10 else 0.435
    iso_99 = float(np.percentile(iso_scores, 99)) if len(iso_scores) > 10 else 0.445

    results = []
    
    for idx in range(len(df)):
        row = df.iloc[idx]
        row_dict = row.to_dict()
        
        # 1. Deterministic Rule Evaluation
        rule_fraud, triggered_rules = apply_business_rules(row_dict)
        
        cur_iso = float(iso_scores[idx])
        cur_mse = float(mses[idx])
        cur_logins = float(row.get("LoginAttempts", 1))
        cur_amt = float(row.get("TransactionAmount", 0.0))
        cur_vel = float(row.get("Txn_Count_12H", 1))
        cur_pct_bal = float(row.get("PercentBalance", 0.0))
        is_iso_outlier = bool(raw_predictions[idx] == -1)

        # 2. Calibrated Multi-Factor Risk Categorization
        rule_critical = (cur_logins >= 5) | (cur_amt >= 50000) | ((str(row.get("TransactionType", "")).lower() == "transfer") & (cur_pct_bal > 0.90) & (cur_amt > 10000))
        ml_critical = (cur_iso >= iso_99) | ((cur_iso >= iso_95) & (cur_mse >= mse_99))

        rule_high = (cur_logins >= 4) | (cur_amt >= 25000) | (cur_vel >= 15)
        ml_high = (is_iso_outlier & (cur_mse >= mse_95)) | (cur_iso >= iso_95)

        ml_medium = is_iso_outlier | (cur_mse >= mse_95) | (cur_logins >= 3) | (cur_iso >= 0.420)

        if rule_critical or ml_critical or rule_fraud:
            risk_level = "CRITICAL"
        elif rule_high or ml_high:
            risk_level = "HIGH"
        elif ml_medium:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"

        # Actionable fraud flag: CRITICAL and HIGH severity tiers require investigation
        is_fraud_bool = bool(risk_level in ("CRITICAL", "HIGH"))
        is_ml_anomaly = bool(ml_critical or ml_high or ml_medium)

        # Build initial contextual explanation
        base_explanation = build_contextual_explanation(
            row_dict,
            triggered_rules,
            is_ml_anomaly,
            cur_iso,
            cur_mse,
            risk_level
        )

        txn_date_val = str(row.get("TransactionDate") or row.get("Timestamp") or datetime.now(timezone.utc).isoformat())

        record = {
            "transaction_id": str(row.get("TransactionID") or f"TXN_{idx}_{int(datetime.now().timestamp())}"),
            "account_id": str(row.get("AccountID") or "ACC_UNKNOWN"),
            "amount": cur_amt,
            "account_balance": float(row.get("AccountBalance", 0.0)),
            "balance": float(row.get("AccountBalance", 0.0)),
            "is_fraud": is_fraud_bool,
            "risk_level": risk_level,
            "isolation_score": float(round(cur_iso, 4)),
            "autoencoder_mse": float(round(cur_mse, 4)),
            "velocity_12h": cur_vel,
            "velocity_24h_sum": float(round(float(row.get("Txn_Sum_24H", cur_amt)), 2)),
            "login_attempts": cur_logins,
            "duration": float(row.get("TransactionDuration", 60)),
            "transaction_type": str(row.get("TransactionType", "Payment")),
            "channel": str(row.get("Channel", "Online")),
            "occupation": str(row.get("CustomerOccupation", "Professional")),
            "ai_explanation": base_explanation,
            "created_at": txn_date_val
        }
        results.append(record)

    return results

def format_for_supabase(records: List[dict]) -> List[dict]:
    """Prepares records matching the Supabase table schema (excluding columns not in remote table)."""
    cleaned = []
    for r in records:
        cleaned.append({
            "transaction_id": r.get("transaction_id"),
            "account_id": r.get("account_id"),
            "amount": r.get("amount", 0.0),
            "balance": r.get("balance", r.get("account_balance", 0.0)),
            "velocity_12h": r.get("velocity_12h", 1.0),
            "velocity_24h_sum": r.get("velocity_24h_sum", r.get("amount", 0.0)),
            "login_attempts": r.get("login_attempts", 1.0),
            "duration": r.get("duration", 60.0),
            "transaction_type": r.get("transaction_type", "Payment"),
            "channel": r.get("channel", "Online"),
            "occupation": r.get("occupation", "Professional"),
            "is_fraud": r.get("is_fraud", False),
            "risk_level": r.get("risk_level", "LOW"),
            "isolation_score": r.get("isolation_score", 0.0),
            "autoencoder_mse": r.get("autoencoder_mse", 0.0),
            "ai_explanation": r.get("ai_explanation")
        })
    return cleaned

# ==========================================
# 4. API ENDPOINTS
# ==========================================
@app.get("/")
async def root():
    return {
        "service": "Fraud Triage Engine",
        "status": "online",
        "models_loaded": all(k in ml_artifacts for k in ["preprocessor", "autoencoder", "isolation_forest"]),
        "groq_enabled": groq_client is not None,
        "supabase_connected": supabase is not None,
        "history_count": len(in_memory_transactions)
    }

@app.get("/metrics")
async def get_metrics():
    """Returns core mathematical evaluation and system metrics."""
    return {
        "silhouette_score": 0.5915,
        "contamination_rate_mean": 0.0079,
        "target_operational_budget": 0.0100,
        "models": {
            "preprocessor": "ColumnTransformer (StandardScaler + OneHotEncoder)",
            "autoencoder": "MLPRegressor (Latent Representation MSE)",
            "isolation_forest": "IsolationForest (Contamination=0.01, Estimators=100)"
        },
        "engine_status": "Active (Deterministic Rules + Hybrid Unsupervised ML + Groq LLM Diagnostics)"
    }

@app.get("/history")
async def get_history(limit: int = HISTORY_LIMIT_DEFAULT):
    """Retained transactions for the console, newest first."""
    capped = max(1, min(limit, HISTORY_LIMIT_MAX))

    records = list(reversed(in_memory_transactions[-capped:]))
    for r in records:
        if "source" not in r or not r["source"]:
            tid = str(r.get("transaction_id") or "")
            if tid.startswith("TXN_LIVE") or tid.startswith("TXN_SIM") or tid.startswith("STREAM"):
                r["source"] = SOURCE_STREAM
            elif tid.startswith("TXN_UPLOAD") or tid.startswith("BATCH") or tid.startswith("UPLOAD"):
                r["source"] = SOURCE_UPLOAD
            elif tid.startswith("TXN_MANUAL") or tid.startswith("TXN-") or tid.startswith("MANUAL"):
                r["source"] = SOURCE_MANUAL
            else:
                r["source"] = SOURCE_SEED
    return records

@app.post("/predict")
async def predict_single_transaction(payload: TransactionPayload):
    """Real-time single transaction triage with rules, ML, and optional Groq explanation."""
    try:
        raw_dict = payload.model_dump()
        df_single = pd.DataFrame([raw_dict])
        
        processed_list = process_dataframe(df_single)
        record = processed_list[0]
        record["source"] = SOURCE_MANUAL
        
        # Check if we should generate deep LLM explanation
        rule_fraud, triggered_rules = apply_business_rules(raw_dict)
        is_ml_anomaly = record["is_fraud"] or record["isolation_score"] >= 0.50
        
        if groq_client and (rule_fraud or is_ml_anomaly or record["risk_level"] in ("CRITICAL", "HIGH")):
            deep_explanation = await generate_ai_explanation(
                record,
                triggered_rules,
                is_ml_anomaly,
                record["isolation_score"],
                record["autoencoder_mse"]
            )
            record["ai_explanation"] = deep_explanation

        # Record into in-memory store
        remember([record], SOURCE_MANUAL)

        # Sync to Supabase if connected
        if supabase:
            try:
                db_payload = format_for_supabase([record])
                supabase.table("transactions").insert(db_payload).execute()
            except Exception as db_err:
                print(f"DB single insert error: {db_err}")

        return record
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")

@app.post("/upload-csv")
async def upload_csv_batch(file: UploadFile = File(...)):
    """Batch upload CSV processing endpoint."""
    try:
        contents = await file.read()
        df = pd.read_csv(io.StringIO(contents.decode("utf-8")))

        # If TransactionID is missing or standard, prefix with TXN_UPLOAD
        if "TransactionID" not in df.columns:
            df["TransactionID"] = [f"TXN_UPLOAD_{int(datetime.now().timestamp())}_{i}" for i in range(len(df))]

        results = process_dataframe(df)
        for r in results:
            r["source"] = SOURCE_UPLOAD

        # Generate Groq AI explanation for top flagged anomalies in batch
        if groq_client:
            flagged = [r for r in results if r.get("is_fraud") or r.get("risk_level") in ("CRITICAL", "HIGH")]
            for rec in flagged[:10]:
                rule_fraud, triggered_rules = apply_business_rules(rec)
                try:
                    ai_exp = await generate_ai_explanation(
                        rec,
                        triggered_rules,
                        rec.get("is_fraud", False),
                        rec.get("isolation_score", 0.0),
                        rec.get("autoencoder_mse", 0.0)
                    )
                    rec["ai_explanation"] = ai_exp
                except Exception as exp_err:
                    print(f"Batch AI explanation note: {exp_err}")

        # Update in-memory stream buffer
        remember(results, SOURCE_UPLOAD)

        # Save to Supabase in chunks if available
        if supabase and results:
            db_records = format_for_supabase(results)
            CHUNK_SIZE = 500
            for i in range(0, len(db_records), CHUNK_SIZE):
                chunk = db_records[i:i + CHUNK_SIZE]
                try:
                    supabase.table("transactions").insert(chunk).execute()
                except Exception as db_err:
                    print(f"Supabase batch insert error: {db_err}")

        return {
            "total_processed": len(results),
            "flagged_fraud": sum(1 for r in results if r["is_fraud"]),
            "critical_count": sum(1 for r in results if r["risk_level"] == "CRITICAL"),
            "high_count": sum(1 for r in results if r["risk_level"] == "HIGH"),
            "data": results[:20]
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/simulate")
async def simulate_stream(count: int = 5):
    """Simulates new incoming transactions from the dataset or synthetic variations."""
    try:
        sample_csv = BASE_DIR / "bank_transactions_data_2.csv"
        now_ts = int(datetime.now().timestamp())
        now_str = datetime.now(timezone.utc).isoformat()

        if sample_csv.exists():
            full_df = pd.read_csv(sample_csv)
            sample_df = full_df.sample(min(count, len(full_df))).copy()
            sample_df['TransactionDate'] = now_str
            sample_df['TransactionID'] = [f"TXN_LIVE_{now_ts}_{i}" for i in range(len(sample_df))]
            
            # Inject a realistic anomaly into 1 of the samples to demonstrate real-time alert trigger
            if len(sample_df) > 0:
                sample_df.iloc[0, sample_df.columns.get_loc('TransactionAmount')] = 18500.0
                sample_df.iloc[0, sample_df.columns.get_loc('LoginAttempts')] = 5
                sample_df.iloc[0, sample_df.columns.get_loc('AccountBalance')] = 12000.0
                types = [str(t) for t in full_df['TransactionType'].dropna().unique()] if 'TransactionType' in full_df.columns else []
                if "Transfer" in types:
                    sample_df.iloc[0, sample_df.columns.get_loc('TransactionType')] = "Transfer"
        else:
            sample_df = pd.DataFrame([{
                "TransactionID": f"TXN_LIVE_{now_ts}_{i}",
                "AccountID": f"ACC_{np.random.randint(1000, 9999)}",
                "TransactionDate": now_str,
                "TransactionAmount": float(np.random.choice([45.0, 120.0, 890.0, 18500.0])),
                "AccountBalance": 12000.0,
                "LoginAttempts": float(np.random.choice([1, 1, 2, 5])),
                "TransactionDuration": float(np.random.randint(20, 240)),
                "TransactionType": np.random.choice(["Debit", "Credit", "Transfer"]),
                "Channel": np.random.choice(["Online", "ATM", "Branch"]),
                "CustomerOccupation": np.random.choice(["Doctor", "Engineer", "Retail", "Retired"]),
            } for i in range(count)])

        results = process_dataframe(sample_df)
        for r in results:
            r["source"] = SOURCE_STREAM

        # Generate Groq AI explanation on flagged/anomalous simulated transactions
        if groq_client:
            for rec in results:
                if rec.get("is_fraud") or rec.get("risk_level") in ("CRITICAL", "HIGH") or rec.get("isolation_score", 0) >= 0.50:
                    rule_fraud, triggered_rules = apply_business_rules(rec)
                    try:
                        ai_exp = await generate_ai_explanation(
                            rec,
                            triggered_rules,
                            rec.get("is_fraud", False),
                            rec.get("isolation_score", 0.0),
                            rec.get("autoencoder_mse", 0.0)
                        )
                        rec["ai_explanation"] = ai_exp
                    except Exception as exp_err:
                        print(f"Simulation AI explanation error: {exp_err}")

        remember(results, SOURCE_STREAM)

        if supabase:
            try:
                db_records = format_for_supabase(results)
                supabase.table("transactions").insert(db_records).execute()
            except Exception as db_err:
                print(f"Supabase simulation sync error: {db_err}")

        return {
            "status": "success",
            "simulated_count": len(results),
            "flagged": sum(1 for r in results if r["is_fraud"]),
            "latest": results[-1] if results else None
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/history")
async def clear_history():
    """Clears recent in-memory buffer and persistent history."""
    in_memory_transactions.clear()
    supabase_cleared = 0
    if supabase:
        try:
            res = supabase.table("transactions").delete().neq("transaction_id", "_impossible_id_").execute()
            supabase_cleared = len(res.data) if res.data else 0
        except Exception as db_err:
            print(f"Supabase clear history error: {db_err}")
    return {"status": "cleared", "deleted": True, "remaining": 0, "supabase_cleared": supabase_cleared}


class HistoryDeleteRequest(BaseModel):
    """What to remove from the retention buffer.

    Two ways to say it, and they compose: an explicit list of ids for a hand-made
    selection, and a list of origins for "drop everything the simulator produced".
    """

    transaction_ids: List[str] = Field(default_factory=list)
    sources: List[str] = Field(default_factory=list)


@app.post("/history/delete")
async def delete_history_rows(payload: HistoryDeleteRequest):
    """Removes specific retained rows, by id and/or by origin."""
    ids = {str(tid).strip() for tid in payload.transaction_ids if tid}
    sources = {str(s).strip() for s in payload.sources if s in KNOWN_SOURCES}

    if not ids and not sources:
        raise HTTPException(
            status_code=400,
            detail=(
                "Nothing to delete. Supply transaction_ids, sources, or call "
                "DELETE /history to empty the whole buffer."
            ),
        )

    unknown = sorted(set(payload.sources) - set(KNOWN_SOURCES))
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown source(s): {', '.join(unknown)}. Known: {', '.join(KNOWN_SOURCES)}.",
        )

    def condemned(record: dict) -> bool:
        tid = str(record.get("transaction_id") or record.get("id") or record.get("TransactionID") or "").strip()
        if tid and tid in ids:
            return True
        rec_source = str(record.get("source") or SOURCE_UPLOAD).strip()
        return bool(sources) and rec_source in sources

    # Resolve doomed IDs from buffer
    doomed_ids = [
        str(r.get("transaction_id") or r.get("id") or r.get("TransactionID") or "").strip()
        for r in in_memory_transactions
        if condemned(r) and (r.get("transaction_id") or r.get("id") or r.get("TransactionID"))
    ]
    if ids:
        doomed_ids = list(set(doomed_ids).union(ids))

    kept = [r for r in in_memory_transactions if not condemned(r)]
    removed = len(in_memory_transactions) - len(kept)
    in_memory_transactions[:] = kept

    supabase_removed = 0
    if supabase and doomed_ids:
        CHUNK_SIZE = 200
        for i in range(0, len(doomed_ids), CHUNK_SIZE):
            chunk = doomed_ids[i:i + CHUNK_SIZE]
            try:
                supabase.table("transactions").delete().in_("transaction_id", chunk).execute()
                supabase_removed += len(chunk)
            except Exception as db_err:
                print(f"Supabase delete error: {db_err}")

    return {
        "status": "deleted",
        "deleted": max(removed, len(ids)),
        "deleted_in_supabase": supabase_removed,
        "remaining": len(in_memory_transactions),
    }


@app.get("/history/sources")
async def history_sources():
    """Retained row counts by origin — what a bulk delete would actually take."""
    counts = {source: 0 for source in KNOWN_SOURCES}
    for record in in_memory_transactions:
        source = record.get("source", SOURCE_UPLOAD)
        counts[source] = counts.get(source, 0) + 1
    return {
        "total": len(in_memory_transactions),
        "counts": counts,
        "synthetic_sources": list(SYNTHETIC_SOURCES),
    }