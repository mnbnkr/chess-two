import { cp, mkdir } from "node:fs/promises";
import { $ } from "bun";

await $`bun build ./src/ai-worker.js --target=browser --format=iife --outfile=ai-worker.bundle.js`;
await mkdir("src/generated", { recursive: true });
// The UI creates one Blob worker from this embedded source so file:// launches
// and Vite/prod builds use the same non-blocking AI path.
const workerSource = await Bun.file("ai-worker.bundle.js").text();
await Bun.write(
  "src/generated/ai-worker-source.js",
  `export const AI_WORKER_SOURCE = ${JSON.stringify(workerSource)};\n`,
);
await $`bun build ./src/main.js --target=browser --format=iife --outfile=chess-two.bundle.js`;
await mkdir("public", { recursive: true });
await cp("assets", "public/assets", { recursive: true, force: true });
// Vite serves/copies public assets from the site root; direct index.html launch reads the root bundle.
await Bun.write("public/chess-two.bundle.js", Bun.file("chess-two.bundle.js"));
await Bun.write("public/ai-worker.bundle.js", Bun.file("ai-worker.bundle.js"));
