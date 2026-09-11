/**
 * Put SQLite's wasm where the browser can fetch it.
 *
 * The database runs on the device, and the module that runs it asks for
 * `sqlite3.wasm` over HTTP at startup. Vite does not serve a dependency's
 * binary by itself, so it is copied into `static/` — and copied rather than
 * committed, because a 900KB binary in the repository is a 900KB binary in
 * every clone, forever, for a file that is already in `node_modules`.
 *
 * Run before `dev` and before `build`; `static/sqlite3.wasm` is ignored by git.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FROM = join(ROOT, 'node_modules', '@sqlite.org', 'sqlite-wasm', 'dist', 'sqlite3.wasm');
const TO = join(ROOT, 'static', 'sqlite3.wasm');

if (!existsSync(FROM)) {
	console.error('No sqlite3.wasm in node_modules — run an install first.');
	process.exit(1);
}

mkdirSync(dirname(TO), { recursive: true });
copyFileSync(FROM, TO);
console.log('sqlite: wasm copied into static/');
