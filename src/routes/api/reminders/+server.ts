import type { IsolatedEvent } from '$lib/isolated/routes';
import { json } from '@sveltejs/kit';
import { buildCtx } from '$lib/services/ctx';
import {
	dismissReminder,
	dueReminders,
	markDelivered,
	upcomingReminders
} from '$lib/services/reminders';
import { ensureBirthdayReminders } from '$lib/services/birthdays';

/**
 * What should have gone off by now.
 *
 * Polled by the page that is already open, so it is session-authenticated like
 * `/api/search` rather than token-based like `/api/v1`. The reads and the
 * "I have shown this" are separate calls on purpose: a reminder is only marked
 * delivered once something has actually put it in front of somebody, so a
 * failed request loses nothing.
 */
export const GET = async ({ locals, url }: IsolatedEvent) => {
	if (!locals.user) return json({ due: [] }, { status: 401 });

	const ctx = buildCtx(locals.user.id);

	/*
	 * What is still to come, for a device that has to schedule it itself.
	 *
	 * An instance with a server wakes a phone over push; a phone that *is* the
	 * instance has no server to be woken by, so it books the alarms with
	 * Android before it is closed. It needs the ones that have not gone off
	 * yet rather than the ones that have.
	 */
	if (url.searchParams.has('upcoming')) {
		// The same list `/api/v1/reminders/upcoming` hands a phone pointed at a
		// server: one definition, so the two cannot answer differently about
		// whether something will ring.
		return json({ upcoming: upcomingReminders(ctx) });
	}
	/*
	 * Today's birthdays are written here as well as by the delivery job.
	 *
	 * The job is what wakes a phone, and an instance with no push keys does not
	 * run one — so a birthday would exist only for people who had set push up.
	 * Writing them on the poll too costs one indexed query a minute and means
	 * the address book behaves the same everywhere. Idempotent by date, so the
	 * two writers cannot produce two rows.
	 */
	ensureBirthdayReminders(ctx.userId, ctx.now, ctx.tz);

	return json({ due: dueReminders(ctx) });
};

export const POST = async ({ locals, request }: IsolatedEvent) => {
	if (!locals.user) return json({ ok: false }, { status: 401 });

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') return json({ ok: false }, { status: 400 });

	const ctx = buildCtx(locals.user.id);
	const ids = Array.isArray((body as { ids?: unknown[] }).ids)
		? (body as { ids: unknown[] }).ids.map(Number)
		: [];

	if ((body as { action?: string }).action === 'dismiss') {
		for (const id of ids) dismissReminder(ctx, id);
		return json({ ok: true });
	}

	return json({ ok: true, delivered: markDelivered(ctx, ids) });
};
