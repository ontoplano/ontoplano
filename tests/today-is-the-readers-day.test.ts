/**
 * "Today" is the day where the person is, not in UTC.
 *
 * Reported from São Paulo at nine in the evening: the app had already moved
 * on to the 21st while it was still Sunday the 20th for him. `toISOString()`
 * is UTC, so every form that defaulted to today offered tomorrow for the last
 * hours of the evening — which is exactly when somebody writing down what
 * they did is likely to be doing it.
 */
import { describe, expect, test } from 'vitest';
import { dayStamp, today } from '../src/lib/when';

// `ja-JP` is not one of the app's languages; the zone is what this is about,
// and the stamp is written in `en-CA` whatever the reader's language.
const saoPaulo = { locale: 'pt-BR', tz: 'America/Sao_Paulo', clock: 'auto' } as const;
const tokyo = { locale: 'en', tz: 'Asia/Tokyo', clock: 'auto' } as const;

describe('the day a moment falls on', () => {
	test('is the reader’s day, not the UTC one', () => {
		// 01:30 UTC on the 21st is 22:30 on the 20th in São Paulo.
		const late = new Date('2026-09-21T01:30:00Z');
		expect(late.toISOString().slice(0, 10)).toBe('2026-09-21');
		expect(dayStamp(late, saoPaulo)).toBe('2026-09-20');
	});

	test('and the other way, east of UTC', () => {
		// 22:00 UTC on the 20th is already the 21st in Tokyo.
		expect(dayStamp(new Date('2026-09-20T22:00:00Z'), tokyo)).toBe('2026-09-21');
	});

	test('a bare day is that day, wherever it is read', () => {
		// A stored `YYYY-MM-DD` is a wall-clock day and must not shift.
		expect(dayStamp('2026-09-20', saoPaulo)).toBe('2026-09-20');
		expect(dayStamp('2026-09-20', tokyo)).toBe('2026-09-20');
	});

	test('today is the same shape everything else stores', () => {
		expect(today(saoPaulo)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});
