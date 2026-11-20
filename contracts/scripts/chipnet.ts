// Phase 1: build both contracts for chipnet and print the escrow address.
// Throwaway keys; chipnet coins only. Never put mainnet keys in this script.
import { ElectrumNetworkProvider } from "cashscript";
import { generatePrivateKey, secp256k1, hash160, hexToBin, binToHex } from "@bitauth/libauth";
import { buildContracts, relativeTimeAge } from "../src/params";

// --- three throwaway chipnet keys ---
const buyerPriv = generatePrivateKey();
const sellerPriv = generatePrivateKey();
const courierPriv = generatePrivateKey();
const buyerPk = secp256k1.derivePublicKeyCompressed(buyerPriv) as Uint8Array;
const sellerPk = secp256k1.derivePublicKeyCompressed(sellerPriv) as Uint8Array;
const courierPk = secp256k1.derivePublicKeyCompressed(courierPriv) as Uint8Array;

// --- P2PKH locking bytecode, same construction as the test file ---
function p2pkhBytecode(pk: Uint8Array): Uint8Array {
  return hexToBin("76a914" + binToHex(hash160(pk)) + "88ac");
}

const buyerBytecode = p2pkhBytecode(buyerPk);
const sellerBytecode = p2pkhBytecode(sellerPk);
const courierBytecode = p2pkhBytecode(courierPk);

// --- amounts (integer satoshis, scaled to your faucet coins) ---
const sellerAmount = 1000000n; // 0.01 BCH
const courierFee = 200000n;    // 0.002 BCH
const refundDeadline = BigInt(Math.floor(Date.now() / 1000) + 2 * 60 * 60); // 2h from now
const fallbackAge = BigInt(relativeTimeAge(48 * 60 * 60).encoded);

const provider = new ElectrumNetworkProvider("chipnet");
const { escrow, collected, principal } = buildContracts({
  buyerPk, sellerPk, courierPk,
  buyerLockingBytecode: buyerBytecode,
  sellerLockingBytecode: sellerBytecode,
  courierLockingBytecode: courierBytecode,
  sellerAmount, courierFee, refundDeadline, fallbackAge,
}, provider);

console.log("Escrow address   :", escrow.address);
console.log("Collected address:", collected.address);
console.log("Buyer bytecode   :", binToHex(buyerBytecode));
console.log("Seller bytecode  :", binToHex(sellerBytecode));
console.log("Courier bytecode :", binToHex(courierBytecode));
console.log("Principal (sats) :", principal.toString());
console.log("Refund deadline  :", refundDeadline.toString(), "(2h from now)");