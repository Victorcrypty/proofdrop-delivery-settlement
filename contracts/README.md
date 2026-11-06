# ProofDrop contracts — LOCAL / CHIPNET PROTOTYPE ONLY

Isolated from the app. Nothing here broadcasts, connects a wallet or uses mainnet.
Not audited. Test keys are throwaway values that hold no funds.

- `src/EscrowContract.cash`, `src/CollectedContract.cash` — contract sources
- `src/params.ts` — parameters, validation, build, save/restore
- `src/tx.ts` — local transaction builders (debug only, never `send()`)
- `scripts/compile.ts` — writes `artifacts/*.json`
- `test/contracts.test.ts` — local VM tests

Run: `bun run compile` and `bun run test` from this folder.
