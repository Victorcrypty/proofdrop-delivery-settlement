import { createFileRoute, Link } from "@tanstack/react-router";
import { FlaskConical } from "lucide-react";
import { Amounts, Row, Shell, StatusBadge, fmtDate , OrderMissing } from "@/components/proofdrop";
import { useDemo, useHydrated } from "@/lib/demo-store";
import { fmtBCH } from "@/lib/settlement";

export const Route = createFileRoute("/receipt/$id")({
  head: () => ({
    meta: [
      { title: "Settlement receipt — ProofDrop" },
      { name: "description", content: "Public settlement receipt with confirmation history." },
      { property: "og:title", content: "Settlement receipt — ProofDrop" },
      { property: "og:description", content: "Public settlement receipt with confirmation history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Receipt,
});

function Receipt() {
  const { id } = Route.useParams();
  const hydrated = useHydrated();
  const o = useDemo().orders[id];
  if (!hydrated) return <Shell><p className="text-subtle">Loading…</p></Shell>;
  if (!o) return <OrderMissing />;
  return (
    <Shell>
      <article className="panel mx-auto max-w-2xl p-6 sm:p-10">
        <div className="mb-6 flex items-start gap-2 rounded-xl bg-pending-soft p-4 text-sm text-pending">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
          This prototype uses simulated settlement data. Live BCH settlement will be connected in a later integration phase.
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Settlement receipt</p>
            <h1 className="mt-1 font-mono text-2xl font-semibold">{o.id}</h1>
          </div>
          <StatusBadge status={o.status} />
        </div>
        <div className="mt-6 divide-y divide-border border-y">
          <Row k="Item" v={o.item} strong />
          <Row k="Seller" v={o.sellerName} />
          <Row k="Courier" v={o.courierName} />
        </div>
        <div className="mt-2"><Amounts o={o} /></div>
        {o.status === "refunded" && <div className="mt-4 border-t border-border pt-4 text-sm"><Row k="Simulated refund to buyer" v={fmtBCH(o.itemSats + o.courierFeeSats)} strong /><p className="text-muted-foreground">No real BCH was moved. Seller payment and courier fee were not released.</p></div>}
        <h2 className="mt-8 mb-3 font-semibold">Confirmation history</h2>
        <ol className="space-y-3">
          {o.events.map((e, i) => (
            <li key={i} className="rounded-xl bg-muted p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{e.label}</span>
                <span className="text-xs text-muted-foreground">{fmtDate(e.at)}</span>
              </div>
              <div className="mt-1 text-xs capitalize text-muted-foreground">By {e.actor}</div>
              {e.demoRef && <div className="mt-1 font-mono text-xs">Demo reference: {e.demoRef}</div>}
            </li>
          ))}
        </ol>
        <Link to="/orders/$id" params={{ id }} search={{ role: "buyer" }} className="btn btn-ghost mt-8">Back to order</Link>
      </article>
    </Shell>
  );
}
