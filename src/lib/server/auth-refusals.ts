import { APIError } from 'better-auth/api';
import type { MessageKey } from '$lib/i18n/core.js';

/**
 * What better-auth refused, as a sentence the reader can read.
 *
 * Its own messages are English and terse — "Invalid email or password" — and
 * they used to reach the form as they were, which put the first screen anybody
 * meets in English whatever language the account is in. The codes are stable;
 * these are the ones a person can cause from the forms. Anything else falls
 * back to the action's own general refusal.
 */
const BY_CODE: Record<string, MessageKey> = {
	INVALID_EMAIL_OR_PASSWORD: 'auth.refused.wrongEmailOrPassword',
	INVALID_PASSWORD: 'auth.refused.wrongCurrentPassword',
	USER_ALREADY_EXISTS: 'auth.refused.emailTaken',
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'auth.refused.emailTaken',
	EMAIL_NOT_VERIFIED: 'auth.refused.emailNotVerified',
	INVALID_EMAIL: 'auth.refused.invalidEmail',
	INVALID_TOKEN: 'auth.refused.linkExpired',
	PASSWORD_TOO_LONG: 'auth.refused.passwordTooLong'
};

/** The key for a better-auth refusal, or `fallback` when it is not one a person caused. */
export function authRefusal(error: unknown, fallback: MessageKey): MessageKey {
	if (!(error instanceof APIError)) return fallback;
	const code = (error.body as { code?: unknown } | undefined)?.code;
	return (typeof code === 'string' && BY_CODE[code]) || fallback;
}
