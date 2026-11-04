// ALL TRANSACTIONS IN THIS FILE ARE LOCAL ONLY (MockNetworkProvider + local VM debug).
// Nothing is broadcast. Keys below are throwaway test keys and hold no funds.
import { describe, expect, it } from "bun:test";
import { MockNetworkProvider, SignatureTemplate, randomUtxo, type Utxo } from "cashscript";
import { binToHex, hash160, hexToBin, secp256k1 } from "@bitauth/libauth";
import { artifacts, buildContracts, deserializeParams, relativeTimeAge, serializeParams, validateParams, SECONDS_48H, DUST_LIMIT, type ProofDropParams } from "../src/params";
import { buildCollect, buildFallback, buildRefund, buildRelease, evaluateLocally, type FeeInput } from "../src/tx";

const key = (n: number) => { const k = new Uint8Array(32); k[31] = n; return k; };
const party = (n: number) => {
  const priv = key(n);
  const pk = secp256k1.derivePublicKeyCompressed(priv) as Uint8Array;
  return { sig: new SignatureTemplate(priv), pk, lb: hexToBin(`76a914${binToHex(hash160(pk))}88ac`) };
};
const buyer = party(1), seller = party(2), courier = party(3), attacker = party(9), feePayer = party(7);

const DEADLINE = 1_800_000_000; // absolute unix seconds
const age = relativeTimeAge(SECONDS_48H);
const params: ProofDropParams = {
  buyerPk: buyer.pk, sellerPk: seller.pk, courierPk: courier.pk,
  buyerLockingBytecode: buyer.lb, sellerLockingBytecode: seller.lb, courierLockingBytecode: courier.lb,
  sellerAmount: 1_500_000n, courierFee: 200_000n, refundDeadline: BigInt(DEADLINE), fallbackAge: BigInt(age.encoded),
};
const provider = new MockNetworkProvider();
const { escrow, collected, principal } = buildContracts(params, provider);
const collectedLb = hexToBin(collected.lockingBytecode);

const utxo = (sats: bigint, lb: string | Uint8Array = feePayer.lb): Utxo => ({ ...randomUtxo(), satoshis: sats, lockingBytecode: typeof lb === "string" ? lb : binToHex(lb) } as Utxo);
const fee = (): FeeInput => ({ utxo: utxo(10_000n), signer: feePayer.sig, changeTo: feePayer.lb, fee: 1_000n });
const passes = (tb: Parameters<typeof evaluateLocally>[0]) => expect(() => evaluateLocally(tb)).not.toThrow();
const fails = (tb: Parameters<typeof evaluateLocally>[0]) => { try { evaluateLocally(tb); } catch (e) { console.log("REJECT", (e as Error).constructor.name, (e as Error).message.split("\n")[0].slice(0, 110)); return; } throw new Error("expected rejection"); };

const collectTx = (o: Partial<Parameters<typeof buildCollect>[0]> = {}) =>
  buildCollect({ provider, escrow, escrowUtxo: utxo(principal, escrow.lockingBytecode), courier: courier.sig, to: collectedLb, amount: principal, fee: fee(), ...o });
const refundTx = (o: Partial<Parameters<typeof buildRefund>[0]> = {}) =>
  buildRefund({ provider, escrow, escrowUtxo: utxo(principal, escrow.lockingBytecode), buyer: buyer.sig, to: buyer.lb, amount: principal, locktime: DEADLINE, fee: fee(), ...o });
const releaseTx = (o: Partial<Parameters<typeof buildRelease>[0]> = {}) =>
  buildRelease({ provider, collected, utxo: utxo(principal, collected.lockingBytecode), buyer: buyer.sig, seller: { to: seller.lb, amount: params.sellerAmount }, courier: { to: courier.lb, amount: params.courierFee }, fee: fee(), ...o });
const fallbackTx = (o: Partial<Parameters<typeof buildFallback>[0]> = {}) =>
  buildFallback({ provider, collected, utxo: utxo(principal, collected.lockingBytecode), seller: seller.sig, courier: courier.sig, sequence: age.encoded, sellerOut: { to: seller.lb, amount: params.sellerAmount }, courierOut: { to: courier.lb, amount: params.courierFee }, fee: fee(), ...o });

describe("[local] compilation", () => {
  it("compiles both contracts with the expected ABI", () => {
    expect(artifacts.escrow.abi.map((f) => f.name)).toEqual(["collect", "refund"]);
    expect(artifacts.collected.abi.map((f) => f.name)).toEqual(["release", "fallbackRelease"]);
    expect(escrow.address.startsWith("bchtest:") || escrow.address.startsWith("bitcoincash:")).toBe(true);
  });
  it("CollectedContract has no refund branch", () => {
    expect(artifacts.collected.abi.some((f) => /refund/i.test(f.name))).toBe(false);
    expect((collected.unlock as Record<string, unknown>)["refund"]).toBeUndefined();
  });
});

describe("[local] EscrowContract collect", () => {
  it("courier signature + exact principal to CollectedContract passes (fee from extra input)", () => passes(collectTx()));
  it("rejects a different destination", () => fails(collectTx({ to: attacker.lb })));
  it("rejects a changed amount (lower and higher)", () => { fails(collectTx({ amount: principal - 1n })); fails(collectTx({ amount: principal + 1n })); });
  it("rejects buyer or attacker signature instead of courier", () => { fails(collectTx({ courier: buyer.sig })); fails(collectTx({ courier: attacker.sig })); });
  it("network fee is not taken from principal: no fee input means no fee", () => {
    // Without a fee input, inputs == outputs exactly; reducing principal to pay fee is rejected.
    fails(collectTx({ fee: undefined, amount: principal - 500n }));
  });
});

describe("[local] EscrowContract refund", () => {
  it("buyer signature after deadline returns exact principal to buyer", () => passes(refundTx()));
  it("rejected before the deadline", () => fails(refundTx({ locktime: DEADLINE - 1 })));
  it("rejects courier signature", () => fails(refundTx({ buyer: courier.sig })));
  it("rejects a different refund destination or amount", () => { fails(refundTx({ to: attacker.lb })); fails(refundTx({ amount: principal - 1n })); });
});

describe("[local] CollectedContract release", () => {
  it("buyer signature pays exact seller and courier amounts", () => passes(releaseTx()));
  it("rejects seller, courier or attacker signature for normal release", () => {
    for (const p of [seller, courier, attacker]) fails(releaseTx({ buyer: p.sig }));
  });
  it("payout destinations cannot be changed or swapped", () => {
    fails(releaseTx({ seller: { to: attacker.lb, amount: params.sellerAmount } }));
    fails(releaseTx({ courier: { to: attacker.lb, amount: params.courierFee } }));
    fails(releaseTx({ seller: { to: courier.lb, amount: params.sellerAmount }, courier: { to: seller.lb, amount: params.courierFee } }));
  });
  it("payout amounts cannot be changed", () => {
    fails(releaseTx({ seller: { to: seller.lb, amount: params.sellerAmount - 1n } }));
    fails(releaseTx({ courier: { to: courier.lb, amount: params.courierFee + 1n }, seller: { to: seller.lb, amount: params.sellerAmount - 1n } }));
  });
});

describe("[local] CollectedContract fallback", () => {
  it("seller + courier signatures after the 48h window pass", () => passes(fallbackTx()));
  it("rejected before the fallback window", () => fails(fallbackTx({ sequence: age.encoded - 1 })));
  it("rejects a block-based sequence of the same number", () => fails(fallbackTx({ sequence: age.units })));
  it("requires both seller and courier signatures", () => {
    fails(fallbackTx({ seller: courier.sig }));
    fails(fallbackTx({ courier: seller.sig }));
    fails(fallbackTx({ seller: attacker.sig }));
    fails(fallbackTx({ seller: buyer.sig, courier: buyer.sig }));
  });
  it("fallback destinations and amounts are fixed", () => {
    fails(fallbackTx({ sellerOut: { to: attacker.lb, amount: params.sellerAmount } }));
    fails(fallbackTx({ courierOut: { to: courier.lb, amount: params.courierFee - 1n } }));
  });
  it("48h is rounded up to BIP68 512-second units, never shortened", () => {
    expect(age.units).toBe(338);
    expect(age.effectiveSeconds).toBe(173_056);
    expect(age.effectiveSeconds).toBeGreaterThanOrEqual(SECONDS_48H);
  });
});

describe("[local] dust, fees and integer satoshis", () => {
  it("rejects payouts below dust in parameter validation", () => {
    expect(() => validateParams({ ...params, courierFee: DUST_LIMIT - 1n })).toThrow();
    expect(() => validateParams({ ...params, sellerAmount: 0n })).toThrow();
    expect(() => validateParams({ ...params, courierFee: DUST_LIMIT })).not.toThrow();
  });
  it("rejects float/number amounts", () => {
    expect(() => validateParams({ ...params, sellerAmount: 0.015 as unknown as bigint })).toThrow();
  });
  it("rejects identical destinations and block-height deadlines", () => {
    expect(() => validateParams({ ...params, courierLockingBytecode: seller.lb })).toThrow();
    expect(() => validateParams({ ...params, refundDeadline: 900_000n })).toThrow();
  });
  it("principal is exact integer sum", () => {
    expect(principal).toBe(1_700_000n);
    expect(typeof principal).toBe("bigint");
  });
  it("release works with a fee input that leaves no change output", () =>
    passes(releaseTx({ fee: { ...fee(), utxo: utxo(1_000n) } })));
});

describe("[local] parameter recovery and address reconstruction", () => {
  it("rebuilds identical addresses from saved JSON parameters", () => {
    const saved = JSON.parse(JSON.stringify(serializeParams(params)));
    const rebuilt = buildContracts(deserializeParams(saved), new MockNetworkProvider());
    expect(rebuilt.escrow.address).toBe(escrow.address);
    expect(rebuilt.collected.address).toBe(collected.address);
    expect(rebuilt.escrow.bytecode).toBe(escrow.bytecode);
  });
  it("any changed parameter changes both addresses", () => {
    const r = buildContracts({ ...params, courierFee: params.courierFee + 1n }, new MockNetworkProvider());
    expect(r.collected.address).not.toBe(collected.address);
    expect(r.escrow.address).not.toBe(escrow.address);
  });
});
