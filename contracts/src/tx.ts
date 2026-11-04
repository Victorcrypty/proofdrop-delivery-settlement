// Transaction construction helpers — LOCAL ONLY. These build and locally
// evaluate (debug) transactions; nothing here calls send() or broadcasts.
import { TransactionBuilder, SignatureTemplate, type Contract, type NetworkProvider, type Utxo } from "cashscript";

export interface FeeInput { utxo: Utxo; signer: SignatureTemplate; changeTo: Uint8Array; fee: bigint }

const feeChange = (f: FeeInput) => f.utxo.satoshis - f.fee;

function withFee(tb: TransactionBuilder, f?: FeeInput) {
  if (!f) return tb;
  tb.addInput(f.utxo, f.signer.unlockP2PKH());
  const change = feeChange(f);
  if (change > 0n) tb.addOutput({ to: f.changeTo, amount: change });
  return tb;
}

export function buildCollect(o: { provider: NetworkProvider; escrow: Contract; escrowUtxo: Utxo; courier: SignatureTemplate; to: Uint8Array; amount: bigint; fee?: FeeInput }) {
  const tb = new TransactionBuilder({ provider: o.provider })
    .addInput(o.escrowUtxo, o.escrow.unlock.collect!(o.courier))
    .addOutput({ to: o.to, amount: o.amount });
  return withFee(tb, o.fee);
}

export function buildRefund(o: { provider: NetworkProvider; escrow: Contract; escrowUtxo: Utxo; buyer: SignatureTemplate; to: Uint8Array; amount: bigint; locktime: number; fee?: FeeInput }) {
  const tb = new TransactionBuilder({ provider: o.provider })
    .addInput(o.escrowUtxo, o.escrow.unlock.refund!(o.buyer))
    .addOutput({ to: o.to, amount: o.amount })
    .setLocktime(o.locktime);
  return withFee(tb, o.fee);
}

type Payout = { to: Uint8Array; amount: bigint };

export function buildRelease(o: { provider: NetworkProvider; collected: Contract; utxo: Utxo; buyer: SignatureTemplate; seller: Payout; courier: Payout; fee?: FeeInput }) {
  const tb = new TransactionBuilder({ provider: o.provider })
    .addInput(o.utxo, o.collected.unlock.release!(o.buyer))
    .addOutput(o.seller).addOutput(o.courier);
  return withFee(tb, o.fee);
}

export function buildFallback(o: { provider: NetworkProvider; collected: Contract; utxo: Utxo; seller: SignatureTemplate; courier: SignatureTemplate; sequence: number; sellerOut: Payout; courierOut: Payout; fee?: FeeInput }) {
  const tb = new TransactionBuilder({ provider: o.provider })
    .addInput(o.utxo, o.collected.unlock.fallbackRelease!(o.seller, o.courier), { sequence: o.sequence })
    .addOutput(o.sellerOut).addOutput(o.courierOut);
  return withFee(tb, o.fee);
}

/** Local VM evaluation only. Throws if any input's script fails. */
export const evaluateLocally = (tb: TransactionBuilder) => tb.debug();
