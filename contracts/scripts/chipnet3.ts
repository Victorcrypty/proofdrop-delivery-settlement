// Phase 3: courier collection spend on chipnet. Chipnet coins only.
// Command:
//   bun scripts/chipnet3.ts collect
import { ElectrumNetworkProvider, SignatureTemplate, type FeeInput } from "cashscript";
import {
  secp256k1, hash160, hexToBin, binToHex,
  privateKeyToP2pkhCashAddress,
} from "@bitauth/libauth";
import { readFileSync } from "node:fs";
import { buildContracts } from "../src/params";
import { buildCollect } from "../src/tx";

const STATE = new URL("./chipnet-state.json", import.meta.url);
const MINER_FEE = 2000n; // generous fee, keeps fee-per-byte above the 1.0 minimum

function p2pkhBytecode(pk: Uint8Array): Uint8Array {
  return hexToBin("76a914" + binToHex(hash160(pk)) + "88ac");
}

const state = JSON.parse(readFileSync(STATE, "utf8"));
const provider = new ElectrumNetworkProvider("chipnet");

const buyerPk = secp256k1.derivePublicKeyCompressed(hexToBin(state.buyerPriv)) as Uint8Array;
const sellerPk = secp256k1.derivePublicKeyCompressed(hexToBin(state.sellerPriv)) as Uint8Array;
const courierPk = secp256k1.derivePublicKeyCompressed(hexToBin(state.courierPriv)) as Uint8Array;
const funderPrivBytes = hexToBin(state.funderPriv);

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
console.log("Escrow address   :", escrow.address);
console.log("Principal (sats) :", principal.toString());

const escrowUtxos = await provider.getUtxos(escrow.address);
const escrowUtxo = escrowUtxos.find((u) => u.satoshis === principal);
if (!escrowUtxo) {
  console.log("No escrow UTXO with the exact principal found. If the funding tx is still unconfirmed, wait a few minutes and retry.");
  process.exit(1);
}
console.log("Escrow UTXO      :", escrowUtxo.txid + ":" + escrowUtxo.vout, "=", escrowUtxo.satoshis, "sats");

// fee input: the funder's largest UTXO pays the miner fee
const funderAddr: any = privateKeyToP2pkhCashAddress({ privateKey: funderPrivBytes, prefix: "bchtest" });
const addr = typeof funderAddr === "string" ? funderAddr : funderAddr.address;
const funderUtxos = await provider.getUtxos(addr);
const feeUtxo = funderUtxos.sort((a, b) => Number(b.satoshis) - Number(a.satoshis))[0];
if (!feeUtxo) {
  console.log("No funder UTXO for the fee. Claim more faucet coins to the funder address.");
  process.exit(1);
}
const feeInput: FeeInput = {
  utxo: feeUtxo,
  signer: new SignatureTemplate(funderPrivBytes),
  changeTo: p2pkhBytecode(buyerPk),
  fee: MINER_FEE,
};

const courier = new SignatureTemplate(hexToBin(state.courierPriv));
const collectedBytecode = hexToBin((collected as any).lockingBytecode);
const tb = buildCollect({
  provider, escrow, escrowUtxo,
  courier,
  to: collectedBytecode,
  amount: principal,
  fee: feeInput,
});
const tx = await tb.send();
console.log("COLLECT BROADCAST. Transaction id:", tx.txid);
console.log("The principal has moved from the escrow into the CollectedContract.");