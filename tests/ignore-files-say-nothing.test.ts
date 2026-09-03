import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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

			const names = new Set(patterns(published));

			for (const name of private_) {
				/*
				 * A whole pattern, not a substring.
				 *
				 * It compared with `includes`, so `.claude` in the private file
				 * matched `.claude-docker/` in the published one and reported a
				 * leak between two unrelated names. What the rule is about is one
				 * thing being named in both files, and a name is the whole of a
				 * line rather than any run of characters inside one.
				 */
				expect(
					names.has(name),
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

/**
 * The one directory a private module is copied into.
 *
 * `make billing-provider` copies a payment integration from a checkout beside
 * this one into `src/lib/server/billing/providers/`, and that file is the whole
 * of what this repository deliberately does not contain. Nothing but the
 * directory's own ignore file stands between it and a `git add -A`, so the
 * ignore file is tested rather than trusted — and it is tested by asking git,
 * not by reading the patterns, because what matters is the answer git gives.
 */
describe('the slot a payment provider is copied into', () => {
	const dir = join(ROOT, 'src/lib/server/billing/providers');

	it('ignores anything dropped in it', () => {
		const probe = join(dir, 'probe.ts');
		try {
			writeFileSync(probe, '// written by a test\n');
			const ignored = execFileSync('git', ['check-ignore', probe], {
				cwd: ROOT,
				encoding: 'utf8'
			}).trim();
			expect(ignored).toBe(probe);
		} finally {
			rmSync(probe, { force: true });
		}
	});

	it('keeps the two files that describe the empty slot', () => {
		for (const name of ['.gitignore', 'README.md']) {
			const tracked = execFileSync('git', ['ls-files', join(dir, name)], {
				cwd: ROOT,
				encoding: 'utf8'
			}).trim();
			expect(tracked, `${name} has to stay in the repository`).not.toBe('');
		}
	});
});
