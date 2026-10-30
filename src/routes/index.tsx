import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Hand, PackageCheck, Truck } from "lucide-react";
import { Amounts, Row, Shell, StatusBadge, Timeline } from "@/components/proofdrop";
import { useDemo } from "@/lib/demo-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ProofDrop — Secure the handoff, not just the payment" },
      { name: "description", content: "ProofDrop coordinates buyer, seller, and courier confirmations before releasing a BCH settlement." },
      { property: "og:title", content: "ProofDrop — Secure the handoff" },
      { property: "og:description", content: "Buyer, seller, and courier confirmations before a BCH settlement is released." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { orders } = useDemo();
  const list = Object.values(orders).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <Shell>
      <section className="grid items-start gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-primary">Bitcoin Cash delivery settlement</p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Secure the handoff, not just the payment.</h1>
          <p className="mt-5 max-w-xl text-lg text-subtle">
            ProofDrop coordinates buyer, seller, and courier confirmations before releasing a BCH settlement.
          </p>
          <Link to="/create" className="btn btn-primary mt-8 px-6 py-3 text-base">
            Create a delivery order <ArrowRight className="h-4 w-4" />
          </Link>
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {[
              { i: Hand, t: "Buyer locks payment" },
              { i: Truck, t: "Courier confirms collection" },
              { i: PackageCheck, t: "Buyer confirms delivery" },
            ].map(({ i: I, t }) => (
              <div key={t} className="flex items-center gap-2 rounded-xl bg-surface p-3 text-sm">
                <I className="h-4 w-4 text-primary" /> {t}
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Example order</span>
            <StatusBadge status="payment_locked" />
          </div>
          <Row k="Item" v="Used laptop" strong />
          <Amounts o={{ itemSats: 1_500_000, courierFeeSats: 200_000 }} />
          <div className="mt-6 border-t pt-6">
            <Timeline status="payment_locked" />
          </div>
        </div>
      </section>

      {list.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-4 text-lg font-semibold">Your demo orders</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((o) => (
              <Link key={o.id} to="/orders/$id" params={{ id: o.id }} search={{ role: "buyer" }} className="panel block p-4 hover:ring-2 hover:ring-primary">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{o.id}</span>
                  <StatusBadge status={o.status} />
                </div>
                <div className="mt-2 font-semibold">{o.item}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </Shell>
  );
}
