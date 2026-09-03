import { readdirSync } from 'node:fs';
import { useProvider } from './index.js';

/**
 * Find the payment provider from disk, for a process Vite never built.
 *
 * `index.ts` resolves the provider with `import.meta.glob`, which only exists
 * inside a Vite build. The nightly reconcile runs under plain `tsx`, where the
 * glob is empty and every instance would look like one that takes no payments —
 * so a subscription the provider had already cancelled would never be noticed,
 * silently, once a night.
 *
 * This is the same answer arrived at the slow way: read the directory, import
 * what is in it, hand it to `useProvider()`. Asynchronous, which is why it is
 * not what the app itself uses — most callers of `provider()` are not.
 *
 * Call it once, before anything asks about billing. Doing nothing is a correct
 * outcome: an instance with no provider is the ordinary case.
 */
export async function loadProvider(): Promise<boolean> {
	const dir = new URL('./providers/', import.meta.url);

	let files: string[];
	try {
		files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
	} catch {
		return false;
	}

	for (const file of files) {
		const module = await import(new URL(file, dir).href);
		if (module?.provider) {
			useProvider(module.provider);
			return true;
		}
	}

	return false;
}
