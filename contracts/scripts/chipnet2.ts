// Phase 2: phone-free chipnet funding. Chipnet coins only.
// Commands:
//   bun scripts/chipnet2.ts setup    -> generate keys + print funder address
//   bun scripts/chipnet2.ts fund     -> send exact principal into the escrow
//   bun scripts/chipnet2.ts address  -> reprint addresses from saved keys
import { ElectrumNetworkProvider, SignatureTemplate, TransactionBuilder } from "cashscript";
import {
  generatePrivateKey, secp256k1, hash160, hexToBin, binToHex,
  privateKeyToP2pkhCashAddress,
} from "@bitauth/libauth";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { buildContracts, relativeTimeAge } from "../src/params";

const STATE = new URL("./chipnet-state.json", import.meta.url);
const PRINCIPAL = 1200000n; // 0.012 BCH
const MINER_FEE = 500n;     // sats for the funding transaction fee

function p2pkhBytecode(pk: Uint8Array): Uint8Array {
  return hexToBin("76a914" + binToHex(hash160(pk)) + "88ac");
}

function funderAddress(privBytes: Uint8Array): string {
  const r: any = privateKeyToP2pkhCashAddress({ privateKey: privBytes, prefix: "bchtest" });
  return typeof r === "string" ? r : r.address;
}

const mode = process.argv[2] ?? "address";
const provider = new ElectrumNetworkProvider("chipnet");

let state: any;
if (mode === "setup" || !existsSync(STATE)) {
  if (mode !== "setup") {
    console.log("No saved state found. Run: bun scripts/chipnet2.ts setup");
    process.exit(1);
  }
  const buyerPriv = generatePrivateKey();
  const sellerPriv = generatePrivateKey();
  const courierPriv = generatePrivateKey();
  const funderPriv = generatePrivateKey();
  state = {
    buyerPriv: binToHex(buyerPriv),
    sellerPriv: binToHex(sellerPriv),
    courierPriv: binToHex(courierPriv),
    funderPriv: binToHex(funderPriv),
    sellerAmount: "1000000",
    courierFee: "200000",
    refundDeadline: (BigInt(Math.floor(Date.now() / 1000)) + 2n * 60n * 60n).toString(),
    fallbackAge: relativeTimeAge(48 * 60 * 60).encoded.toString(),
  };
  writeFileSync(STATE, JSON.stringify(state, null, 2));
  console.log("New throwaway keys saved to scripts/chipnet-state.json");
} else {
  state = JSON.parse(readFileSync(STATE, "utf8"));
}

const buyerPk = secp256k1.derivePublicKeyCompressed(hexToBin(state.buyerPriv)) as Uint8Array;
const sellerPk = secp256k1.derivePublicKeyCompressed(hexToBin(state.sellerPriv)) as Uint8Array;
const courierPk = secp256k1.derivePublicKeyCompressed(hexToBin(state.courierPriv)) as Uint8Array;
const funderPrivBytes = hexToBin(state.funderPriv);
const funderBytecode = p2pkhBytecode(secp256k1.derivePublicKeyCompressed(funderPrivBytes) as Uint8Array);

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
console.log("Collected address:", collected.address);
console.log("Principal (sats) :", principal.toString());
console.log("Funder address   :", funderAddress(funderPrivBytes));

if (mode === "fund") {
  const addr = funderAddress(funderPrivBytes);
  const utxos = await provider.getUtxos(addr);
  let total = 0n;
  for (const u of utxos) total += u.satoshis;
  if (total < PRINCIPAL + MINER_FEE) {
    console.log("Funder total is " + total + " sats; need at least " + (PRINCIPAL + MINER_FEE) + ". Claim more faucet coins, then run fund again.");
    process.exit(1);
  }
  const signer = new SignatureTemplate(funderPrivBytes);
  const tb = new TransactionBuilder({ provider });
  for (const u of utxos) tb.addInput(u, signer.unlockP2PKH());
  tb.addOutput({ to: escrow.address as any, amount: PRINCIPAL });
  const change = total - PRINCIPAL - MINER_FEE;
  if (change > 0n) tb.addOutput({ to: funderBytecode, amount: change });
  const tx = await tb.send();
  console.log("ESCROW FUNDED. Transaction id:", tx.txid);
  console.log("Send this txid to Littlebird so it can be checked on the explorer.");
}