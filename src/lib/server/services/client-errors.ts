import { loadConfig } from '../config.js';
import { getUserSetting, setUserSetting } from '../settings.js';
import type { Ctx } from './ctx.js';
import { ForbiddenError } from './errors.js';
import { oneOf, optionalStr, str } from './validate.js';

/**
 * Client-side errors, sent in with permission.
 *
 * A crash in the browser leaves nothing on the server, so bugs that only
 * happen on somebody's phone stay invisible until they give up and leave. The
 * fix is a report — but a stack trace is their data leaving their browser, so
 * nothing is sent until two people have said yes: the instance turns the
 * feature on in its config, and then each person is asked once, in the page,
 * and can say never.
 */
const CONSENT_KEY = 'reports.clientErrors';

export type ClientErrorState = 'off' | 'ask' | 'yes' | 'no';

/** What the page should do with an error: nothing, ask first, send, or drop it. */
export function clientErrorState(userId: string): ClientErrorState {
	if (!loadConfig().reports.clientErrors) return 'off';
	const stored = getUserSetting(userId, CONSENT_KEY);
	return stored === 'yes' || stored === 'no' ? stored : 'ask';
}

export function setClientErrorConsent(ctx: Ctx, decision: unknown): void {
	if (!loadConfig().reports.clientErrors)
		throw new ForbiddenError('Error reporting is not enabled on this server');
	setUserSetting(ctx.userId, CONSENT_KEY, oneOf(decision, 'decision', ['yes', 'no'] as const));
}

/**
 * Write one report to the server log, in the same shape as a server error.
 *
 * The log, not a table: reports are operational exhaust, not the account's
 * data, and the operator already greps this log for the server's own 500s.
 */
export function recordClientError(ctx: Ctx, input: Record<string, unknown>): void {
	if (clientErrorState(ctx.userId) !== 'yes')
		throw new ForbiddenError('Error reporting is not enabled for this account');

	console.error(
		JSON.stringify({
			at: ctx.now.toISOString(),
			level: 'client-error',
			user: ctx.userId,
			message: str(input.message, 'message', { max: 500 }),
			url: optionalStr(input.url, 'url', { max: 300 }),
			stack: optionalStr(input.stack, 'stack', { max: 8000 })
		})
	);
}
