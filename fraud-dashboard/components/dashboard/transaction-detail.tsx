"use client";

import * as React from "react";
import {
  Ban,
  Copy,
  Cpu,
  FileInput,
  Gauge,
  KeyRound,
  Landmark,
  Sparkles,
  Timer,
  Waypoints,
} from "lucide-react";
import { toast } from "sonner";

import {
  formatCurrency,
  formatDecimal,
  formatInteger,
  formatPercent,
  formatScore,
  formatTimestamp,
} from "@/lib/format";
import { rowSource } from "@/lib/analytics";
import { UNKNOWN, field, RISK_STYLES, normalizeRisk, triageSignals } from "@/lib/risk";
import { SOURCE_BLURB, SOURCE_LABEL, type TransactionRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2.5", className)}>
      <h3 className="text-eyebrow">{title}</h3>
      {children}
    </section>
  );
}

/**
 * A single model output against the threshold that decides it. The tick is the
 * whole point: a raw number tells you nothing without the line it crossed.
 */
function Meter({
  label,
  value,
  display,
  domain,
  threshold,
  thresholdLabel,
  breached,
  Icon,
}: {
  label: string;
  value: number;
  display: string;
  domain: [number, number];
  threshold: number;
  thresholdLabel: string;
  breached: boolean;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  const span = domain[1] - domain[0] || 1;
  const pct = (n: number) =>
    Math.min(100, Math.max(0, ((n - domain[0]) / span) * 100));

  return (
    <div className="space-y-1.5 rounded-xl bg-inset p-3">
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-callout font-medium">{label}</span>
        <span
          className={cn(
            "figures-tabular ml-auto text-callout font-semibold",
            breached ? "text-[var(--severity-high)]" : "text-foreground"
          )}
        >
          {display}
        </span>
      </div>

      <div className="relative h-1.5 overflow-hidden rounded-full bg-track">
        <div
          className="h-full rounded-r-sm"
          style={{
            width: `${Math.max(pct(value), 2)}%`,
            background: breached ? "var(--severity-high)" : "var(--chart-1)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-y-[-2px] w-px bg-[var(--axis)]"
          style={{ left: `${pct(threshold)}%` }}
        />
      </div>

      <p className="text-subheadline text-muted-foreground">{thresholdLabel}</p>
    </div>
  );
}

function Detail({
  label,
  value,
  Icon,
}: {
  label: string;
  value: React.ReactNode;
  Icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="flex items-center gap-1.5 text-subheadline text-[var(--ink-muted)]">
        {Icon ? <Icon className="size-3 shrink-0" /> : null}
        {label}
      </dt>
      <dd className="figures-tabular truncate text-body font-medium">
        {value}
      </dd>
    </div>
  );
}

/**
 * Replaces the hand-rolled overlay this dashboard used to ship: Base UI supplies
 * the focus trap, the escape handler, the scroll lock and the return-focus
 * behaviour, none of which the previous `fixed inset-0` div had.
 */
export function TransactionDetail({
  transaction,
  onClose,
}: {
  transaction: TransactionRecord | null;
  onClose: () => void;
}) {
  // The popup must stay mounted while it animates out, so the last selected
  // record is held after `transaction` goes null. Unmounting on close would
  // snap the dialog away instead of letting it scale back down.
  const [cached, setCached] = React.useState<TransactionRecord | null>(transaction);

  // Adjusted during render, not in an effect: React re-runs this component
  // immediately with the new value before touching the DOM, so the dialog never
  // paints one frame holding the previous record.
  if (transaction !== null && transaction !== cached) {
    setCached(transaction);
  }

  return (
    <Dialog
      open={transaction !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {cached ? <DetailContent transaction={cached} /> : null}
    </Dialog>
  );
}

function DetailContent({ transaction }: { transaction: TransactionRecord }) {
  const level = normalizeRisk(transaction.risk_level);
  const style = RISK_STYLES[level];
  const signals = triageSignals(transaction);
  const balance = field.balance(transaction);
  const drain = balance > 0 ? transaction.amount / balance : null;
  const channel = field.channel(transaction);

  const copyCase = async () => {
    try {
      await navigator.clipboard.writeText(transaction.transaction_id);
      toast.success("Case reference copied", {
        description: transaction.transaction_id,
      });
    } catch {
      toast.error("Clipboard unavailable", {
        description: "Copy the reference from the header manually.",
      });
    }
  };

  const escalate = () => {
    // This used to be `alert()`. A toast keeps the dialog open, stays
    // dismissible, and does not block the polling loop behind it.
    toast.warning(`${style.label} case queued for manual review`, {
      description: `${transaction.transaction_id} · ${formatCurrency(transaction.amount, true)} · ${style.description}`,
    });
  };

  return (
    <DialogPopup>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-subheadline font-medium ring-1 ring-inset",
              style.chip
            )}
          >
            <style.Icon aria-hidden className="size-3" />
            {style.label}
          </span>
          <Badge variant={transaction.is_fraud ? "outline" : "neutral"}>
            {transaction.is_fraud ? "Flagged by ensemble" : "Cleared"}
          </Badge>
          <span className="figures-tabular font-mono text-subheadline text-muted-foreground">
            {transaction.transaction_id}
          </span>
        </div>

        <DialogTitle className="figures-tabular font-heading text-large-title">
          {formatCurrency(transaction.amount, true)}
        </DialogTitle>
        <DialogDescription>
          {style.description} Scored {formatTimestamp(field.at(transaction))}
          {channel === UNKNOWN ? "." : ` on the ${channel.toLowerCase()} channel.`}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-6">
        <Section title="Why it scored">
          {/* One grouped inset list, not four floating cards. iOS groups related
              rows into a single container and separates them with hairlines that
              start at the content — the rows belong together, and four separate
              tiles claim they don't. */}
          <ul className="list-inset bg-inset">
            {signals.map((signal) => {
              const sig = RISK_STYLES[signal.severity];
              return (
                <li
                  key={signal.label}
                  className="flex items-start gap-2.5 px-3.5 py-3"
                >
                  <sig.Icon
                    aria-hidden
                    className={cn("mt-px size-3.5 shrink-0", sig.fg)}
                  />
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-body leading-snug font-medium">
                      {signal.label}
                    </p>
                    <p className="text-callout leading-snug text-muted-foreground">
                      {signal.detail}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    size="sm"
                    className="ml-auto shrink-0 self-center"
                  >
                    {sig.label}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title="Model readout">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Meter
              label="Autoencoder MSE"
              Icon={Cpu}
              value={transaction.autoencoder_mse}
              display={formatDecimal(transaction.autoencoder_mse, 4)}
              domain={[0, Math.max(0.12, transaction.autoencoder_mse * 1.15)]}
              threshold={0.05}
              thresholdLabel="Tick marks the 0.0500 review threshold."
              breached={transaction.autoencoder_mse > 0.05}
            />
            <Meter
              label="Isolation Forest"
              Icon={Gauge}
              value={transaction.isolation_score}
              display={formatScore(transaction.isolation_score)}
              domain={[-0.3, 0.3]}
              threshold={0}
              thresholdLabel="Tick marks zero; negative separates as an outlier."
              breached={transaction.isolation_score < 0}
            />
          </div>
        </Section>

        <Section title="Ledger">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 rounded-xl bg-inset p-3.5 sm:grid-cols-3">
            <Detail
              label="Account"
              value={transaction.account_id}
              Icon={Landmark}
            />
            <Detail
              label="Balance before"
              value={formatCurrency(balance, true)}
              Icon={Landmark}
            />
            <Detail
              label="Balance drain"
              value={drain === null ? "n/a" : formatPercent(Math.min(drain, 9.99), 1)}
              Icon={Gauge}
            />
            <Detail
              label="Velocity 12h"
              value={formatInteger(field.velocity(transaction))}
              Icon={Waypoints}
            />
            <Detail
              label="24h value"
              value={formatCurrency(field.velocitySum(transaction))}
              Icon={Waypoints}
            />
            <Detail
              label="Login attempts"
              value={formatInteger(field.loginAttempts(transaction))}
              Icon={KeyRound}
            />
            <Detail
              label="Session length"
              value={`${formatInteger(field.duration(transaction))}s`}
              Icon={Timer}
            />
            <Detail label="Instruction" value={field.type(transaction)} />
            <Detail label="Occupation" value={field.occupation(transaction)} />
            <Detail
              label="Origin"
              value={SOURCE_LABEL[rowSource(transaction)]}
              Icon={FileInput}
            />
          </dl>
          <p className="mt-2 text-subheadline text-muted-foreground">
            {SOURCE_BLURB[rowSource(transaction)]}
          </p>
        </Section>

        {transaction.ai_explanation ? (
          <Section title="Narration">
            <div className="notice rounded-xl p-3.5 [--notice:var(--chart-1)]">
              <div className="mb-1.5 flex items-center gap-1.5">
                <Sparkles
                  aria-hidden
                  className="size-3.5 text-[var(--chart-1)]"
                />
                <span className="text-subheadline font-medium text-muted-foreground">
                  Generated summary · Groq · LLaMA 3.3
                </span>
              </div>
              <p className="text-body leading-relaxed">
                {transaction.ai_explanation}
              </p>
            </div>
          </Section>
        ) : null}
      </DialogBody>

      <DialogFooter>
        <Button variant="ghost" size="lg" onClick={copyCase}>
          <Copy data-icon="inline-start" />
          Copy reference
        </Button>
        <Button variant="destructive" size="lg" onClick={escalate}>
          <Ban data-icon="inline-start" />
          Escalate to review
        </Button>
        <DialogClose
          render={
            <Button variant="secondary" size="lg">
              Close
            </Button>
          }
        />
      </DialogFooter>
    </DialogPopup>
  );
}
