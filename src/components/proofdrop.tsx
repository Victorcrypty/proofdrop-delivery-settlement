import { Link } from "@tanstack/react-router";
import { Check, Circle, CircleDot, Lock, Package, ShieldCheck, Ban, FlaskConical } from "lucide-react";
import type { ReactNode } from "react";
import { fmtBCH, STATUS_ORDER, type Order, type SettlementStatus } from "@/lib/settlement";
import { cn } from "@/lib/utils";

export const STATUS_LABEL: Record<SettlementStatus, string> = {
  initial: "Not created",
  order_created: "Awaiting payment lock",
  payment_locked: "Awaiting collection",
  collection_confirmed: "Awaiting buyer-confirmed delivery",
  delivery_confirmed: "Awaiting release approval",
  settlement_released: "Settlement released",
  refunded: "Refunded",
};

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-foreground/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Package className="h-4 w-4" />
            </span>
            ProofDrop
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-pending/50 px-2.5 py-1 text-xs font-medium text-pending-soft">
            <FlaskConical className="h-3.5 w-3.5" /> Demo — simulated settlement
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
    </div>
  );
}

export function StatusBadge({ status }: { status: SettlementStatus }) {
  const tone =
    status === "settlement_released" ? "bg-success-soft text-success-deep" : status === "refunded" ? "bg-destructive-soft text-destructive-deep" : "bg-pending-soft text-pending-deep";
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", tone)}>{STATUS_LABEL[status]}</span>;
}

const STAGES: { s: SettlementStatus; label: string }[] = [
  { s: "order_created", label: "Order created" },
  { s: "payment_locked", label: "Payment locked" },
  { s: "collection_confirmed", label: "Collection confirmed" },
  { s: "delivery_confirmed", label: "Delivery confirmed" },
  { s: "settlement_released", label: "Settlement released" },
];
type StageState = "complete" | "current" | "waiting" | "blocked";

export function stageStates(status: SettlementStatus, deadlinePassed = false): StageState[] {
  const cur = STATUS_ORDER.indexOf(status);
  return STAGES.map(({ s }) => {
    const i = STATUS_ORDER.indexOf(s);
    if (status === "refunded") return s === "order_created" || s === "payment_locked" ? "complete" : "blocked";
    if (i <= cur) return "complete";
    if (i === cur + 1) return deadlinePassed && s === "collection_confirmed" ? "blocked" : "current";
    return "waiting";
  });
}

export function Timeline({ status, deadlinePassed }: { status: SettlementStatus; deadlinePassed?: boolean }) {
  const states = stageStates(status, deadlinePassed);
  const meta = {
    complete: { icon: Check, cls: "bg-success text-destructive-foreground", text: "Complete" },
    current: { icon: CircleDot, cls: "bg-pending-soft text-pending-deep ring-2 ring-pending", text: "Current" },
    waiting: { icon: Circle, cls: "bg-muted text-muted-foreground", text: "Waiting" },
    blocked: { icon: Ban, cls: "bg-destructive-soft text-destructive-deep", text: "Blocked" },
  };
  return (
    <ol className="space-y-0">
      {STAGES.map((st, i) => {
        const m = meta[states[i] ?? "waiting"];
        const Icon = m.icon;
        return (
          <li key={st.s} className="relative flex gap-3 pb-5 last:pb-0">
            {i < STAGES.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-border" />}
            <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", m.cls)}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="flex flex-1 items-center justify-between gap-2 pt-1">
              <span className="text-sm font-medium">{i + 1}. {st.label}</span>
              <span className="text-xs text-muted-foreground">{m.text}</span>
            </div>
          </li>
        );
      })}
      {status === "refunded" && (
        <li className="mt-5 flex items-center gap-3" aria-label="Refunded">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-destructive-soft text-destructive-deep"><Ban className="h-4 w-4" /></span>
          <span className="text-sm font-semibold">Refunded</span>
          <span className="ml-auto text-xs text-muted-foreground">Simulated refund to buyer</span>
        </li>
      )}
    </ol>
  );
}

export function Row({ k, v, strong }: { k: string; v: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className={cn("text-right break-all", strong && "font-semibold")}>{v}</span>
    </div>
  );
}

export function Amounts({ o }: { o: Pick<Order, "itemSats" | "courierFeeSats"> }) {
  return (
    <div className="divide-y divide-border">
      <Row k="Amount locked" v={<span className="font-mono">{fmtBCH(o.itemSats + o.courierFeeSats)}</span>} strong />
      <Row k="Seller payment" v={<span className="font-mono">{fmtBCH(o.itemSats)}</span>} />
      <Row k="Courier fee" v={<span className="font-mono">{fmtBCH(o.courierFeeSats)}</span>} />
    </div>
  );
}

export const RELEASE_CONDITION = "Funds can be released after courier collection is confirmed and the buyer confirms delivery.";
export const REFUND_CONDITION = "If collection is not confirmed before the deadline, the buyer may request a refund according to the settlement rules.";

export function Conditions() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl bg-success-soft p-4 text-sm text-card-foreground">
        <div className="mb-1 flex items-center gap-2 font-semibold text-success-deep"><ShieldCheck className="h-4 w-4" /> Release condition</div>
        {RELEASE_CONDITION}
      </div>
      <div className="rounded-xl bg-muted p-4 text-sm text-card-foreground">
        <div className="mb-1 flex items-center gap-2 font-semibold text-card-foreground"><Lock className="h-4 w-4" /> Refund condition</div>
        {REFUND_CONDITION}
      </div>
    </div>
  );
}

export function Notice({ tone, children }: { tone: "blocked" | "ok"; children: ReactNode }) {
  return (
    <div role="alert" className={cn("flex items-start gap-2 rounded-xl p-3 text-sm", tone === "blocked" ? "bg-destructive-soft text-destructive-deep" : "bg-success-soft text-success-deep")}>
      {tone === "blocked" ? <Ban className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{children}</span>
    </div>
  );
}

export const fmtDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function OrderMissing() {
  return (
    <Shell>
      <div className="panel mx-auto max-w-lg p-8 text-center">
        <p>This demo order isn't stored in this browser.</p>
        <Link to="/" className="btn btn-primary mt-4">Back to dashboard</Link>
      </div>
    </Shell>
  );
}
