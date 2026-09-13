/**
 * What can be sent to this instance, decided before it is sent.
 *
 * `adapter-node` refuses a body over `BODY_SIZE_LIMIT` with a plain 413 before
 * any of this app's code runs, so nothing the app writes can explain it. A
 * 16MB account export against a 12MB ceiling came back as a 500 and "something
 * went wrong on our side"; choosing the same file instead hit a two-megabyte
 * cap meant for a task list, which left the box empty, so the form posted
 * nothing and the server answered "that file is not JSON" — true of the empty
 * string and of nothing else.
 */
import { describe, expect, test } from 'vitest';
import { inMegabytes, tooBigToSend } from '../src/lib/upload-ceiling';

describe('measuring what is about to be sent', () => {
	test('anything within the ceiling is fine', () => {
		expect(tooBigToSend(1_000, 12_582_912)).toBeNull();
		expect(tooBigToSend(12_582_912, 12_582_912)).toBeNull();
	});

	test('a ceiling of zero is an instance that set none', () => {
		expect(tooBigToSend(500_000_000, 0)).toBeNull();
	});

	test('over it, the answer names both numbers', () => {
		const said = tooBigToSend(16_253_435, 12_582_912);
		expect(said).toContain('16.3MB');
		expect(said).toContain('12.6MB');
	});

	/**
	 * And says what to do about it. Two ways out, because they belong to
	 * different people: whoever runs the instance can raise the ceiling, and
	 * whoever is at the machine does not have one.
	 */
	test('and what to do about it', () => {
		const said = tooBigToSend(16_253_435, 12_582_912)!;
		expect(said).toContain('BODY_SIZE_LIMIT');
		expect(said).toContain('make db-import');
	});

	test('sizes are written the way somebody reads them', () => {
		expect(inMegabytes(16_253_435)).toBe('16.3MB');
		expect(inMegabytes(0)).toBe('0.0MB');
	});
});
