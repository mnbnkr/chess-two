import { mkdir } from 'node:fs/promises';
import { $ } from 'bun';

await $`bun build ./src/main.js --target=browser --format=iife --outfile=chess-two.bundle.js`;
await mkdir('public', { recursive: true });
await Bun.write('public/chess-two.bundle.js', Bun.file('chess-two.bundle.js'));
