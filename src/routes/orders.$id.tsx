import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { FileText, KeyRound, Lock, PackageCheck, Truck, Wallet, Ban, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Amounts, Conditions, Notice, OrderMissing, Row, Shell, StatusBadge, Timeline, fmtDate } from "@/components/proofdrop";
import { demo, useDemo, useHydrated } from "@/lib/demo-store";
import { fmtBCH, refundEligibility, settlement, type Actor, type Order, type Result } from "@/lib/settlement";
import { cn } from "@/lib/utils";

type Role = "buyer" | "seller" | "courier";

export const Route = createFileRoute("/orders/$id")({
  validateSearch: (s: Record<string, unknown>): { role: Role } => ({
    role: s["role"] === "seller" || s["role"] === "courier" ? s["role"] : "buyer",
  }),
  head: () => ({
    meta: [
      { title: "Delivery order — ProofDrop" },
      { name: "description", content: "Buyer, seller, and courier view of a ProofDrop delivery settlement." },
      { property: "og:title", content: "Delivery order — ProofDrop" },
      { property: "og:description", content: "Track confirmations for a delivery settlement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrderPage,
});

function OrderPage() {
  const { id } = Route.useParams();
  const { role } = Route.useSearch();
  const nav = useNavigate({ from: Route.fullPath });
  const hydrated = useHydrated();
  const { orders } = useDemo();
  const o = orders[id];
  const [msg, setMsg] = useState<{ tone: "blocked" | "ok"; text: string } | null>(null);

  if (!hydrated) return <Shell><p className="text-subtle">Loading demo order…</p></Shell>;
  if (!o) return <OrderMissing />;

  const act = async (fn: (o: Order) => Promise<Result>, success: string) => {
    const r = await demo.run(o.id, fn);
    setMsg(r.ok ? { tone: "ok", text: success } : { tone: "blocked", text: r.reason });
  };
  const deadlinePassed = refundEligibility(o).allowed;

  return (
    <Shell>
      <div className="mb-6 rounded-2xl bg-surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">Demo role</div>
            <p className="mt-1 text-xs text-subtle">This role switcher is for demonstrating the prototype workflow. It is not production authentication.</p>
          </div>
          <div className="flex rounded-lg bg-background p-1" role="tablist">
            {(["buyer", "seller", "courier"] as Role[]).map((r) => (
              <button
                key={r}
                role="tab"
                aria-selected={role === r}
                onClick={() => { setMsg(null); nav({ search: { role: r } }); }}
                className={cn("rounded-md px-4 py-1.5 text-sm font-medium capitalize", role === r ? "bg-primary text-primary-foreground" : "text-subtle")}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        {settlement.mode === "demo" && role === "buyer" && o.status === "payment_locked" && (
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <Button variant="outline" className="h-auto max-w-full whitespace-normal text-left" disabled={o.demoDeadlinePassed} onClick={() => demo.simulateDeadlinePassed(o.id, role).then((r) => setMsg(r.ok ? { tone: "ok", text: "Deadline passing simulated for this demo order only. The agreed deadline is unchanged; no blockchain deadline was changed." } : { tone: "blocked", text: r.reason }))}>
              <FlaskConical /> Prototype test: simulate deadline passed
            </Button>
            <p className="text-xs text-subtle">Local demo only. Does not change the agreed delivery deadline or any real blockchain deadline.</p>
            {o.demoDeadlinePassed && <p className="text-xs font-medium text-primary">Prototype deadline: simulated as passed.</p>}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <section className="panel p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-mono text-xs text-muted-foreground">Order {o.id}</div>
                <h1 className="mt-1 text-2xl font-semibold capitalize-first">{o.item}</h1>
                {o.description && <p className="mt-1 text-sm text-muted-foreground">{o.description}</p>}
              </div>
              <StatusBadge status={o.status} />
            </div>

            <div className="mt-6 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground capitalize">{role} actions</h2>
              {role === "buyer" && <BuyerActions o={o} act={act} />}
              {role === "seller" && (
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-primary" disabled={o.dispatched} onClick={() => demo.dispatch(o.id, "seller").then((r) => setMsg(r.ok ? { tone: "ok", text: "Dispatch confirmed. Awaiting courier-confirmed collection." } : { tone: "blocked", text: r.reason }))}>
                    <Truck className="h-4 w-4" /> {o.dispatched ? "Dispatch confirmed" : "Confirm dispatch"}
                  </button>
                  <button className="btn btn-ghost" onClick={() => act((x) => settlement.releaseSettlement(x, "seller"), "")}>
                    <Wallet className="h-4 w-4" /> Claim payment
                  </button>
                </div>
              )}
              {role === "courier" && (
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-primary" onClick={() => act((x) => settlement.confirmCollection(x, "courier"), "Collection confirmed. The buyer can now confirm delivery with the one-time code.")}>
                    <PackageCheck className="h-4 w-4" /> Confirm collection
                  </button>
                  <button className="btn btn-ghost" onClick={() => act((x) => settlement.confirmDelivery(x, "courier", ""), "")}>
                    Confirm delivery
                  </button>
                </div>
              )}
              {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
              <RoleInfo o={o} role={role} />
            </div>
          </section>

          {role === "seller" && o.deliveryCode && (
            <section className="panel space-y-3 p-6" aria-labelledby="demo-delivery-code">
              <h2 id="demo-delivery-code" className="flex items-center gap-2 font-semibold">
                <KeyRound className="h-4 w-4" /> Demo delivery code
              </h2>
              <p className="font-mono text-3xl font-semibold" data-testid="demo-delivery-code">{o.deliveryCode}</p>
              <p className="text-sm text-muted-foreground">For this prototype, share this code with the buyer after the item is handed over. In production, the code would be delivered through a protected channel.</p>
              {o.codeUsed && <p className="text-sm text-muted-foreground">Used — delivery confirmation is complete.</p>}
            </section>
          )}

          <section className="panel p-6">
            <h2 className="mb-3 font-semibold">Parties & amounts</h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="divide-y divide-border">
                <Row k="Buyer" v={<span className="font-mono text-xs">{o.buyerAddress}</span>} />
                <Row k="Seller" v={o.sellerName} />
                <Row k="Courier" v={o.courierName} />
                <Row k="Deadline" v={fmtDate(o.deadline)} />
                <Row k="Confirmation" v="One-time delivery code" />
              </div>
              <Amounts o={o} />
            </div>
          </section>
          <Conditions />
        </div>

        <div className="space-y-6">
          <section className="panel p-6">
            <h2 className="mb-4 font-semibold">Settlement timeline</h2>
            <Timeline status={o.status} deadlinePassed={deadlinePassed} />
          </section>
          <section className="panel p-6">
            <h2 className="mb-3 font-semibold">Activity history</h2>
            <ul className="space-y-3 text-sm">
              {[...o.events].reverse().map((e, i) => (
                <li key={i} className="border-l-2 border-primary pl-3">
                  <div className="font-medium">{e.label}</div>
                  <div className="text-xs text-muted-foreground capitalize">{e.actor} · {fmtDate(e.at)}</div>
                  {e.demoRef && <div className="font-mono text-xs text-muted-foreground">Demo reference: {e.demoRef}</div>}
                </li>
              ))}
            </ul>
          </section>
          <Link to="/receipt/$id" params={{ id: o.id }} className="btn btn-ghost w-full">
            <FileText className="h-4 w-4" /> View settlement receipt
          </Link>
        </div>
      </div>
    </Shell>
  );
}

function BuyerActions({ o, act }: { o: Order; act: (fn: (o: Order) => Promise<Result>, s: string) => void }) {
  const refund = refundEligibility(o);
  return (
    <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      {o.status === "order_created" && (
        <button className="btn btn-primary" onClick={() => act((x) => settlement.fundSettlement(x, "buyer"), "Simulated payment locked. No real BCH was moved.")}>
          <Lock className="h-4 w-4" /> Fund simulated settlement
        </button>
      )}
      {o.status !== "order_created" && o.status !== "settlement_released" && o.status !== "refunded" && (
        <Link to="/confirm/$id" params={{ id: o.id }} className="btn btn-primary">
          <KeyRound className="h-4 w-4" /> Delivery confirmation
        </Link>
      )}
      <button className="btn btn-ghost" onClick={() => act((x) => settlement.releaseSettlement(x, "buyer"), "Simulated settlement released.")}>
        Approve release
      </button>
      <Button variant="ghost" className="h-auto whitespace-normal" onClick={() => act((x) => settlement.requestRefund(x, "buyer"), "Simulated refund issued. No real BCH was moved.")}>
        <Ban className="h-4 w-4" /> Request simulated refund
      </Button>
    </div>
    <p className="text-sm text-muted-foreground">{refund.reason}</p>
    </div>
  );
}

function RoleInfo({ o, role }: { o: Order; role: Role }) {
  const locked = o.status !== "settlement_released" && o.status !== "refunded" && o.status !== "order_created";
  const box = "rounded-xl bg-muted p-4 text-sm text-card-foreground";
  if (role === "seller")
    return (
      <div className={box}>
        Your payment: <span className="font-mono font-semibold">{fmtBCH(o.itemSats)}</span> —{" "}
        {o.status === "settlement_released" ? "released to you (simulated)." : locked ? "locked until collection and delivery are confirmed." : o.status === "refunded" ? "refunded to buyer." : "not yet locked by the buyer."}
      </div>
    );
  if (role === "courier")
    return (
      <div className={box}>
        Your courier fee: <span className="font-mono font-semibold">{fmtBCH(o.courierFeeSats)}</span> —{" "}
        {o.status === "settlement_released" ? "released to you (simulated)." : locked ? "locked until the buyer confirms delivery." : o.status === "refunded" ? "refunded to buyer." : "not yet locked."}
      </div>
    );
  return (
    <div className={box}>
      {o.status === "order_created" && "Fund the simulated settlement to lock payment."}
      {o.status === "payment_locked" && (
        <>Payment is locked. Await courier collection and the code provided at handoff.</>
      )}
      {o.status === "collection_confirmed" && "The courier has collected the item. When it arrives, enter your delivery code."}
      {o.status === "delivery_confirmed" && "Delivery confirmed. Approve the simulated release to pay seller and courier."}
      {o.status === "settlement_released" && "Settlement released (simulated)."}
      {o.status === "refunded" && "Refund issued (simulated)."}
    </div>
  );
}
