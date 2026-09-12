import { describe, expect, it } from 'vitest';

import { sha256Hex } from '../src/lib/services/digest';

/** The vectors from FIPS 180-4, so a wrong implementation cannot look right. */
describe('the content hash', () => {
	it('hashes the empty input', async () =>
		expect(await sha256Hex(new Uint8Array())).toBe(
			'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
		));

	it('hashes "abc"', async () =>
		expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		));

	/*
	 * The trap this exists for: Node's `Buffer.slice` is a view, and a small
	 * Buffer is carved out of a shared pool, so hashing `.buffer` hashes the
	 * pool. Two different pictures came out with the same fingerprint.
	 */
	it('hashes a Node Buffer as the bytes it holds, not the pool behind it', async () => {
		const abc = Buffer.from('abc');
		const other = Buffer.from('xyz');
		expect(await sha256Hex(abc)).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		);
		expect(await sha256Hex(other)).not.toBe(await sha256Hex(abc));
	});

	it('hashes a view into a bigger buffer as just that view', async () => {
		const whole = new TextEncoder().encode('xxabcxx');
		expect(await sha256Hex(whole.subarray(2, 5))).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		);
	});
});
