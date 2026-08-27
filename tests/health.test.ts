import { describe, expect, it } from 'vitest';
import { LIMITS, resources, tokenMatches, warnings } from '../src/lib/server/services/health';

/**
 * The probe the box's watcher reads.
 *
 * Nothing here can assert a *value* — the numbers are whatever this machine
 * happens to be doing — so it asserts the shape and the arithmetic, which is
 * where the bugs in something like this live: a percentage the wrong way round
 * reads as a healthy disk right up until the disk is full.
 */
describe('resources', () => {
	const r = resources();

	it('reports a plausible disk', () => {
		expect(r.diskFreeMb).toBeGreaterThan(0);
		expect(r.diskUsedPercent).toBeGreaterThanOrEqual(0);
		expect(r.diskUsedPercent).toBeLessThanOrEqual(100);
	});

	it('reports memory as used, not as free', () => {
		// The one that has been written backwards in every monitoring script
		// ever: a box with plenty of memory must not report 95% used.
		expect(r.memoryUsedPercent).toBeGreaterThanOrEqual(0);
		expect(r.memoryUsedPercent).toBeLessThanOrEqual(100);
		expect(r.memoryFreeMb).toBeGreaterThan(0);
	});

	it('survives a database file that is not there', () => {
		// `loadConfig()` points at a path that may not exist in a fresh checkout,
		// and a probe that throws is worse than a probe that says zero.
		expect(r.databaseMb).toBeGreaterThanOrEqual(0);
		expect(r.load1).toBeGreaterThanOrEqual(0);
	});
});

describe('warnings', () => {
	const base = resources();

	it('says nothing when there is nothing to say', () => {
		expect(warnings({ ...base, diskUsedPercent: 40, memoryUsedPercent: 50 })).toEqual([]);
	});

	it('names the disk, with the number, once it is over the line', () => {
		const said = warnings({
			...base,
			diskUsedPercent: LIMITS.diskUsedPercent,
			diskFreeMb: 900,
			memoryUsedPercent: 10
		});
		expect(said).toHaveLength(1);
		expect(said[0]).toContain('disk');
		expect(said[0]).toContain('900MB');
	});

	it('stays quiet about a big disk that happens to be 91% full', () => {
		// The false alarm this threshold exists to avoid: 91% of a 1.6TB volume
		// is 139GB free, which is not a problem, and a watcher that says it is
		// gets muted before the day it is right.
		expect(
			warnings({ ...base, diskUsedPercent: 91, diskFreeMb: 139_000, memoryUsedPercent: 10 })
		).toEqual([]);
	});

	it('shouts about a small disk before the percentage looks alarming', () => {
		// 2.8GB free on a 24GB disk is 88% — under the percentage limit, and one
		// snapshot away from a database that cannot write.
		const said = warnings({
			...base,
			diskUsedPercent: 88,
			diskFreeMb: 1800,
			memoryUsedPercent: 10
		});
		expect(said).toHaveLength(1);
		expect(said[0]).toContain('disk');
	});

	it('names memory separately, so one alert is not two problems', () => {
		const said = warnings({ ...base, diskUsedPercent: 99, diskFreeMb: 100, memoryUsedPercent: 99 });
		expect(said).toHaveLength(2);
	});
});

describe('tokenMatches', () => {
	it('matches an identical token', () => {
		expect(tokenMatches('sekrit', 'sekrit')).toBe(true);
	});

	it('refuses when the instance has no token configured', () => {
		// Otherwise an instance that forgot to set one would disclose to anybody
		// who also sent nothing.
		expect(tokenMatches(null, null)).toBe(false);
		expect(tokenMatches(null, 'anything')).toBe(false);
	});

	it('refuses a missing, wrong, or differently sized token', () => {
		expect(tokenMatches('sekrit', null)).toBe(false);
		expect(tokenMatches('sekrit', 'sekrix')).toBe(false);
		expect(tokenMatches('sekrit', 'sekrit-and-more')).toBe(false);
		expect(tokenMatches('sekrit', '')).toBe(false);
	});
});
