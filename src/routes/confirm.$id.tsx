import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Amounts, Notice, Shell, StatusBadge, Timeline } from "@/components/proofdrop";
import { demo, useDemo, useHydrated } from "@/lib/demo-store";
import { settlement } from "@/lib/settlement";
import { OrderMissing } from "./orders.$id";

export const Route = createFileRoute("/confirm/$id")({
  head: () => ({
    meta: [
      { title: "Delivery confirmation — ProofDrop" },
      { name: "description", content: "Buyer-confirmed delivery with a one-time delivery code." },
      { property: "og:title", content: "Delivery confirmation — ProofDrop" },
      { property: "og:description", content: "Buyer-confirmed delivery with a one-time delivery code." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Confirm,
});

function Confirm() {
  const { id } = Route.useParams();
  const hydrated = useHydrated();
  const o = useDemo().orders[id];
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ tone: "blocked" | "ok"; text: string } | null>(null);
  if (!hydrated) return <Shell><p className="text-subtle">Loading…</p></Shell>;
  if (!o) return <OrderMissing />;

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await demo.run(id, (x) => settlement.confirmDelivery(x, "buyer", code));
    setMsg(r.ok ? { tone: "ok", text: "Buyer-confirmed delivery recorded. The code is now used." } : { tone: "blocked", text: r.reason });
    setCode("");
  };
  const release = async () => {
    const r = await demo.run(id, (x) => settlement.releaseSettlement(x, "buyer"));
    setMsg(r.ok ? { tone: "ok", text: "Simulated settlement released to seller and courier." } : { tone: "blocked", text: r.reason });
  };

  return (
    <Shell>
      <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-[1.3fr_1fr]">
        <section className="panel space-y-5 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Buyer · Order {o.id}</p>
              <h1 className="mt-1 text-2xl font-semibold">Delivery confirmation</h1>
            </div>
            <StatusBadge status={o.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            Enter your one-time delivery code only after you have the {o.item} in hand. ProofDrop records your confirmation — it cannot independently verify that a package arrived.
          </p>
          <form onSubmit={confirm} className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">One-time delivery code</span>
              <input className="field font-mono tracking-widest" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder="6 digits" />
            </label>
            <button className="btn btn-primary w-full"><KeyRound className="h-4 w-4" /> Confirm delivery</button>
          </form>
          <button onClick={release} className="btn btn-ghost w-full"><ShieldCheck className="h-4 w-4" /> Approve simulated release</button>
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <div className="flex flex-wrap gap-3 text-sm">
            <Link to="/orders/$id" params={{ id }} search={{ role: "buyer" }} className="text-accent-foreground underline">Back to order</Link>
            {o.status === "settlement_released" && <Link to="/receipt/$id" params={{ id }} className="text-accent-foreground underline">View receipt</Link>}
          </div>
        </section>
        <section className="panel space-y-6 p-6">
          <Amounts o={o} />
          <Timeline status={o.status} />
        </section>
      </div>
    </Shell>
  );
}
