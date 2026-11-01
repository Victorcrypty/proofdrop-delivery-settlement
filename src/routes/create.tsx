import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell, Notice } from "@/components/proofdrop";
import { demo, useDemo } from "@/lib/demo-store";
import { fmtBCH, toSats } from "@/lib/settlement";

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Create delivery order — ProofDrop" },
      { name: "description", content: "Set up a buyer, seller, and courier delivery settlement." },
      { property: "og:title", content: "Create delivery order — ProofDrop" },
      { property: "og:description", content: "Set up a buyer, seller, and courier delivery settlement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CreatePage,
});

const blank = {
  item: "", description: "", sellerName: "", sellerAddress: "", buyerAddress: "",
  courierName: "", courierAddress: "", item_bch: "", fee_bch: "", deadline: "",
};
type F = typeof blank;

const inTwoDays = () => {
  const d = new Date(Date.now() + 2 * 864e5);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

function CreatePage() {
  const nav = useNavigate();
  const { draft } = useDemo();
  const [f, setF] = useState<F>(blank);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (draft)
      setF({
        ...draft, item_bch: String(draft.itemSats / 1e8), fee_bch: String(draft.courierFeeSats / 1e8),
        deadline: (() => { const d = new Date(draft.deadline); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); })(),
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const up = (k: keyof F) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const fillDemo = () =>
    setF({
      item: "Used laptop", description: "14-inch, 16 GB RAM, charger included. Minor scuff on lid.",
      sellerName: "Ada's Electronics", sellerAddress: "bitcoincash:demo-seller-address",
      buyerAddress: "bitcoincash:demo-buyer-address", courierName: "Swift Riders",
      courierAddress: "bitcoincash:demo-courier-address", item_bch: "0.015", fee_bch: "0.002", deadline: inTwoDays(),
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const missing = (Object.keys(blank) as (keyof F)[]).filter((k) => k !== "description" && !f[k].trim());
    if (missing.length) return setErr("Please complete every required field.");
    for (const a of [f.sellerAddress, f.buyerAddress, f.courierAddress])
      if (!a.trim().startsWith("bitcoincash:")) return setErr("BCH addresses must start with \"bitcoincash:\".");
    if (toSats(f.item_bch) <= 0) return setErr("Item amount must be greater than zero.");
    if (toSats(f.fee_bch) < 0 || isNaN(toSats(f.fee_bch))) return setErr("Courier fee must be zero or more.");
    if (new Date(f.deadline).getTime() <= Date.now()) return setErr("Delivery deadline must be in the future.");
    demo.setDraft({
      item: f.item.trim(), description: f.description.trim(), sellerName: f.sellerName.trim(), sellerAddress: f.sellerAddress.trim(),
      buyerAddress: f.buyerAddress.trim(), courierName: f.courierName.trim(), courierAddress: f.courierAddress.trim(),
      itemSats: toSats(f.item_bch), courierFeeSats: toSats(f.fee_bch), deadline: new Date(f.deadline).toISOString(), method: "one_time_code",
    });
    nav({ to: "/review" });
  };

  const L = ({ k, label, ph, type = "text" }: { k: keyof F; label: string; ph?: string; type?: string }) => (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input className="field" type={type} step={type === "number" ? "0.00000001" : undefined} min={type === "number" ? "0" : undefined} value={f[k]} onChange={up(k)} placeholder={ph} />
    </label>
  );

  return (
    <Shell>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-primary">Step 1 of 2</p>
            <h1 className="text-3xl font-semibold tracking-tight">Create delivery order</h1>
          </div>
          <button type="button" onClick={fillDemo} className="btn btn-ghost">Fill demo values</button>
        </div>
        <form onSubmit={submit} className="panel space-y-8 p-6 sm:p-8">
          <fieldset className="space-y-4">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Item</legend>
            {L({ k: "item", label: "Item name", ph: "e.g. Used laptop" })}
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Item description</span>
              <textarea className="field min-h-20" value={f.description} onChange={up("description")} placeholder="Condition, accessories, serial number…" />
            </label>
          </fieldset>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Parties</legend>
            {L({ k: "sellerName", label: "Seller display name" })}
            {L({ k: "sellerAddress", label: "Seller BCH address", ph: "bitcoincash:…" })}
            {L({ k: "courierName", label: "Courier display name" })}
            {L({ k: "courierAddress", label: "Courier BCH address", ph: "bitcoincash:…" })}
            <div className="sm:col-span-2">{L({ k: "buyerAddress", label: "Buyer BCH address", ph: "bitcoincash:…" })}</div>
            <p className="text-xs text-muted-foreground sm:col-span-2">Public receiving addresses only. ProofDrop never asks for recovery phrases or private keys.</p>
          </fieldset>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Terms</legend>
            {L({ k: "item_bch", label: "Item amount (BCH)", type: "number", ph: "0.015" })}
            {L({ k: "fee_bch", label: "Courier fee (BCH)", type: "number", ph: "0.002" })}
            {L({ k: "deadline", label: "Delivery deadline", type: "datetime-local" })}
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Delivery confirmation method</span>
              <select className="field" value="one_time_code" disabled>
                <option value="one_time_code">One-time delivery code</option>
              </select>
            </label>
            <div className="rounded-xl bg-muted p-3 text-sm text-card-foreground sm:col-span-2">
              Total to lock: <span className="font-mono font-semibold">{fmtBCH((toSats(f.item_bch) || 0) + (toSats(f.fee_bch) || 0))}</span>
            </div>
          </fieldset>
          {err && <Notice tone="blocked">{err}</Notice>}
          <button className="btn btn-primary w-full sm:w-auto">Review order terms</button>
        </form>
      </div>
    </Shell>
  );
}
