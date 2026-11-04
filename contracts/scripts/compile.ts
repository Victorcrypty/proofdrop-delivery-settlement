// Compiles both .cash sources into JSON artifacts. Local only; no network access.
import { compileFile } from "cashc";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
mkdirSync(`${root}artifacts`, { recursive: true });
for (const name of ["EscrowContract", "CollectedContract"]) {
  const artifact = compileFile(new URL(`../src/${name}.cash`, import.meta.url));
  writeFileSync(`${root}artifacts/${name}.json`, JSON.stringify(artifact, null, 2));
  console.log(`compiled ${name} (cashc ${artifact.compiler.version})`);
}
