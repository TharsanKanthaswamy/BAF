"use client";

import * as React from "react";
import { LoaderCircle, Play, RotateCcw, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";

import { formatCurrency, formatDecimal, formatScore } from "@/lib/format";
import { RISK_STYLES, normalizeRisk, triageSignals } from "@/lib/risk";
import type { PredictPayload, TransactionRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Panel, PanelBody, PanelHeader } from "@/components/dashboard/panel";

/**
 * The categories the deployed models were actually fitted on.
 *
 * This matters more than it looks. The artifacts were trained on a ledger whose
 * `TransactionType` is only ever Debit or Credit, whose Channel is only ever
 * ATM, Online or Branch, and whose Occupation is one of four. The form used to
 * offer Payment, Withdrawal, Deposit, Mobile and Professional — five values that
 * appear nowhere in that file — and scikit-learn's OneHotEncoder defaults to
 * `handle_unknown="error"`, so scoring any of them took the request down with a
 * 500. The engine now relaxes every fitted encoder to "ignore", which encodes an
 * unseen value as all-zeros rather than raising; but all-zeros is the encoding
 * for "no evidence", so a made-up category quietly stops contributing to the
 * score. Offering the model's own vocabulary is the honest fix.
 *
 * Transfer is the one deliberate exception. The rules engine reads the raw
 * string and has a high-value-transfer rule; since the training ledger contains
 * no transfers, this select is the only way to exercise that rule at all.
 */
const TRANSACTION_TYPES = ["Debit", "Credit", "Transfer"];
const CHANNELS = ["ATM", "Online", "Branch"];
const OCCUPATIONS = ["Doctor", "Engineer", "Student", "Retired"];

/** Form state is all strings — parsing happens once, at submit. */
type FormState = Record<
  | "TransactionID"
  | "AccountID"
  | "TransactionAmount"
  | "AccountBalance"
  | "LoginAttempts"
  | "TransactionDuration"
  | "TransactionType"
  | "Channel"
  | "CustomerOccupation",
  string
>;

interface Preset {
  id: string;
  label: string;
  detail: string;
  expect: string;
  values: Omit<FormState, "TransactionID" | "AccountID">;
}

const PRESETS: Preset[] = [
  {
    id: "baseline",
    label: "Routine purchase",
    detail: "Small amount, healthy balance, one login, unhurried session.",
    expect: "Expected verdict: low risk",
    values: {
      TransactionAmount: "84.20",
      AccountBalance: "6400",
      LoginAttempts: "1",
      TransactionDuration: "142",
      TransactionType: "Debit",
      Channel: "Online",
      CustomerOccupation: "Engineer",
    },
  },
  {
    id: "takeover",
    label: "Account takeover",
    detail:
      "Repeated login failures, then a transfer of almost the whole balance.",
    expect: "Expected verdict: critical",
    values: {
      // Deliberately above both rule thresholds: five login attempts trips the
      // credential rule, and a transfer over $10k that takes more than 90% of the
      // balance trips the high-value-transfer rule. Two independent reasons, so
      // the stated expectation does not rest on the model's judgement.
      TransactionAmount: "11400",
      AccountBalance: "12000",
      LoginAttempts: "5",
      TransactionDuration: "18",
      TransactionType: "Transfer",
      Channel: "Online",
      CustomerOccupation: "Retired",
    },
  },
  {
    id: "card-testing",
    label: "Card testing probe",
    detail: "Trivial amount at machine speed: a validity check, not a purchase.",
    expect: "Expected verdict: medium to high",
    values: {
      TransactionAmount: "1.15",
      AccountBalance: "2300",
      LoginAttempts: "2",
      TransactionDuration: "4",
      TransactionType: "Debit",
      Channel: "ATM",
      CustomerOccupation: "Student",
    },
  },
];

const BURST_SIZES = [5, 20, 50] as const;

function newIds(seed: number): Pick<FormState, "TransactionID" | "AccountID"> {
  return idsFrom(seed.toString(36).toUpperCase().slice(-6));
}

function idsFrom(stamp: string): Pick<FormState, "TransactionID" | "AccountID"> {
  return { TransactionID: `TXN-${stamp}`, AccountID: `ACC-${stamp.slice(0, 4)}` };
}

export function TriageSimulator({
  onPredict,
  onSimulate,
  className,
}: {
  onPredict: (payload: PredictPayload) => Promise<TransactionRecord | null>;
  onSimulate: (count: number) => Promise<void>;
  className?: string;
}) {
  // `useId` is identical on the server and the client, so the first case
  // reference can be rendered on both. Seeding it from the clock instead would
  // either mismatch during hydration or need a second pass to fill in.
  const uid = React.useId();
  const seeded = React.useMemo(
    () => idsFrom(uid.replace(/[^0-9A-Za-z]/g, "").toUpperCase().slice(-6).padStart(6, "0")),
    [uid]
  );

  const [preset, setPreset] = React.useState<Preset>(PRESETS[1]);
  const [form, setForm] = React.useState<FormState>({
    ...seeded,
    ...PRESETS[1].values,
  });
  const [pending, setPending] = React.useState(false);
  const [burst, setBurst] = React.useState<number | null>(null);
  const [verdict, setVerdict] = React.useState<TransactionRecord | null>(null);

  const set = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const applyPreset = (next: Preset) => {
    setPreset(next);
    setForm((prev) => ({ ...prev, ...next.values }));
    setVerdict(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;

    const payload: PredictPayload = {
      TransactionID: form.TransactionID.trim() || `TXN-${Date.now()}`,
      AccountID: form.AccountID.trim() || "ACC-0000",
      TransactionAmount: Number(form.TransactionAmount) || 0,
      AccountBalance: Number(form.AccountBalance) || 0,
      LoginAttempts: Number(form.LoginAttempts) || 1,
      TransactionDuration: Number(form.TransactionDuration) || 0,
      TransactionType: form.TransactionType,
      Channel: form.Channel,
      CustomerOccupation: form.CustomerOccupation,
    };

    setPending(true);
    setVerdict(null);
    try {
      const result = await onPredict(payload);
      if (!result) {
        toast.error("Scoring service did not respond", {
          description: "Check that the FastAPI engine is running, then retry.",
        });
        return;
      }
      setVerdict(result);
      const level = normalizeRisk(result.risk_level);
      const style = RISK_STYLES[level];
      const notify = level === "LOW" ? toast.success : toast.warning;
      notify(`Scored ${style.label.toLowerCase()}`, {
        description: `${payload.TransactionID} · ${formatCurrency(payload.TransactionAmount, true)}`,
      });
      // A fresh id for the next run, so repeated submissions are distinct cases.
      setForm((prev) => ({ ...prev, ...newIds(Date.now()) }));
    } catch (error) {
      toast.error("Scoring failed", {
        description: error instanceof Error ? error.message : "Unknown error.",
      });
    } finally {
      setPending(false);
    }
  };

  const injectBurst = async (count: number) => {
    setBurst(count);
    try {
      await onSimulate(count);
      toast.success(`Injected ${count} synthetic transactions`, {
        description: "The stream and every panel above have been rescored.",
      });
    } catch (error) {
      toast.error("Could not reach the simulator", {
        description: error instanceof Error ? error.message : "Unknown error.",
      });
    } finally {
      setBurst(null);
    }
  };

  return (
    <div className={cn("grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]", className)}>
      <Panel>
        <PanelHeader
          eyebrow="Manual triage"
          title="Score a single instruction"
          description="Sent straight to POST /predict. The ensemble answers with a risk tier, both model residuals, and a narrated rationale."
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => applyPreset(preset)}
              aria-label="Reset the form to the selected scenario"
            >
              <RotateCcw data-icon="inline-start" />
              Reset
            </Button>
          }
        />

        <PanelBody>
          <form onSubmit={submit} className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-eyebrow mb-2">Scenario</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {PRESETS.map((option) => {
                  const active = preset.id === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => applyPreset(option)}
                      className={cn(
                        "pressable rounded-xl p-3 text-left ring-1 ring-inset outline-none",
                        "transition-[background-color,box-shadow] duration-150 ease-[var(--ease-out-quint)]",
                        "focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "bg-muted ring-input"
                          : "bg-transparent ring-border hover:bg-inset"
                      )}
                    >
                      <span className="block text-body font-medium">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-subheadline leading-snug text-muted-foreground">
                        {option.detail}
                      </span>
                      <span className="mt-1.5 block text-subheadline font-medium text-[var(--ink-muted)]">
                        {option.expect}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Transaction ID" htmlFor="sim-txn">
                <Input
                  id="sim-txn"
                  value={form.TransactionID}
                  onChange={(e) => set("TransactionID", e.target.value)}
                  placeholder="TXN-000000"
                  className="figures-tabular"
                />
              </Field>
              <Field label="Account ID" htmlFor="sim-acc">
                <Input
                  id="sim-acc"
                  value={form.AccountID}
                  onChange={(e) => set("AccountID", e.target.value)}
                  placeholder="ACC-0000"
                  className="figures-tabular"
                />
              </Field>
              <Field label="Amount (USD)" htmlFor="sim-amount">
                <Input
                  id="sim-amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={form.TransactionAmount}
                  onChange={(e) => set("TransactionAmount", e.target.value)}
                  className="figures-tabular"
                />
              </Field>
              <Field label="Balance before (USD)" htmlFor="sim-balance">
                <Input
                  id="sim-balance"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={form.AccountBalance}
                  onChange={(e) => set("AccountBalance", e.target.value)}
                  className="figures-tabular"
                />
              </Field>
              <Field
                label="Login attempts"
                htmlFor="sim-logins"
                hint="Three or more is a rule trigger on its own."
              >
                <Input
                  id="sim-logins"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={20}
                  value={form.LoginAttempts}
                  onChange={(e) => set("LoginAttempts", e.target.value)}
                  className="figures-tabular"
                />
              </Field>
              <Field
                label="Session length (s)"
                htmlFor="sim-duration"
                hint="Under 20s reads as automation, not typing."
              >
                <Input
                  id="sim-duration"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={form.TransactionDuration}
                  onChange={(e) => set("TransactionDuration", e.target.value)}
                  className="figures-tabular"
                />
              </Field>

              <Field
                label="Instruction type"
                hint="Debit and Credit are the fitted categories. Transfer is scored by the rules only."
              >
                <Select
                  value={form.TransactionType}
                  onValueChange={(value) => set("TransactionType", value ?? "Debit")}
                >
                  <SelectTrigger aria-label="Instruction type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSACTION_TYPES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Channel">
                <Select
                  value={form.Channel}
                  onValueChange={(value) => set("Channel", value ?? "ATM")}
                >
                  <SelectTrigger aria-label="Channel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Occupation">
                <Select
                  value={form.CustomerOccupation}
                  onValueChange={(value) =>
                    set("CustomerOccupation", value ?? "Engineer")
                  }
                >
                  <SelectTrigger aria-label="Occupation">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OCCUPATIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? (
                  <LoaderCircle
                    data-icon="inline-start"
                    className="animate-spin motion-reduce:animate-none"
                  />
                ) : (
                  <Play data-icon="inline-start" />
                )}
                {pending ? "Scoring…" : "Score instruction"}
              </Button>
              <p className="text-callout text-muted-foreground">
                Scored records join the live stream immediately.
              </p>
            </div>
          </form>
        </PanelBody>
      </Panel>

      <div className="flex flex-col gap-3">
        <Panel>
          <PanelHeader
            eyebrow="Load generator"
            title="Inject a synthetic burst"
            description="Calls POST /simulate. Useful for watching the velocity chart react."
          />
          <PanelBody className="flex flex-wrap gap-2">
            {BURST_SIZES.map((count) => (
              <Button
                key={count}
                variant="outline"
                size="lg"
                disabled={burst !== null}
                onClick={() => injectBurst(count)}
              >
                {burst === count ? (
                  <LoaderCircle
                    data-icon="inline-start"
                    className="animate-spin motion-reduce:animate-none"
                  />
                ) : (
                  <Zap data-icon="inline-start" />
                )}
                {count}
              </Button>
            ))}
          </PanelBody>
        </Panel>

        <VerdictCard verdict={verdict} pending={pending} />
      </div>
    </div>
  );
}

function VerdictCard({
  verdict,
  pending,
}: {
  verdict: TransactionRecord | null;
  pending: boolean;
}) {
  if (!verdict) {
    return (
      <Panel className="flex-1">
        <PanelHeader eyebrow="Verdict" title="Nothing scored yet" />
        <PanelBody>
          <p className="text-callout leading-relaxed text-muted-foreground">
            {pending
              ? "Waiting on the ensemble…"
              : "Pick a scenario, adjust anything you like, and score it. The tier, both residuals and the rule trace land here."}
          </p>
        </PanelBody>
      </Panel>
    );
  }

  const level = normalizeRisk(verdict.risk_level);
  const style = RISK_STYLES[level];
  const signals = triageSignals(verdict).slice(0, 4);

  return (
    <Panel className="flex-1">
      <PanelHeader
        eyebrow="Verdict"
        title={
          <span className="flex items-center gap-2">
            <style.Icon aria-hidden className={cn("size-4", style.fg)} />
            {style.label} risk
          </span>
        }
        description={style.description}
      />
      <PanelBody className="space-y-3">
        <dl className="figures-tabular grid grid-cols-2 gap-3">
          <div>
            <dt className="text-subheadline text-[var(--ink-muted)]">AE MSE</dt>
            <dd
              className={cn(
                "text-body font-semibold",
                verdict.autoencoder_mse > 0.05 && "text-[var(--severity-high)]"
              )}
            >
              {formatDecimal(verdict.autoencoder_mse, 4)}
            </dd>
          </div>
          <div>
            <dt className="text-subheadline text-[var(--ink-muted)]">
              Isolation score
            </dt>
            <dd
              className={cn(
                "text-body font-semibold",
                verdict.isolation_score < 0 && "text-[var(--severity-high)]"
              )}
            >
              {formatScore(verdict.isolation_score)}
            </dd>
          </div>
        </dl>

        <ul className="space-y-1.5">
          {signals.map((signal) => {
            const sig = RISK_STYLES[signal.severity];
            return (
              <li key={signal.label} className="flex items-start gap-2">
                <sig.Icon
                  aria-hidden
                  className={cn("mt-0.5 size-3 shrink-0", sig.fg)}
                />
                <span className="text-subheadline leading-snug text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {signal.label}.
                  </span>{" "}
                  {signal.detail}
                </span>
              </li>
            );
          })}
        </ul>

        {verdict.ai_explanation ? (
          <div className="notice rounded-xl p-3.5 [--notice:var(--chart-1)]">
            <div className="mb-1 flex items-center gap-1.5">
              <Sparkles aria-hidden className="size-3 text-[var(--chart-1)]" />
              <span className="text-subheadline font-medium text-muted-foreground">
                Groq narration
              </span>
            </div>
            <p className="text-subheadline leading-relaxed">
              {verdict.ai_explanation}
            </p>
          </div>
        ) : (
          <Badge variant="outline" size="sm">
            No narration returned
          </Badge>
        )}
      </PanelBody>
    </Panel>
  );
}
