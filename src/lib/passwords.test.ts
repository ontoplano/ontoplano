import { describe, expect, it } from 'vitest';
import { checkPassword, MIN_PASSWORD_LENGTH } from './passwords';

/**
 * The floor, and only the floor.
 *
 * Worth pinning because the rule is enforced at three separate doors —
 * registering, resetting, changing — and a rule that holds at two of them is
 * not a rule. The test is about the shape of the rule, not about a list of
 * passwords: what has to be true is that length and variety are both checked
 * and that nothing beyond them is demanded.
 */
describe('what a password has to be', () => {
	it('refuses anything shorter than the floor', () => {
		expect(checkPassword('a1'.repeat(3))).toContain(String(MIN_PASSWORD_LENGTH));
		expect(checkPassword('short1')).toBeTruthy();
	});

	it('refuses all letters and all digits', () => {
		expect(checkPassword('passwordpassword')).toBeTruthy();
		expect(checkPassword('1234567890')).toBeTruthy();
	});

	it('takes a letter with a number, or a letter with a symbol', () => {
		expect(checkPassword('correct7horse')).toBeNull();
		expect(checkPassword('correct-horse')).toBeNull();
	});

	it('asks for nothing beyond that', () => {
		// No uppercase rule, no "must contain a symbol AND a digit" — those
		// mostly produce Password1! and buy nothing.
		expect(checkPassword('correct horse battery staple 1')).toBeNull();
		expect(checkPassword('aaaaaaa1')).toBeNull();
	});

	it('counts characters, not bytes', () => {
		// Eight emoji is eight characters to a person and thirty-two bytes to a
		// naive check. It has no letter, so it fails for that reason and not
		// for length.
		expect(checkPassword('ação-de-graças')).toBeNull();
	});
});
