/**
 * What bounds the disk: the storage quota and per-stream retention.
 *
 * The rate limiter bounds requests; these bound rows. A producer inside its
 * write budget can add 86,400 points a day forever, and this is the pair of
 * mechanisms that stops that being how the instance dies.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Services = {
	streams: typeof import('../src/lib/server/services/streams');
	plans: typeof import('../src/lib/plans');
};

let s: Services;
const ctx = { userId: OWNER, now: new Date('2026-08-29T12:00:00Z'), tz: 'UTC' };

beforeAll(async () => {
	s = {
		streams: await import('../src/lib/server/services/streams'),
		plans: await import('../src/lib/plans')
	};
});

function point(daysAgo: number, id: string) {
	return {
		external_id: id,
		at: new Date(ctx.now.getTime() - daysAgo * 86400_000).toISOString(),
		value: daysAgo
	};
}

describe('the storage quota', () => {
	const realLimit = () => s.plans.PLANS.pro.limits.dataPoints;
	let saved: number | null;

	beforeAll(() => {
		saved = realLimit();
	});
	afterEach(() => {
		s.plans.PLANS.pro.limits.dataPoints = saved;
	});

	test('a batch that would go over the ceiling is refused whole', () => {
		s.streams.upsertStream(ctx, {
			slug: 'quota.test',
			name: 'Quota',
			source: 'test',
			kind: 'counter'
		});

		s.plans.PLANS.pro.limits.dataPoints = 10;

		const under = s.streams.pushPoints(
			ctx,
			'quota.test',
			Array.from({ length: 8 }, (_, i) => point(0, `u${i}`))
		);
		expect(under.accepted).toBe(8);

		expect(() =>
			s.streams.pushPoints(
				ctx,
				'quota.test',
				Array.from({ length: 5 }, (_, i) => point(0, `o${i}`))
			)
		).toThrow(/plan allows 10/i);

		// Refused whole: nothing from the failed batch landed.
		expect(s.streams.listPoints(ctx, 'quota.test')).toHaveLength(8);
	});

	test('a duplicate-only push costs no quota and is not refused', () => {
		s.plans.PLANS.pro.limits.dataPoints = 8;
		const again = s.streams.pushPoints(ctx, 'quota.test', [point(0, 'u0')]);
		expect(again.duplicates).toBe(1);
	});
});

describe('per-stream retention', () => {
	test('a push sweeps its own stream past the window', () => {
		s.streams.upsertStream(ctx, {
			slug: 'retention.test',
			name: 'Retention',
			source: 'test',
			kind: 'measurement',
			retention_days: 30
		});

		s.streams.pushPoints(ctx, 'retention.test', [
			point(45, 'ancient'),
			point(10, 'recent'),
			point(0, 'today')
		]);

		const kept = s.streams.listPoints(ctx, 'retention.test').map((p) => p.externalId);
		expect(kept).toEqual(expect.arrayContaining(['recent', 'today']));
		expect(kept).not.toContain('ancient');
	});

	test('a producer redeclaring without retention_days does not wipe it', () => {
		const { stream } = s.streams.upsertStream(ctx, {
			slug: 'retention.test',
			name: 'Retention',
			source: 'test',
			kind: 'measurement'
		});
		expect(stream.retentionDays).toBe(30);
	});

	test('the nightly sweep covers streams nobody pushed to', () => {
		// Backdate a stored point past the window, straight into the file — no
		// service lets a caller write an `at` and then not sweep it.
		database.exec(
			`insert into data_points (user_id, stream_id, external_id, at, local_date, value_num, meta, created_at)
			 select ?, id, 'stale', ?, ?, 1, '{}', ? from data_streams where slug = 'retention.test'`,
			OWNER,
			new Date(ctx.now.getTime() - 60 * 86400_000).toISOString(),
			'2026-06-30',
			ctx.now.toISOString()
		);

		const swept = s.streams.sweepAllStreams(ctx.now);
		expect(swept.deleted).toBeGreaterThanOrEqual(1);
		expect(s.streams.listPoints(ctx, 'retention.test').map((p) => p.externalId)).not.toContain(
			'stale'
		);
	});

	test('no window means nothing is ever deleted', () => {
		s.streams.upsertStream(ctx, {
			slug: 'forever.test',
			name: 'Forever',
			source: 'test',
			kind: 'measurement',
			retention_days: null
		});
		s.streams.pushPoints(ctx, 'forever.test', [point(3650, 'decade-old')]);
		s.streams.sweepAllStreams(ctx.now);
		expect(s.streams.listPoints(ctx, 'forever.test').map((p) => p.externalId)).toContain(
			'decade-old'
		);
	});
});
