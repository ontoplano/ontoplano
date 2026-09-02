import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * A setting exists in four places, and it has to exist in all four.
 *
 * `config.toml` is described by the `OntoplanoConfig` interface, written from
 * `DEFAULT_CONFIG` on first run, read by `loadConfig` and written back by
 * `saveConfig` — and those are four separate lists of the same keys, kept in
 * step by whoever remembers. Forgetting one of them fails quietly in a
 * particular way each time: a key missing from `DEFAULT_CONFIG` never appears
 * in a fresh instance's file, and a key missing from the writer is silently
 * dropped the first time the instance page saves anything.
 *
 * So the rule is checked rather than remembered: whatever the interface says
 * the config has, the default file mentions and a round trip through
 * `saveConfig` keeps.
 */
const SOURCE = readFileSync(join(process.cwd(), 'src/lib/server/config.ts'), 'utf8');

/** `section -> camelCase keys`, read out of the interface that types it. */
function declared(): Map<string, string[]> {
	const body = SOURCE.slice(
		SOURCE.indexOf('export interface OntoplanoConfig {'),
		SOURCE.indexOf('\n}', SOURCE.indexOf('export interface OntoplanoConfig {'))
	);

	const sections = new Map<string, string[]>();
	let current = '';
	let depth = 0;

	for (const raw of body.split('\n')) {
		const line = raw.trim();
		if (line.startsWith('*') || line.startsWith('/*') || line.startsWith('//')) continue;

		const opens = line.match(/^(\w+): \{$/);
		if (opens && depth === 0) {
			current = opens[1];
			sections.set(current, []);
			depth = 1;
			continue;
		}
		if (line === '};' || line === '}') {
			depth = 0;
			continue;
		}
		const key = line.match(/^(\w+)[?]?:/);
		if (depth === 1 && key) sections.get(current)?.push(key[1]);
	}

	return sections;
}

/** `firstDay` is `first_day` in the file. */
const snake = (camel: string) => camel.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

describe('config.toml', () => {
	const sections = declared();

	// The module reads ONTOPLANO_CONFIG_DIR once, when it loads, so each case
	// needs its own copy of it pointed at its own directory.
	beforeEach(() => vi.resetModules());

	it('has sections to check at all', () => {
		expect(sections.size).toBeGreaterThan(5);
		expect([...sections.keys()]).toContain('media');
	});

	it('writes every declared key into a fresh instance file', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'ontoplano-config-'));
		process.env.ONTOPLANO_CONFIG_DIR = dir;

		const config = await import('../src/lib/server/config');
		config.ensureConfig();
		const written = readFileSync(join(dir, 'config.toml'), 'utf8');

		const missing: string[] = [];
		for (const [section, keys] of sections) {
			if (!written.includes(`[${section}]`)) missing.push(`[${section}]`);
			for (const key of keys) {
				// The database path is written only when it is not the default one,
				// deliberately: a path baked into every fresh config is a path that
				// stops being right the moment somebody moves the data directory.
				if (section === 'database' && key === 'path') continue;
				if (!new RegExp(`^${snake(key)}\\s*=`, 'm').test(written))
					missing.push(`[${section}] ${snake(key)}`);
			}
		}

		expect(missing, 'declared in the interface, absent from DEFAULT_CONFIG').toEqual([]);
	});

	it('keeps every declared key through a save and a load', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'ontoplano-config-'));
		process.env.ONTOPLANO_CONFIG_DIR = dir;

		const config = await import('../src/lib/server/config');
		const loaded = config.loadConfig();
		config.saveConfig(loaded);
		const again = config.loadConfig();

		expect(again).toEqual(loaded);

		// And the file it wrote still mentions everything, which a reader that
		// falls back to the default would otherwise hide.
		const written = readFileSync(join(dir, 'config.toml'), 'utf8');
		const missing: string[] = [];
		for (const [section, keys] of sections)
			for (const key of keys) {
				if (section === 'database' && key === 'path') continue;
				if (!new RegExp(`^${snake(key)}\\s*=`, 'm').test(written))
					missing.push(`[${section}] ${snake(key)}`);
			}

		expect(missing, 'declared in the interface, dropped by saveConfig').toEqual([]);
	});

	it('refuses a picture ceiling somebody fat-fingered', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'ontoplano-config-'));
		process.env.ONTOPLANO_CONFIG_DIR = dir;
		writeFileSync(
			join(dir, 'config.toml'),
			'[media]\nmax_kilobytes = "50000000"\nrecipe_images = "0"\naccount_megabytes = "nonsense"\n'
		);

		const config = await import('../src/lib/server/config');
		const { media } = config.loadConfig();

		expect(media.maxKilobytes).toBeLessThanOrEqual(20_000);
		expect(media.recipeImages).toBeGreaterThanOrEqual(1);
		expect(media.accountMegabytes).toBe(250);
	});
});
