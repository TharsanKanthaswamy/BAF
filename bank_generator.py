import os
import sys
import random
import argparse
from datetime import datetime, timedelta
import numpy as np
import pandas as pd

# Define domain constants matching model.py expectations
CITIES = [
    'Fort Worth', 'Los Angeles', 'Oklahoma City', 'Charlotte', 'Philadelphia', 
    'Tucson', 'Omaha', 'Miami', 'Houston', 'Detroit', 'Memphis', 'Denver', 
    'Mesa', 'Atlanta', 'Seattle', 'Kansas City', 'Boston', 'Chicago', 
    'Jacksonville', 'Colorado Springs', 'Fresno', 'San Diego', 'Raleigh', 
    'Austin', 'San Jose', 'San Antonio', 'Indianapolis', 'New York', 
    'San Francisco', 'Nashville', 'Las Vegas', 'Milwaukee', 'Virginia Beach', 
    'Phoenix', 'Columbus', 'Sacramento', 'Louisville', 'Baltimore', 
    'Dallas', 'Washington', 'El Paso', 'Portland', 'Albuquerque'
]

CHANNELS = ['ATM', 'Online', 'Branch']
TRANSACTION_TYPES = ['Debit', 'Credit']
OCCUPATIONS = ['Student', 'Doctor', 'Engineer', 'Retired']


def generate_ip():
    """Generates a random valid IPv4 address."""
    return f"{random.randint(11, 220)}.{random.randint(1, 254)}.{random.randint(1, 254)}.{random.randint(1, 254)}"


def generate_transactions(
    n_samples: int = 2500,
    fraud_rate: float = 0.03,
    num_accounts: int = 500,
    num_devices: int = 700,
    num_merchants: int = 100,
    start_date: str = "2023-01-01",
    end_date: str = "2023-12-31",
    random_seed: int = 42
) -> pd.DataFrame:
    """
    Generates synthetic bank transactions matching the feature schema expected by model.py.
    
    Features generated:
      - TransactionID: Unique identifier (e.g., TX000001)
      - AccountID: Account identifier (e.g., AC00128)
      - TransactionAmount: Monetary value of the transaction
      - TransactionDate: Date of transaction (YYYY-MM-DD)
      - TransactionTime: Time of transaction (HH:MM:SS)
      - TransactionType: 'Debit' or 'Credit'
      - Location: US City
      - DeviceID: Device identifier (e.g., D000380)
      - IP Address: IPv4 address
      - MerchantID: Merchant identifier (e.g., M015)
      - Channel: 'Branch', 'ATM', 'Online'
      - CustomerAge: Age of customer (18 - 80)
      - CustomerOccupation: 'Student', 'Doctor', 'Engineer', 'Retired'
      - TransactionDuration: Duration in seconds (10 - 300)
      - LoginAttempts: Number of login attempts before transaction (1 - 5)
      - AccountBalance: Customer's account balance
      - AmountBalance: Ratio of TransactionAmount / AccountBalance
      - TransactionPreviousDifferenceDays: Days elapsed since previous transaction
    """
    np.random.seed(random_seed)
    random.seed(random_seed)

    # Pre-generate consistent customer account profiles
    account_ids = [f"AC{i+1:05d}" for i in range(num_accounts)]
    customer_profiles = {}
    for acc in account_ids:
        occupation = random.choice(OCCUPATIONS)
        if occupation == 'Student':
            age = int(np.random.randint(18, 30))
            base_balance = float(np.random.uniform(500, 4000))
        elif occupation == 'Retired':
            age = int(np.random.randint(60, 81))
            base_balance = float(np.random.uniform(5000, 30000))
        elif occupation == 'Doctor':
            age = int(np.random.randint(30, 65))
            base_balance = float(np.random.uniform(6000, 45000))
        else: # Engineer
            age = int(np.random.randint(24, 60))
            base_balance = float(np.random.uniform(3000, 25000))

        home_city = random.choice(CITIES)
        customer_profiles[acc] = {
            'occupation': occupation,
            'age': age,
            'balance': base_balance,
            'home_city': home_city,
            'device_id': f"D{random.randint(1, num_devices):06d}",
            'ip_address': generate_ip()
        }

    device_pool = [f"D{i+1:06d}" for i in range(num_devices)]
    merchant_pool = [f"M{i+1:03d}" for i in range(num_merchants)]

    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d")
    date_range_days = (end_dt - start_dt).days

    records = []
    num_anomalies = int(n_samples * fraud_rate)
    anomaly_indices = set(random.sample(range(n_samples), num_anomalies))

    for i in range(n_samples):
        txn_id = f"TX{i+1:06d}"
        acc_id = random.choice(account_ids)
        profile = customer_profiles[acc_id]

        is_anomaly = i in anomaly_indices

        # Transaction Date & Time
        rand_days = random.randint(0, max(1, date_range_days))
        txn_date = start_dt + timedelta(days=rand_days)
        txn_date_str = txn_date.strftime("%Y-%m-%d")

        # Categorical features
        channel = random.choices(CHANNELS, weights=[0.35, 0.35, 0.30])[0]
        txn_type = random.choices(TRANSACTION_TYPES, weights=[0.77, 0.23])[0]

        # Account Balance variation
        balance_fluctuation = np.random.normal(1.0, 0.05)
        account_balance = round(max(100.0, profile['balance'] * balance_fluctuation), 2)

        # Days since previous transaction
        diff_days = round(float(np.random.uniform(300.0, 670.0)), 6)

        if not is_anomaly:
            # Normal transaction pattern
            hour = random.choices(range(24), weights=[1,1,1,1,1,2,4,6,8,9,10,10,10,9,9,8,7,6,5,4,3,2,1,1])[0]
            minute = random.randint(0, 59)
            second = random.randint(0, 59)
            txn_time_str = f"{hour:02d}:{minute:02d}:{second:02d}"

            location = profile['home_city'] if random.random() < 0.85 else random.choice(CITIES)
            device_id = profile['device_id'] if random.random() < 0.90 else random.choice(device_pool)
            ip_address = profile['ip_address'] if random.random() < 0.90 else generate_ip()
            merchant_id = random.choice(merchant_pool)

            # Normal amount proportional to occupation and balance
            raw_amount = np.random.exponential(scale=min(250.0, account_balance * 0.15))
            txn_amount = round(max(1.0, min(account_balance * 0.45, raw_amount)), 2)

            duration = int(np.random.randint(10, 200))
            login_attempts = 1 if random.random() < 0.92 else 2

        else:
            # Anomalous / Fraudulent transaction patterns
            anomaly_type = random.choice(['balance_drain', 'high_logins', 'midnight_spike', 'rapid_large_outflow'])

            if anomaly_type == 'balance_drain':
                # Large chunk / almost all balance drained (> 70%-95% of balance)
                txn_amount = round(account_balance * random.uniform(0.75, 0.98), 2)
                login_attempts = random.choice([2, 3, 4])
                duration = random.randint(15, 80)
                channel = random.choice(['Online', 'ATM'])
                location = random.choice(CITIES)
                device_id = random.choice(device_pool)
                ip_address = generate_ip()
                merchant_id = random.choice(merchant_pool)
                hour = random.randint(0, 23)

            elif anomaly_type == 'high_logins':
                # Multiple failed login attempts (3 to 5)
                txn_amount = round(np.random.exponential(scale=400.0) + 150.0, 2)
                login_attempts = random.choice([3, 4, 5])
                duration = random.randint(180, 300)
                channel = 'Online'
                location = random.choice(CITIES)
                device_id = random.choice(device_pool)
                ip_address = generate_ip()
                merchant_id = random.choice(merchant_pool)
                hour = random.randint(1, 5)

            elif anomaly_type == 'midnight_spike':
                # Large transaction during late night / early morning hours (1 AM - 4 AM)
                txn_amount = round(random.uniform(800.0, 2500.0), 2)
                login_attempts = random.choice([1, 2, 3])
                duration = random.randint(20, 100)
                channel = random.choice(['Online', 'ATM'])
                location = random.choice(CITIES)
                device_id = random.choice(device_pool)
                ip_address = generate_ip()
                merchant_id = random.choice(merchant_pool)
                hour = random.randint(1, 4)

            else: # rapid_large_outflow
                txn_amount = round(random.uniform(1000.0, 3000.0), 2)
                login_attempts = random.choice([1, 4])
                duration = random.randint(10, 45)
                channel = 'Online'
                location = random.choice(CITIES)
                device_id = random.choice(device_pool)
                ip_address = generate_ip()
                merchant_id = random.choice(merchant_pool)
                hour = random.randint(0, 23)

            minute = random.randint(0, 59)
            second = random.randint(0, 59)
            txn_time_str = f"{hour:02d}:{minute:02d}:{second:02d}"

        # Calculate AmountBalance ratio matching the dataset definition
        amount_balance = float(txn_amount / (account_balance + 1e-5))

        records.append({
            'TransactionID': txn_id,
            'AccountID': acc_id,
            'TransactionAmount': txn_amount,
            'TransactionDate': txn_date_str,
            'TransactionTime': txn_time_str,
            'TransactionType': txn_type,
            'Location': location,
            'DeviceID': device_id,
            'IP Address': ip_address,
            'MerchantID': merchant_id,
            'Channel': channel,
            'CustomerAge': profile['age'],
            'CustomerOccupation': profile['occupation'],
            'TransactionDuration': duration,
            'LoginAttempts': login_attempts,
            'AccountBalance': account_balance,
            'AmountBalance': amount_balance,
            'TransactionPreviousDifferenceDays': diff_days
        })

    df = pd.DataFrame(records)
    # Ensure TransactionDate is datetime type matching Excel output
    df['TransactionDate'] = pd.to_datetime(df['TransactionDate'])
    return df


def save_dataset(df: pd.DataFrame, output_path: str = "bank_transactions_final.xlsx"):
    """Saves DataFrame to either Excel (.xlsx) or CSV (.csv) format."""
    ext = os.path.splitext(output_path)[1].lower()
    if ext in ['.xlsx', '.xls']:
        df.to_excel(output_path, index=False, engine='openpyxl')
    else:
        df.to_csv(output_path, index=False)
    print(f"[+] Dataset successfully generated and saved to: {output_path} ({len(df):,} records)")


def main():
    parser = argparse.ArgumentParser(description="Generate synthetic bank transaction dataset for fraud detection model training.")
    parser.add_argument("--n-samples", type=int, default=2512, help="Number of transaction records to generate (default: 2512)")
    parser.add_argument("--fraud-rate", type=float, default=0.03, help="Fraction of anomalous/fraudulent transactions (default: 0.03)")
    parser.add_argument("--output", type=str, default="bank_transactions_final.xlsx", help="Output file path (.xlsx or .csv, default: bank_transactions_final.xlsx)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility (default: 42)")

    args = parser.parse_args()

    print("=" * 70)
    print(" BANK TRANSACTION SYNTHETIC DATA GENERATOR")
    print("=" * 70)
    print(f"Generating {args.n_samples:,} transactions (Fraud Rate: {args.fraud_rate * 100:.1f}%, Seed: {args.seed})...")

    df = generate_transactions(
        n_samples=args.n_samples,
        fraud_rate=args.fraud_rate,
        random_seed=args.seed
    )

    save_dataset(df, args.output)
    print("\nDataset Summary:")
    print(f"  - Rows: {df.shape[0]:,}, Columns: {df.shape[1]}")
    print(f"  - Features: {list(df.columns)}")
    print("=" * 70)


if __name__ == "__main__":
    main()
