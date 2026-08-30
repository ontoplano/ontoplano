/**
 * What a password has to be.
 *
 * Shared between the browser and the server on purpose: the form says the rule
 * before you type, and every door that accepts a new password checks the same
 * function — registering, resetting, and changing it from the account page.
 * A rule enforced at one of three doors is not a rule.
 *
 * Deliberately modest. Length is what actually matters, and rules demanding an
 * uppercase, a digit and a symbol mostly produce `Password1!` — memorable to a
 * cracking dictionary and to nobody else. Eight characters and not all of one
 * kind is the floor that stops `12345678` and `password`; the real defence is
 * the rate limit on the sign-in door, which is already there.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** Said in the form, before anybody meets it as a refusal. */
export const PASSWORD_RULE =
	'At least 8 characters, with a letter and either a number or a symbol.';

/**
 * Null when it passes; otherwise the sentence to show.
 *
 * One message rather than a list that grows as you type: a form that reports
 * three failures at once about a field you are halfway through is a form that
 * is arguing with you.
 */
export function checkPassword(password: string): string | null {
	if (password.length < MIN_PASSWORD_LENGTH)
		return `A password needs at least ${MIN_PASSWORD_LENGTH} characters.`;

	const hasLetter = /\p{L}/u.test(password);
	const hasNumberOrSymbol = /[\p{N}\p{P}\p{S}]/u.test(password);

	if (!hasLetter || !hasNumberOrSymbol)
		return 'A password needs a letter and either a number or a symbol.';

	return null;
}
