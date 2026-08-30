/**
 * Two small features whose whole value is in the parsing.
 *
 * Quotes are pasted in bulk from wherever somebody keeps them, which means the
 * import has to survive smart quotes, three kinds of dash, and the same list
 * pasted twice. The day's wins are three boxes that must edit in place rather
 * than accumulate — the same day saved twice is still three rows, and an
 * emptied box is a removal and not a blank.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let quotes: typeof import('../src/lib/server/services/quotes');
let wins: typeof import('../src/lib/server/services/wins');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	quotes = await import('../src/lib/server/services/quotes');
	wins = await import('../src/lib/server/services/wins');
	ctx = { userId: OWNER, now: new Date('2026-08-17T09:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
});

describe('quotes, one at a time', () => {
	test('keep their author', () => {
		const made = quotes.createQuote(ctx, { text: 'Plans are worthless', author: 'Eisenhower' });
		expect(made.text).toBe('Plans are worthless');
		expect(made.author).toBe('Eisenhower');
	});

	test('can have no author at all', () => {
		const made = quotes.createQuote(ctx, { text: 'Nobody said this' });
		expect(made.author).toBeFalsy();
	});

	test('refuse an empty one', () => {
		expect(() => quotes.createQuote(ctx, { text: '   ' })).toThrow();
	});

	test("are not another account's to delete", () => {
		const mine = quotes.listQuotes(ctx)[0];
		expect(() => quotes.deleteQuote(theirs, mine.id)).toThrow();
	});
});

describe('quotes, pasted in bulk', () => {
	test('take the author from after the dash, in any of its shapes', () => {
		const before = quotes.listQuotes(ctx).length;
		const result = quotes.importQuotes(
			ctx,
			[
				'The best way out is always through — Frost',
				'What gets measured gets managed -- Drucker',
				'Everything should be as simple as possible – Einstein'
			].join('\n')
		);

		expect(result.added).toBe(3);
		const added = quotes.listQuotes(ctx).slice(before);
		expect(added.map((q) => q.author)).toEqual(['Frost', 'Drucker', 'Einstein']);
	});

	test('strip the quotation marks people paste with', () => {
		quotes.importQuotes(ctx, '“A quote in smart quotes” — Somebody');
		const last = quotes.listQuotes(ctx).at(-1)!;
		expect(last.text).toBe('A quote in smart quotes');
	});

	test('skip the same list pasted twice rather than refusing it', () => {
		const line = 'Said exactly once — Nobody';
		const first = quotes.importQuotes(ctx, line);
		const second = quotes.importQuotes(ctx, line);

		expect(first.added).toBe(1);
		expect(second.added).toBe(0);
		expect(second.skipped).toBe(1);
	});

	test('ignore blank lines rather than storing them', () => {
		const result = quotes.importQuotes(ctx, '\n\nOne real line\n\n   \n');
		expect(result.added).toBe(1);
	});

	test('refuse an empty paste, and an absurd one', () => {
		expect(() => quotes.importQuotes(ctx, '   ')).toThrow();
		expect(() => quotes.importQuotes(ctx, Array(600).fill('line').join('\n'))).toThrow();
	});
});

describe("the day's wins", () => {
	test('save three and read three back', () => {
		wins.saveWins(ctx, { forDate: '2026-08-17', contents: ['ran', 'wrote', 'called Mum'] });
		expect(wins.listWins(ctx, '2026-08-17').map((w) => w.content)).toEqual([
			'ran',
			'wrote',
			'called Mum'
		]);
	});

	test('saving the same day again edits in place rather than piling up', () => {
		wins.saveWins(ctx, { forDate: '2026-08-17', contents: ['ran further', 'wrote', 'called Mum'] });
		const saved = wins.listWins(ctx, '2026-08-17');
		expect(saved).toHaveLength(3);
		expect(saved[0].content).toBe('ran further');
	});

	test('an emptied box removes its win rather than storing a blank', () => {
		wins.saveWins(ctx, { forDate: '2026-08-17', contents: ['ran further', '', '  '] });
		const saved = wins.listWins(ctx, '2026-08-17');
		expect(saved).toHaveLength(1);
		expect(saved[0].content).toBe('ran further');
	});

	test('another day is a different set', () => {
		wins.saveWins(ctx, { forDate: '2026-08-16', contents: ['rested'] });
		expect(wins.listWins(ctx, '2026-08-16')).toHaveLength(1);
		expect(wins.listWins(ctx, '2026-08-17')).toHaveLength(1);
	});

	test('and another account sees none of it', () => {
		expect(wins.listWins(theirs, '2026-08-17')).toHaveLength(0);
	});
});

describe('a device, as somebody would recognise it', () => {
	test('names the browser and the platform when both are there', async () => {
		const sessions = await import('../src/lib/server/services/sessions');
		expect(
			sessions.describeUserAgent(
				'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'
			)
		).toBe('Chrome on Android');
		expect(
			sessions.describeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Firefox/121.0')
		).toBe('Firefox on macOS');
	});

	test('does not call Edge or Opera "Chrome", which they both claim to be', async () => {
		const sessions = await import('../src/lib/server/services/sessions');
		expect(sessions.describeUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Edg/120')).toBe(
			'Edge on Windows'
		);
		expect(sessions.describeUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/120 OPR/106')).toBe(
			'Opera on Windows'
		);
	});

	test('says so plainly when it cannot tell', async () => {
		const sessions = await import('../src/lib/server/services/sessions');
		expect(sessions.describeUserAgent(null)).toBe('Unknown device');
		expect(sessions.describeUserAgent('curl/8.4.0')).toBe('Unknown device');
	});
});
