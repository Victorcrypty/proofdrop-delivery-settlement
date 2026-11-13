# ProofDrop

ProofDrop is a trust-minimized Bitcoin Cash delivery settlement system for high-value peer-to-peer commerce. A buyer, seller, and courier coordinate a delivery transaction, and payment stays locked until the agreed collection and delivery confirmations are completed.

"Secure the handoff, not just the payment."

## Status

- Polished product interface with a fully tested local demo flow (normal settlement, delivery code, refund after deadline).
- Two CashScript contracts (EscrowContract, CollectedContract) with 28 local tests covering release, refund, timelock, and fallback branches.
- Real BCH settlement integration in progress.

## Design principles

- Buyer and courier actions are attestations. The chain never claims to know a package physically arrived.
- Every simulated reference is labeled "Demo reference."
- Settlement logic is separated behind a swappable adapter.

## Development

Clone, install, and run:

    git clone <this-repository-url>
    cd proofdrop-delivery-settlement
    npm install
    npm run dev

Built with AI-assisted development (Lovable) with contracts authored and tested via CashScript.
