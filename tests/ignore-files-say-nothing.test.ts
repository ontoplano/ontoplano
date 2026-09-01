import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A published ignore file describes whatever it names.
 *
 * `.gitignore` and `.dockerignore` ship with the repository, so every line in
 * them tells a stranger something: which editor somebody uses, what their
 * private notes are called, which sibling checkouts sit beside this one. That
 * is what `.git/info/exclude` is for — it does the same job and is not
 * published.
 *
 * So the rule this pins is a boundary rather than a list: nothing named in
 * `.git/info/exclude` may also appear in a file that ships. Deriving it that
 * way means this test needs no denylist of its own — a test that spelled out
 * the private names would be the same leak, one file over.
 */
const ROOT = join(import.meta.dirname, '..');
const PUBLISHED = ['.gitignore', '.dockerignore'];

/** The patterns in an ignore file: no comments, no blank lines, no negations. */
function patterns(text: string): string[] {
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith('#') && !line.startsWith('!'))
		.map((line) => line.replace(/^\/+/, '').replace(/\/+$/, ''))
		.filter(Boolean);
}

describe('the ignore files that ship', () => {
	const excludePath = join(ROOT, '.git', 'info', 'exclude');

	it.runIf(existsSync(excludePath))('name nothing that .git/info/exclude names', () => {
		const private_ = patterns(readFileSync(excludePath, 'utf8')).filter(
			// Wildcards match too much to compare as words, and the harness's own
			// entries under .claude/ are not this project's business either.
			(p) => !p.includes('*') && !p.includes('/')
		);

		for (const file of PUBLISHED) {
			const path = join(ROOT, file);
			if (!existsSync(path)) continue;
			const published = readFileSync(path, 'utf8');

			for (const name of private_) {
				expect(
					published.includes(name),
					`${file} names "${name}", which .git/info/exclude already hides. ` +
						`A published ignore file announces whatever it ignores — take the line out.`
				).toBe(false);
			}
		}
	});

	it('keeps .dockerignore an allowlist, so a new private file is excluded by default', () => {
		const rules = patterns(readFileSync(join(ROOT, '.dockerignore'), 'utf8'));
		expect(rules[0]).toBe('*');
	});
});
