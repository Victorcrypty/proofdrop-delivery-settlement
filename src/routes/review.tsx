import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Amounts, Conditions, Notice, Row, Shell, fmtDate } from "@/components/proofdrop";
import { demo, useDemo, useHydrated } from "@/lib/demo-store";

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Review order terms — ProofDrop" },
      { name: "description", content: "Review amounts, release and refund conditions before creating the order." },
      { property: "og:title", content: "Review order terms — ProofDrop" },
      { property: "og:description", content: "Review amounts, release and refund conditions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Review,
});

function Review() {
  const { draft } = useDemo();
  const hydrated = useHydrated();
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  if (!hydrated) return <Shell><p className="text-subtle">Loading…</p></Shell>;
  if (!draft)
    return (
      <Shell>
        <div className="panel mx-auto max-w-lg p-8 text-center">
          <p>No order draft yet.</p>
          <Link to="/create" className="btn btn-primary mt-4">Create a delivery order</Link>
        </div>
      </Shell>
    );

  const create = async () => {
    const r = await demo.create();
    if (!r.ok) return setErr(r.reason);
    nav({ to: "/orders/$id", params: { id: r.order.id }, search: { role: "buyer" } });
  };

  return (
    <Shell>
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-primary">Step 2 of 2</p>
        <h1 className="mb-6 text-3xl font-semibold tracking-tight">Review order terms</h1>
        <div className="panel space-y-6 p-6 sm:p-8">
          <div>
            <h2 className="text-xl font-semibold">{draft.item}</h2>
            {draft.description && <p className="mt-1 text-sm text-muted-foreground">{draft.description}</p>}
          </div>
          <div className="rounded-xl border p-4">
            <Amounts o={draft} />
          </div>
          <div className="divide-y divide-border">
            <Row k="Seller" v={draft.sellerName} />
            <Row k="Courier" v={draft.courierName} />
            <Row k="Delivery deadline" v={fmtDate(draft.deadline)} />
            <Row k="Delivery confirmation method" v="One-time delivery code" />
          </div>
          <Conditions />
          {err && <Notice tone="blocked">{err}</Notice>}
          <div className="flex flex-col gap-3 sm:flex-row">
            <button onClick={create} className="btn btn-primary">Create order</button>
            <Link to="/create" className="btn btn-ghost">Edit details</Link>
          </div>
        </div>
      </div>
    </Shell>
  );
}
