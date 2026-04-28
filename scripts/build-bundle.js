import { mkdir } from 'node:fs/promises';
import { $ } from 'bun';

await $`bun build ./src/main.js --target=browser --format=iife --outfile=chess-two.bundle.js`;
await mkdir('public', { recursive: true });
// Vite serves/copies public assets from the site root; direct index.html launch reads the root bundle.
await Bun.write('public/chess-two.bundle.js', Bun.file('chess-two.bundle.js'));
