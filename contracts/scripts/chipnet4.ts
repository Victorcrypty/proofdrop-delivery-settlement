// Phase 4: buyer release on chipnet. Chipnet coins only.
// Command:
//   bun scripts/chipnet4.ts release
import { ElectrumNetworkProvider, SignatureTemplate, type FeeInput } from "cashscript";
import {
  secp256k1, hash160, hexToBin, binToHex,
  privateKeyToP2pkhCashAddress,
} from "@bitauth/libauth";
import { readFileSync } from "node:fs";
import { buildContracts } from "../src/params";
import { buildRelease } from "../src/tx";

const STATE = new URL("./chipnet-state.json", import.meta.url);
const MINER_FEE = 2000n;

function p2pkhBytecode(pk: Uint8Array): Uint8Array {
  return hexToBin("76a914" + binToHex(hash160(pk)) + "88ac");
}

const state = JSON.parse(readFileSync(STATE, "utf8"));
const provider = new ElectrumNetworkProvider("chipnet");

const buyerPk = secp256k1.derivePublicKeyCompressed(hexToBin(state.buyerPriv)) as Uint8Array;
const sellerPk = secp256k1.derivePublicKeyCompressed(hexToBin(state.sellerPriv)) as Uint8Array;
const courierPk = secp256k1.derivePublicKeyCompressed(hexToBin(state.courierPriv)) as Uint8Array;

const params = {
  buyerPk, sellerPk, courierPk,
  buyerLockingBytecode: p2pkhBytecode(buyerPk),
  sellerLockingBytecode: p2pkhBytecode(sellerPk),
  courierLockingBytecode: p2pkhBytecode(courierPk),
  sellerAmount: BigInt(state.sellerAmount),
  courierFee: BigInt(state.courierFee),
  refundDeadline: BigInt(state.refundDeadline),
  fallbackAge: BigInt(state.fallbackAge),
};

const { escrow, collected, principal } = buildContracts(params, provider);
console.log("Collected address:", collected.address);

const colUtxos = await provider.getUtxos(collected.address);
const colUtxo = colUtxos.find((u) => u.satoshis === principal);
if (!colUtxo) {
  console.log("No CollectedContract UTXO with the exact principal found. If the collect tx is still unconfirmed, wait and retry.");
  process.exit(1);
}
console.log("Collected UTXO   :", colUtxo.txid + ":" + colUtxo.vout, "=", colUtxo.satoshis, "sats");

// fee input: check every throwaway wallet for a spendable UTXO
const wallets: { name: string; priv: Uint8Array }[] = [
  { name: "funder", priv: hexToBin(state.funderPriv) },
  { name: "buyer", priv: hexToBin(state.buyerPriv) },
  { name: "seller", priv: hexToBin(state.sellerPriv) },
  { name: "courier", priv: hexToBin(state.courierPriv) },
];

let feeInput: FeeInput | null = null;
for (const w of wallets) {
  const r: any = privateKeyToP2pkhCashAddress({ privateKey: w.priv, prefix: "bchtest" });
  const waddr = typeof r === "string" ? r : r.address;
  const utxos = await provider.getUtxos(waddr);
  const best = utxos.sort((a, b) => Number(b.satoshis) - Number(a.satoshis))[0];
  if (best && best.satoshis > MINER_FEE) {
    console.log("Fee payer        :", w.name, "wallet,", best.satoshis, "sats at", waddr);
    feeInput = { utxo: best, signer: new SignatureTemplate(w.priv), changeTo: p2pkhBytecode(buyerPk), fee: MINER_FEE };
    break;
  }
}
if (!feeInput) {
  console.log("No wallet has a UTXO for the fee. Claim more faucet coins to the funder address.");
  process.exit(1);
}

const buyer = new SignatureTemplate(hexToBin(state.buyerPriv));
const tb = buildRelease({
  provider, collected, utxo: colUtxo,
  buyer,
  seller: { to: params.sellerLockingBytecode, amount: params.sellerAmount },
  courier: { to: params.courierLockingBytecode, amount: params.courierFee },
  fee: feeInput,
});
const tx = await tb.send();
console.log("RELEASE BROADCAST. Transaction id:", tx.txid);
console.log("Seller received", params.sellerAmount.toString(), "sats; courier received", params.courierFee.toString(), "sats.");