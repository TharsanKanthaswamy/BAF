import os
import sys
import numpy as np
import pandas as pd
import joblib
from pathlib import Path
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import IsolationForest
import tensorflow as tf
from tensorflow.keras import layers, models, regularizers

# Suppress TensorFlow logging warnings
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

def load_and_preprocess_data(file_path: str = "bank_transactions_final.xlsx"):
    print("=" * 70)
    print(" 1. LOADING DATASET")
    print("=" * 70)
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Dataset not found at '{file_path}'")
    
    df = pd.read_excel(file_path)
    print(f"[+] Loaded dataset successfully: {df.shape[0]:,} rows, {df.shape[1]} columns")
    
    # Feature Engineering
    print("\n[+] Engineering domain features...")
    df['PercentBalance'] = df['TransactionAmount'] / (df['AccountBalance'] + 1e-5)
    
    if 'TransactionDate' in df.columns:
        df['TransactionDate'] = pd.to_datetime(df['TransactionDate'], errors='coerce')
        df['DayOfWeek'] = df['TransactionDate'].dt.dayofweek.fillna(0).astype(int)
        df['Month'] = df['TransactionDate'].dt.month.fillna(1).astype(int)
    else:
        df['DayOfWeek'] = 0
        df['Month'] = 1

    if 'TransactionTime' in df.columns:
        try:
            df['Hour'] = pd.to_datetime(df['TransactionTime'].astype(str), format='%H:%M:%S', errors='coerce').dt.hour.fillna(12).astype(int)
        except Exception:
            df['Hour'] = 12
    else:
        df['Hour'] = 12

    # Define Feature Sets
    numeric_features = [
        'TransactionAmount',
        'AccountBalance',
        'PercentBalance',
        'CustomerAge',
        'TransactionDuration',
        'LoginAttempts',
        'AmountBalance',
        'TransactionPreviousDifferenceDays',
        'Hour',
        'DayOfWeek'
    ]
    # Keep only available numeric features
    numeric_features = [col for col in numeric_features if col in df.columns]

    categorical_features = [
        'TransactionType',
        'Location',
        'Channel',
        'CustomerOccupation'
    ]
    # Keep only available categorical features
    categorical_features = [col for col in categorical_features if col in df.columns]

    print(f"    - Numerical Features ({len(numeric_features)}): {numeric_features}")
    print(f"    - Categorical Features ({len(categorical_features)}): {categorical_features}")

    # Build Preprocessor Pipeline
    preprocessor = ColumnTransformer(
        transformers=[
            ('num', StandardScaler(), numeric_features),
            ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), categorical_features)
        ]
    )

    X_processed = preprocessor.fit_transform(df)
    print(f"[+] Feature matrix transformed: shape = {X_processed.shape}")

    return df, X_processed, preprocessor

def build_autoencoder(input_dim: int):
    """Builds a Symmetric Deep Autoencoder for Reconstructive Anomaly Detection."""
    inputs = layers.Input(shape=(input_dim,), name="input_layer")
    
    # Encoder
    x = layers.Dense(64, activation="relu", activity_regularizer=regularizers.l1(1e-5))(inputs)
    x = layers.BatchNormalization()(x)
    x = layers.Dropout(0.1)(x)
    
    x = layers.Dense(32, activation="relu")(x)
    x = layers.BatchNormalization()(x)
    
    latent_space = layers.Dense(16, activation="relu", name="latent_space")(x)
    
    # Decoder
    x = layers.Dense(32, activation="relu")(latent_space)
    x = layers.BatchNormalization()(x)
    x = layers.Dropout(0.1)(x)
    
    x = layers.Dense(64, activation="relu")(x)
    x = layers.BatchNormalization()(x)
    
    outputs = layers.Dense(input_dim, activation="linear", name="output_layer")(x)
    
    autoencoder = models.Model(inputs=inputs, outputs=outputs, name="Fraud_Deep_Autoencoder")
    autoencoder.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=0.001), loss="mse")
    return autoencoder

def train_models(df: pd.DataFrame, X_processed: np.ndarray, preprocessor):
    print("\n" + "=" * 70)
    print(" 2. TRAINING DEEP AUTOENCODER (NEURAL NETWORK)")
    print("=" * 70)
    
    input_dim = X_processed.shape[1]
    autoencoder = build_autoencoder(input_dim)
    autoencoder.summary()
    
    print("\n[+] Training Autoencoder on transaction patterns...")
    history = autoencoder.fit(
        X_processed, X_processed,
        epochs=35,
        batch_size=64,
        validation_split=0.15,
        shuffle=True,
        verbose=1
    )
    
    train_loss = history.history['loss'][-1]
    val_loss = history.history['val_loss'][-1]
    print(f"\n[+] Autoencoder Training Complete: Loss = {train_loss:.5f} | Val Loss = {val_loss:.5f}")

    # Compute Reconstruction Error (MSE)
    print("\n" + "=" * 70)
    print(" 3. TRAINING ISOLATION FOREST ENSEMBLE")
    print("=" * 70)
    
    X_reconstructed = autoencoder.predict(X_processed, verbose=0)
    reconstruction_mse = np.mean(np.power(X_processed - X_reconstructed, 2), axis=1)
    
    # Hybrid Feature representation: Raw Encoded Features + Autoencoder MSE
    X_hybrid = np.hstack((X_processed, reconstruction_mse.reshape(-1, 1)))
    
    # Train Isolation Forest on Hybrid Representation
    print(f"[+] Fitting Isolation Forest on Hybrid representation (Features + MSE)...")
    iso_forest = IsolationForest(
        n_estimators=150,
        contamination=0.03,  # Expected ~3% anomalous/fraudulent rate
        max_samples='auto',
        random_state=42,
        n_jobs=-1
    )
    iso_forest.fit(X_hybrid)
    
    # Generate scores
    iso_predictions = iso_forest.predict(X_hybrid) # 1: normal, -1: anomaly
    raw_scores = -iso_forest.score_samples(X_hybrid) # higher score = more anomalous
    
    # Normalize score between 0 and 1
    norm_anomaly_score = (raw_scores - raw_scores.min()) / (raw_scores.max() - raw_scores.min() + 1e-7)
    
    print("[+] Isolation Forest fit completed.")
    
    return autoencoder, iso_forest, reconstruction_mse, norm_anomaly_score, iso_predictions

def evaluate_and_report(df: pd.DataFrame, mse: np.ndarray, anomaly_scores: np.ndarray, iso_preds: np.ndarray):
    print("\n" + "=" * 70)
    print(" 4. ANOMALY DETECTION & FRAUD EVALUATION SUMMARY")
    print("=" * 70)
    
    results_df = df.copy()
    results_df['Autoencoder_MSE'] = mse
    results_df['Anomaly_Score'] = anomaly_scores
    results_df['Is_Iso_Anomaly'] = iso_preds == -1
    
    # Define Thresholds
    mse_95th = np.percentile(mse, 95)
    mse_99th = np.percentile(mse, 99)
    results_df['Is_AE_Anomaly'] = results_df['Autoencoder_MSE'] >= mse_95th
    
    # Categorize Risk Levels
    conditions = [
        (results_df['Anomaly_Score'] >= 0.70) | (results_df['LoginAttempts'] >= 4) | (results_df['PercentBalance'] > 0.8),
        (results_df['Anomaly_Score'] >= 0.55) | (results_df['Is_Iso_Anomaly'] == True) | (results_df['Is_AE_Anomaly'] == True),
        (results_df['Anomaly_Score'] >= 0.40) | (results_df['LoginAttempts'] >= 3),
    ]
    choices = ['CRITICAL', 'HIGH', 'MEDIUM']
    results_df['Risk_Level'] = np.select(conditions, choices, default='LOW')
    results_df['Is_Overall_Anomaly'] = results_df['Risk_Level'].isin(['CRITICAL', 'HIGH', 'MEDIUM'])
    
    total_txns = len(results_df)
    total_anomalies = int(results_df['Is_Overall_Anomaly'].sum())
    anomaly_pct = (total_anomalies / total_txns) * 100
    
    print(f"Total Transactions in Dataset : {total_txns:,}")
    print(f"\n[***] TOTAL ANOMALIES DETECTED : {total_anomalies:,} / {total_txns:,} ({anomaly_pct:.2f}%)")
    print(f"      - Normal Transactions     : {total_txns - total_anomalies:,} ({100 - anomaly_pct:.2f}%)")
    
    print("\n[+] Detailed Risk-Tier Breakdown:")
    risk_order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
    for risk in risk_order:
        count = int((results_df['Risk_Level'] == risk).sum())
        pct = (count / total_txns) * 100
        print(f"    - {risk:<10}: {count:>5} transactions ({pct:>5.1f}%)")
        
    print("\n[+] Anomalies Count by Detection Mechanism:")
    iso_count = int(results_df['Is_Iso_Anomaly'].sum())
    ae_count = int(results_df['Is_AE_Anomaly'].sum())
    hybrid_count = int((results_df['Is_Iso_Anomaly'] & results_df['Is_AE_Anomaly']).sum())
    login_anom = int((results_df['LoginAttempts'] >= 3).sum())
    balance_drain_anom = int((results_df['PercentBalance'] > 0.7).sum())
    
    print(f"    - Isolation Forest Outliers             : {iso_count:>5} ({iso_count/total_txns*100:.1f}%)")
    print(f"    - Autoencoder Reconstruction Outliers   : {ae_count:>5} ({ae_count/total_txns*100:.1f}%) [MSE >= {mse_95th:.4f}]")
    print(f"    - Dual-Flagged (Both AE + Isolation)    : {hybrid_count:>5} ({hybrid_count/total_txns*100:.1f}%)")
    print(f"    - High Login Attempts (>= 3 tries)      : {login_anom:>5} ({login_anom/total_txns*100:.1f}%)")
    print(f"    - High Balance Depletion (> 70% of bal) : {balance_drain_anom:>5} ({balance_drain_anom/total_txns*100:.1f}%)")

    print("\n[+] Reconstruction Loss (MSE) Statistics:")
    print(f"    - Mean MSE     : {mse.mean():.6f}")
    print(f"    - Median MSE   : {np.median(mse):.6f}")
    print(f"    - 95th %-tile  : {mse_95th:.6f}")
    print(f"    - 99th %-tile  : {mse_99th:.6f}")
    print(f"    - Max MSE      : {mse.max():.6f}")

    # Top Flagged Suspicious Transactions
    top_flagged = results_df[results_df['Is_Overall_Anomaly']].sort_values(by='Anomaly_Score', ascending=False)
    print("\n" + "=" * 70)
    print(" 5. TOP SUSPICIOUS TRANSACTIONS DETECTED (Sample of Top 10)")
    print("=" * 70)
    
    cols_to_show = [
        'TransactionID', 'AccountID', 'TransactionAmount', 
        'AccountBalance', 'LoginAttempts', 'Risk_Level', 'Anomaly_Score', 'Autoencoder_MSE'
    ]
    cols_available = [c for c in cols_to_show if c in top_flagged.columns]
    print(top_flagged[cols_available].head(10).to_string(index=False))
    
    # Export all anomalies to CSV for inspection
    anomalies_export_path = "flagged_anomalies.csv"
    top_flagged.to_csv(anomalies_export_path, index=False)
    print(f"\n[+] Full export of all {len(top_flagged)} anomalous records saved to: {anomalies_export_path}")
    
    return results_df

def save_model_artifacts(preprocessor, autoencoder, iso_forest, output_dir: str = "models"):
    print("\n" + "=" * 70)
    print(" 6. SAVING MODEL ARTIFACTS")
    print("=" * 70)
    
    os.makedirs(output_dir, exist_ok=True)
    
    preprocessor_path = os.path.join(output_dir, "preprocessor.joblib")
    iso_path = os.path.join(output_dir, "isolation_forest_model.joblib")
    ae_keras_path = os.path.join(output_dir, "autoencoder_model.keras")
    
    joblib.dump(preprocessor, preprocessor_path)
    joblib.dump(iso_forest, iso_path)
    autoencoder.save(ae_keras_path)
    
    print(f"[+] Preprocessor saved to       : {preprocessor_path}")
    print(f"[+] Isolation Forest saved to  : {iso_path}")
    print(f"[+] Keras Autoencoder saved to : {ae_keras_path}")
    print("\n[SUCCESS] All models successfully trained, evaluated, and exported!")

if __name__ == "__main__":
    # Execute end-to-end pipeline
    df, X_processed, preprocessor = load_and_preprocess_data("bank_transactions_final.xlsx")
    autoencoder, iso_forest, mse, anomaly_scores, iso_preds = train_models(df, X_processed, preprocessor)
    results_df = evaluate_and_report(df, mse, anomaly_scores, iso_preds)
    save_model_artifacts(preprocessor, autoencoder, iso_forest)
