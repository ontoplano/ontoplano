// Password hash/verify utility using better-auth's scrypt format.
// Usage:
//   npx tsx src/lib/server/db/password.ts hash <password>
//   npx tsx src/lib/server/db/password.ts verify <password> <salt:hash>
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { hexToBytes } from '@noble/hashes/utils.js';

const config = { N: 16384, r: 16, p: 1, dkLen: 64 };

function toHex(b: Uint8Array): string {
	return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function generateKey(password: string, salt: string): Promise<Uint8Array> {
	return scryptAsync(password.normalize('NFKC'), salt, {
		...config,
		maxmem: 128 * config.N * config.r * 2
	});
}

async function hash(password: string): Promise<string> {
	const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
	const key = await generateKey(password, salt);
	return `${salt}:${toHex(key)}`;
}

async function verify(password: string, stored: string): Promise<boolean> {
	const [salt, expectedHex] = stored.split(':');
	if (!salt || !expectedHex) {
		console.error('Invalid hash format. Expected salt:hash');
		return false;
	}
	const key = await generateKey(password, salt);
	const expected = hexToBytes(expectedHex);
	if (key.length !== expected.length) return false;
	let diff = 0;
	for (let i = 0; i < key.length; i++) diff |= key[i] ^ expected[i];
	return diff === 0;
}

async function main() {
	const [, , command, ...args] = process.argv;

	if (command === 'hash' && args.length === 1) {
		console.log(await hash(args[0]));
	} else if (command === 'verify' && args.length === 2) {
		const ok = await verify(args[0], args[1]);
		console.log(ok ? '✓ match' : '✗ no match');
		process.exit(ok ? 0 : 1);
	} else {
		console.log(`Usage:
  npx tsx src/lib/server/db/password.ts hash <password>
  npx tsx src/lib/server/db/password.ts verify <password> <salt:hash>`);
		process.exit(1);
	}
}

main();
