import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { dismissReminder, dueReminders, markDelivered } from '$lib/server/services/reminders';
import { ensureBirthdayReminders } from '$lib/server/services/birthdays';

/**
 * What should have gone off by now.
 *
 * Polled by the page that is already open, so it is session-authenticated like
 * `/api/search` rather than token-based like `/api/v1`. The reads and the
 * "I have shown this" are separate calls on purpose: a reminder is only marked
 * delivered once something has actually put it in front of somebody, so a
 * failed request loses nothing.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ due: [] }, { status: 401 });

	const ctx = buildCtx(locals.user.id);
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

export const POST: RequestHandler = async ({ locals, request }) => {
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
