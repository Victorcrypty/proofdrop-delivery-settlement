// Phase 5: refund-after-deadline test on chipnet. Chipnet coins only.
// Commands:
//   bun scripts/chipnet5.ts fund    -> build + fund a small escrow with a PAST deadline
//   bun scripts/chipnet5.ts refund  -> buyer refunds it back after the deadline
import { ElectrumNetworkProvider, SignatureTemplate, TransactionBuilder } from "cashscript";
import {
  secp256k1, hash160, hexToBin, binToHex,
  privateKeyToP2pkhCashAddress,
} from "@bitauth/libauth";
import { readFileSync } from "node:fs";
import { buildContracts } from "../src/params";

const STATE = new URL("./chipnet-state.json", import.meta.url);
const MINER_FEE = 2000n;
// Fixed PAST deadline: any unix time before 2026 passes the contract's sanity check.
const PAST_DEADLINE = 1700000000n; // Nov 2023

function p2pkhBytecode(pk: Uint8Array): Uint8Array {
  return hexToBin("76a914" + binToHex(hash160(pk)) + "88ac");
}

const state = JSON.parse(readFileSync(STATE, "utf8"));
const provider = new ElectrumNetworkProvider("chipnet");

const buyerPk = secp256k1.derivePublicKeyCompressed(hexToBin(state.buyerPriv)) as Uint8Array;
const sellerPk = secp256k1.derivePublicKeyCompressed(hexToBin(state.sellerPriv)) as Uint8Array;
const courierPk = secp256k1.derivePublicKeyCompressed(hexToBin(state.courierPriv)) as Uint8Array;

// Small second escrow: 700k seller + 200k courier = 900k principal
const params2 = {
  buyerPk, sellerPk, courierPk,
  buyerLockingBytecode: p2pkhBytecode(buyerPk),
  sellerLockingBytecode: p2pkhBytecode(sellerPk),
  courierLockingBytecode: p2pkhBytecode(courierPk),
  sellerAmount: 700000n,
  courierFee: 200000n,
  refundDeadline: PAST_DEADLINE,
  fallbackAge: BigInt(state.fallbackAge),
};

const { escrow, collected, principal } = buildContracts(params2, provider);
console.log("Refund-test escrow address:", escrow.address);
console.log("Principal (sats)          :", principal.toString());
console.log("Deadline (past)           :", PAST_DEADLINE.toString());

async function bestFeeWallet(): Promise<{ priv: Uint8Array; utxo: any } | null> {
  const wallets = [
    hexToBin(state.sellerPriv), hexToBin(state.buyerPriv),
    hexToBin(state.courierPriv), hexToBin(state.funderPriv),
  ];
  for (const priv of wallets) {
    const r: any = privateKeyToP2pkhCashAddress({ privateKey: priv, prefix: "bchtest" });
    const addr = typeof r === "string" ? r : r.address;
    const utxos = await provider.getUtxos(addr);
    const best = utxos.sort((a, b) => Number(b.satoshis) - Number(a.satoshis))[0];
    if (best && best.satoshis > MINER_FEE) return { priv, utxo: best };
  }
  return null;
}

const mode = process.argv[2] ?? "";

if (mode === "fund") {
  // fund from the seller wallet (it holds 1,000,000 sats)
  const sellerR: any = privateKeyToP2pkhCashAddress({ privateKey: hexToBin(state.sellerPriv), prefix: "bchtest" });
  const sellerAddr = typeof sellerR === "string" ? sellerR : sellerR.address;
  const utxos = await provider.getUtxos(sellerAddr);
  const total = utxos.reduce((s, u) => s + u.satoshis, 0n);
  if (total < principal + MINER_FEE) {
    console.log("Seller wallet has " + total + " sats; need " + (principal + MINER_FEE) + ".");
    process.exit(1);
  }
  const signer = new SignatureTemplate(hexToBin(state.sellerPriv));
  const tb = new TransactionBuilder({ provider });
  for (const u of utxos) tb.addInput(u, signer.unlockP2PKH());
  tb.addOutput({ to: escrow.address as any, amount: principal });
  const change = total - principal - MINER_FEE;
  if (change > 0n) tb.addOutput({ to: params2.sellerLockingBytecode, amount: change });
  const tx = await tb.send();
  console.log("ESCROW 2 FUNDED. Transaction id:", tx.txid);
} else if (mode === "refund") {
  const escrowUtxos = await provider.getUtxos(escrow.address);
  const escrowUtxo = escrowUtxos.find((u) => u.satoshis === principal);
  if (!escrowUtxo) {
    console.log("No escrow UTXO found yet. Run fund first, and if unconfirmed, wait and retry.");
    process.exit(1);
  }
  const feeWallet = await bestFeeWallet();
  if (!feeWallet) {
    console.log("No wallet has a UTXO for the fee.");
    process.exit(1);
  }
  const buyer = new SignatureTemplate(hexToBin(state.buyerPriv));
  const tb = new TransactionBuilder({ provider })
    .addInput(escrowUtxo, escrow.unlock.refund!(buyer), { sequence: 0xfffffffe })
    .addInput(feeWallet.utxo, new SignatureTemplate(feeWallet.priv).unlockP2PKH())
    .addOutput({ to: params2.buyerLockingBytecode, amount: principal })
    .setLocktime(Number(PAST_DEADLINE));
  const change = feeWallet.utxo.satoshis - MINER_FEE;
  if (change > 0n) tb.addOutput({ to: params2.buyerLockingBytecode, amount: change });
  const tx = await tb.send();
  console.log("REFUND BROADCAST. Transaction id:", tx.txid);
  console.log("The buyer got the principal back because the deadline had passed.");
} else {
  console.log("Usage: bun scripts/chipnet5.ts fund  OR  bun scripts/chipnet5.ts refund");
}