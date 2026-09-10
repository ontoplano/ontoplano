import { createHmac, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '../db/index.js';
import { webhookSubscriptions } from '../db/schema.js';
import { assertPublicUrl, fetchPublic } from '../outbound.js';
import { isSelfHosted } from '../settings.js';
import type { Ctx } from './ctx.js';
import { stamps } from './time.js';
import { ForbiddenError, NotFoundError, ValidationError } from './errors.js';
import { changed, roomsForEvent } from '../live.js';

/**
 * Webhooks: plugins that listen instead of push.
 *
 * "I want a plugin that reacts to my data" almost never needs code running
 * inside the process — it needs to be told when something happened. A
 * subscription is an address and a list of events; when one fires, the
 * payload is POSTed there, signed, and the plugin does whatever it does on
 * its own machine. Same trust model as tokens: an external program, a scoped
 * grant, no code inside.
 *
 * Payloads are deliberately thin — the id and, where the thing *is* its
 * one-line label (a todo's title, a shopping item's name, an idea), that
 * label. Never a body: a diary entry announces its id and nothing else. A
 * webhook address is the least-trusted place the server ever writes to.
 */
export const WEBHOOK_EVENTS = [
	'todo.created',
	'todo.completed',
	'idea.created',
	'diary.created',
	'shopping.added',
	'shopping.bought'
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** What each event means, for the page and the docs. */
export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
	'todo.created': 'a todo is added',
	'todo.completed': 'a todo is finished',
	'idea.created': 'an idea is captured',
	'diary.created': 'a diary entry is written',
	'shopping.added': 'something goes on the shopping list',
	'shopping.bought': 'something on the list is bought'
};

/** Enough addresses for real use; few enough that a runaway script is contained. */
const MAX_SUBSCRIPTIONS = 10;

/** Consecutive failures before an address is given up on. */
const MAX_FAILURES = 10;

const DELIVERY_TIMEOUT_MS = 5_000;

export const SIGNATURE_HEADER = 'x-ontoplano-signature';
export const EVENT_HEADER = 'x-ontoplano-event';

/**
 * Refuse addresses the server should never be told to call.
 *
 * The URL is user-supplied and the request leaves *our* network position, so
 * on a hosted instance "call 169.254.169.254" is a probe, not a webhook. A
 * self-hosted box may point wherever its owner likes — it is their network.
 * The hosted check is the shared guard in `$lib/server/outbound`, which also
 * sits inside every delivery's connection — the half that holds against a
 * name whose records change after this form was saved.
 */
function assertDeliverable(raw: unknown): string {
	if (typeof raw !== 'string' || raw.length === 0 || raw.length > 300)
		throw new ValidationError('Webhook address has to be a URL of at most 300 characters');

	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new ValidationError('Webhook address has to be a valid URL');
	}

	if (url.protocol !== 'https:' && url.protocol !== 'http:')
		throw new ValidationError('Webhook address has to be http or https');

	if (!isSelfHosted()) assertPublicUrl(raw, 'webhook address');

	return raw;
}

function eventsOf(raw: unknown): WebhookEvent[] {
	const requested = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
	const events = [
		...new Set(
			requested
				.map((e) => String(e).trim())
				.filter((e): e is WebhookEvent => (WEBHOOK_EVENTS as readonly string[]).includes(e))
		)
	];
	if (events.length === 0) throw new ValidationError('At least one known event is required');
	return events;
}

export type Subscription = typeof webhookSubscriptions.$inferSelect;

export function createSubscription(
	ctx: Ctx,
	input: { url: unknown; events: unknown }
): Subscription {
	const url = assertDeliverable(input.url);
	const events = eventsOf(input.events);

	const existing = db
		.select({ id: webhookSubscriptions.id })
		.from(webhookSubscriptions)
		.where(eq(webhookSubscriptions.userId, ctx.userId))
		.all();
	if (existing.length >= MAX_SUBSCRIPTIONS)
		throw new ForbiddenError(`At most ${MAX_SUBSCRIPTIONS} webhook subscriptions per account`);

	return db
		.insert(webhookSubscriptions)
		.values({
			...stamps(ctx),
			userId: ctx.userId,
			url,
			events: events.join(','),
			secret: 'whsec_' + randomBytes(24).toString('base64url')
		})
		.returning()
		.get();
}

export function listSubscriptions(ctx: Ctx): Subscription[] {
	return db
		.select()
		.from(webhookSubscriptions)
		.where(eq(webhookSubscriptions.userId, ctx.userId))
		.all();
}

export function deleteSubscription(ctx: Ctx, id: number): void {
	const res = db
		.delete(webhookSubscriptions)
		.where(and(eq(webhookSubscriptions.id, id), eq(webhookSubscriptions.userId, ctx.userId)))
		.run();
	if (res.changes === 0) throw new NotFoundError('Webhook');
}

/** A disabled address can be tried again after the receiver is fixed. */
export function reviveSubscription(ctx: Ctx, id: number): void {
	const res = db
		.update(webhookSubscriptions)
		.set({ disabledAt: null, failCount: 0, updatedAt: ctx.now.toISOString() })
		.where(and(eq(webhookSubscriptions.id, id), eq(webhookSubscriptions.userId, ctx.userId)))
		.run();
	if (res.changes === 0) throw new NotFoundError('Webhook');
}

export function serialiseSubscription(s: Subscription) {
	return {
		id: s.id,
		url: s.url,
		events: s.events.split(',').filter(Boolean),
		secret: s.secret,
		last_delivery_at: s.lastDeliveryAt,
		last_status: s.lastStatus,
		disabled: Boolean(s.disabledAt),
		created_at: s.createdAt
	};
}

/**
 * Fire an event: find who listens, deliver to each, never block the caller.
 *
 * Best-effort by design and said plainly: one attempt per delivery, five
 * seconds, no queue. A receiver that keeps failing is disabled after ten
 * consecutive misses rather than being hammered forever. The caller's write
 * has already happened — nothing here may throw into it or slow it down.
 */
export function emit(ctx: Ctx, event: WebhookEvent, data: Record<string, unknown>): void {
	// The tabs this person has open, before the receivers out on the internet.
	// Same announcement, two audiences — so a write that tells the outside world
	// also tells the screen in front of them, and nothing has to remember both.
	try {
		const rooms = roomsForEvent(event);
		if (rooms.length > 0) changed(ctx.userId, rooms, 'api');
	} catch {
		// `changed` swallows its own; this is belt and braces around the import.
	}

	try {
		const subs = db
			.select()
			.from(webhookSubscriptions)
			.where(
				and(eq(webhookSubscriptions.userId, ctx.userId), isNull(webhookSubscriptions.disabledAt))
			)
			.all()
			.filter((s) => s.events.split(',').includes(event));

		if (subs.length === 0) return;

		const body = JSON.stringify({ event, at: ctx.now.toISOString(), data });
		for (const sub of subs) void deliver(sub, event, body);
	} catch (e) {
		// A webhook must never break the thing it is reporting on.
		console.error('webhooks: emit failed:', e instanceof Error ? e.message : e);
	}
}

async function deliver(sub: Subscription, event: WebhookEvent, body: string): Promise<void> {
	let status: number;
	try {
		// On a hosted instance the guarded dialer refuses private addresses at
		// the socket; a self-hosted box calls its own network as it pleases.
		const send = isSelfHosted() ? fetch : fetchPublic;
		const response = await send(sub.url, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				[EVENT_HEADER]: event,
				[SIGNATURE_HEADER]: 'sha256=' + createHmac('sha256', sub.secret).update(body).digest('hex')
			},
			body,
			signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
			redirect: 'error'
		});
		status = response.status;
	} catch {
		status = 0;
	}

	try {
		const ok = status >= 200 && status < 300;
		const failCount = ok ? 0 : sub.failCount + 1;
		db.update(webhookSubscriptions)
			.set({
				lastDeliveryAt: new Date().toISOString(),
				lastStatus: status || null,
				failCount,
				disabledAt: failCount >= MAX_FAILURES ? new Date().toISOString() : null
			})
			.where(eq(webhookSubscriptions.id, sub.id))
			.run();
	} catch (e) {
		console.error('webhooks: could not record delivery:', e instanceof Error ? e.message : e);
	}
}
