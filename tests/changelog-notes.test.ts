import { describe, expect, test } from 'vitest';
import { notesSince } from '../src/lib/server/changelog-notes';

const CHANGELOG = `# Changelog

Words about the file.

## 0.3.0 — 2026-10-03

- **Bold** lead, and \`code\`
  that wraps.
- Second.

## 0.2.1 — 2026-10-02

- Fixed a thing.

## 0.2.0 — 2026-10-01

- Old news.
`;

describe('the release mail', () => {
	test('carries everything since the last one that went', () => {
		expect(notesSince(CHANGELOG, '0.3.0', ['0.2.0'])).toEqual({
			versions: ['0.3.0', '0.2.1'],
			lines: ['Bold lead, and code that wraps.', 'Second.', 'Fixed a thing.']
		});
	});

	test('and only this version, the first time anything goes', () => {
		expect(notesSince(CHANGELOG, '0.3.0', []).versions).toEqual(['0.3.0']);
	});

	test('refuses a version the changelog does not have', () => {
		expect(() => notesSince(CHANGELOG, '9.9.9', [])).toThrow(/no entry/);
	});
});
