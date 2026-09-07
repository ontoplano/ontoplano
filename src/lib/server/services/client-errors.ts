import { desc, eq, sql } from 'drizzle-orm';

import { loadConfig } from '../config.js';
import { db } from '../db/index.js';
import { clientErrors, user } from '../db/schema.js';
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

/** How many reports are kept. Older ones go on every write. */
const KEEP = 200;

/**
 * Write one report — to the log, and to a table the administrator can read.
 *
 * The log alone was the original answer, on the grounds that a report is
 * operational exhaust rather than the account's data. That first half is still
 * true and is why this table is not part of an export and carries no name once
 * the account has gone. The second half was wrong in practice: the log is
 * journald on the box, so "somebody reported an error" reached nobody who was
 * not already tailing it, and the only way to find out was to be told.
 *
 * Both, then: the line stays for whoever greps, and `/admin` shows the last
 * few hundred so a report goes somewhere a person actually looks.
 */
export function recordClientError(
	ctx: Ctx,
	input: Record<string, unknown>,
	options: { once?: boolean } = {}
): void {
	/*
	 * `once` is the error page's button.
	 *
	 * An error the router turned into a page never reaches the window listener
	 * that normally offers to send one, so that page asks for itself — and a
	 * click on "send the technical details" is consent for that report and
	 * nothing more. It does not answer the standing question in Preferences,
	 * which is a different question and stays where the person left it. The
	 * instance switch is not negotiable either way: an operator who has
	 * reporting off collects nothing.
	 */
	const state = clientErrorState(ctx.userId);
	if (state === 'off') throw new ForbiddenError('Error reporting is not enabled on this server');
	if (state !== 'yes' && !options.once)
		throw new ForbiddenError('Error reporting is not enabled for this account');

	write(ctx.userId, input, ctx.now);
}

/**
 * A crash on a page nobody was signed in to.
 *
 * The front page is the one a stranger sees, and it was the one page whose
 * failures could never be reported: the endpoint asked for a session, so an
 * error there reached the visitor and nothing else. A 500 on production with
 * nothing in the server log is exactly this shape — the server answered 200 and
 * the page broke afterwards.
 *
 * There is no stored consent for somebody with no account, so the only way in
 * is an explicit press of the button on the error page. The instance switch
 * still decides whether the feature exists at all.
 */
export function recordVisitorError(input: Record<string, unknown>, now: Date): void {
	if (!loadConfig().reports.clientErrors)
		throw new ForbiddenError('Error reporting is not enabled on this server');

	write(null, input, now);
}

/**
 * A bug somebody sat down and reported.
 *
 * Deliberately not behind the crash-report consent: that switch answers "may
 * the app send me things it noticed", and this is a person typing a sentence
 * and pressing send. Refusing it because automatic reporting is off would mean
 * an instance where nobody can tell the operator anything.
 */
export function recordBugReport(ctx: Ctx, input: Record<string, unknown>): void {
	write(ctx.userId, input, ctx.now, 'report');
}

function write(
	userId: string | null,
	input: Record<string, unknown>,
	now: Date,
	kind: 'crash' | 'report' = 'crash'
): void {
	const message = str(input.message, 'message', { max: 500 });
	const url = optionalStr(input.url, 'url', { max: 300 });
	const stack = optionalStr(input.stack, 'stack', { max: 8000 });
	const userAgent = optionalStr(input.userAgent, 'userAgent', { max: 300 });

	console.error(
		JSON.stringify({
			at: now.toISOString(),
			level: kind === 'report' ? 'bug-report' : 'client-error',
			user: userId,
			message,
			url,
			stack
		})
	);

	db.insert(clientErrors)
		.values({
			userId,
			message,
			url,
			stack,
			userAgent,
			kind,
			createdAt: now.toISOString()
		})
		.run();

	// Swept here rather than by a timer: this is the only thing that writes to
	// the table, so it is the only place that can let it grow.
	db.run(
		sql`delete from client_errors where id not in (
			select id from client_errors order by id desc limit ${KEEP}
		)`
	);
}

export type ReportedError = {
	id: number;
	userId: string | null;
	email: string | null;
	message: string;
	url: string | null;
	stack: string | null;
	userAgent: string | null;
	kind: 'crash' | 'report';
	createdAt: string;
};

/**
 * The most recent reports, for `/admin`.
 *
 * The address is joined rather than stored, so an account that is deleted
 * takes its name out of this view without the row having to be rewritten.
 */
export function recentClientErrors(limit = 40): ReportedError[] {
	return db
		.select({
			id: clientErrors.id,
			userId: clientErrors.userId,
			email: user.email,
			message: clientErrors.message,
			url: clientErrors.url,
			stack: clientErrors.stack,
			userAgent: clientErrors.userAgent,
			kind: clientErrors.kind,
			createdAt: clientErrors.createdAt
		})
		.from(clientErrors)
		.leftJoin(user, eq(clientErrors.userId, user.id))
		.orderBy(desc(clientErrors.id))
		.limit(limit)
		.all();
}

/** Forget one, once it has been dealt with. */
export function dismissClientError(id: number): void {
	db.delete(clientErrors).where(eq(clientErrors.id, id)).run();
}
