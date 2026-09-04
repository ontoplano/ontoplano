import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A form that is about to close does not empty itself first.
 *
 * SvelteKit's `update()` resets the form element by default. Where the handler
 * then closes the dialog, that reset is visible: on a phone the round trip is
 * long enough to watch every field blank and the screen shut over the empty
 * form it has just made. On a failure it is worse than visible — it throws away
 * what somebody typed.
 *
 * This has now been reported three times and fixed three times: once across
 * thirty-two handlers that used the implicit default, then on the block
 * editor, then on quick capture, which had written `reset: true` out in full
 * and so survived the sweep. Hence a test rather than a fourth fix.
 *
 * The rule it enforces: if the lines just after `update()` close the form —
 * `= false`, `= null`, `close()` — the reset must be off. A form that stays
 * open after saving is untouched, because clearing it is exactly right there.
 */
const CLOSES = /(close\w*\(\)|=\s*false;?|=\s*null;?)/;

function svelteFiles(dir: string, found: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) svelteFiles(path, found);
		else if (entry.endsWith('.svelte')) found.push(path);
	}
	return found;
}

describe('a form that closes on success', () => {
	it('does not blank itself on the way out', () => {
		const offenders: string[] = [];

		for (const file of [...svelteFiles('src/routes'), ...svelteFiles('src/lib')]) {
			const lines = readFileSync(file, 'utf8').split('\n');

			lines.forEach((line, i) => {
				// Only the resetting kinds: `update()` and `update({ reset: true })`.
				const resets =
					/await\s+update\(\s*\)/.test(line) || /update\(\{\s*reset:\s*true/.test(line);
				if (!resets) return;

				// What happens next, ignoring the comments that explain it.
				const after = lines
					.slice(i + 1, i + 5)
					.filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
					.join('\n');

				if (CLOSES.test(after)) {
					offenders.push(`${file}:${i + 1}`);
				}
			});
		}

		expect(
			offenders,
			`These reset a form and then close it — pass { reset: false }:\n  ${offenders.join('\n  ')}`
		).toEqual([]);
	});
});
