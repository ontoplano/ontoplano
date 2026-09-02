import { describe, expect, it } from 'vitest';
import {
	pictureCeiling,
	reconcileBodyLimit,
	parseByteSize
} from '../src/lib/server/db/assert-body-limit';

/**
 * The setting that made the configured maximum impossible.
 *
 * `adapter-node` defaults `BODY_SIZE_LIMIT` to 512kB and answers anything
 * larger with a plain-text 413 before this app's code runs — so the refusal
 * carries no sentence, and a page waiting for a form action's JSON reports
 * `JSON.parse: unexpected character at line 1 column 1` on a 500 page. That is
 * what uploading a 1.1MB photograph looked like, and it named nothing anybody
 * had done.
 *
 * The 500kB pictures this app ships as its default were *already* over that
 * default once multipart framing is counted, so the maximum it advertised could
 * never be uploaded. Two numbers that have to agree, and nothing compared them.
 */
describe('reading a size', () => {
	it('takes the spellings adapter-node takes', () => {
		expect(parseByteSize('512K')).toBe(512 * 1024);
		expect(parseByteSize('12M')).toBe(12 * 1024 * 1024);
		expect(parseByteSize('1G')).toBe(1024 ** 3);
		expect(parseByteSize('1048576')).toBe(1048576);
		expect(parseByteSize('1.5M')).toBe(1.5 * 1024 * 1024);
		expect(parseByteSize(' 8M ')).toBe(8 * 1024 * 1024);
	});

	it('says nothing rather than guessing', () => {
		expect(parseByteSize(undefined)).toBeNull();
		expect(parseByteSize('')).toBeNull();
		expect(parseByteSize('lots')).toBeNull();
	});
});

/**
 * It threw once, and that was the wrong answer.
 *
 * The first version refused to start when the two numbers disagreed, and it
 * took a staging instance down within the hour: the unit on that box had been
 * written before the variable existed, so the first deploy carrying the check
 * crash-looped an app that had been serving perfectly. A misconfigured ceiling
 * is not a reason to refuse to serve anything at all.
 */
describe('reconciling the two numbers', () => {
	it('keeps serving, at the smaller ceiling', () => {
		const said: string[] = [];
		// Unset is adapter-node's 512K; 500KB pictures do not fit inside it.
		const kilobytes = reconcileBodyLimit(500, undefined, (m) => said.push(m));

		expect(kilobytes).toBeLessThan(500);
		expect(kilobytes).toBeGreaterThan(300);
		expect(said).toHaveLength(1);
		expect(said[0]).toContain('BODY_SIZE_LIMIT');
		expect(said[0]).toContain('12M');
	});

	it('says nothing when the two agree', () => {
		const said: string[] = [];
		expect(reconcileBodyLimit(500, '12M', (m) => said.push(m))).toBe(500);
		expect(said).toEqual([]);
	});

	it('never clamps below something a picture fits in', () => {
		// A limit so small nothing fits is a broken box either way; the floor
		// keeps the app usable rather than making every upload impossible.
		expect(pictureCeiling(500, '32K').kilobytes).toBeGreaterThanOrEqual(16);
	});

	it('takes zero as "no limit", because that is what it means', () => {
		expect(pictureCeiling(20000, '0')).toEqual({ kilobytes: 20000, clamped: false, limit: 0 });
	});

	it('leaves room for the envelope around the file', () => {
		expect(pictureCeiling(500, '500K').clamped).toBe(true);
		expect(pictureCeiling(500, '600K').clamped).toBe(false);
	});
});
