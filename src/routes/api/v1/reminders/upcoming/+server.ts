import type { RequestHandler } from './$types';

import { authenticateApi } from '$lib/server/api/auth';
import { toJsonError } from '$lib/http-errors';
import { upcomingReminders } from '$lib/services/reminders';

/**
 * What is about to go off, for a device that will ring for it.
 *
 * A phone pointed at an instance cannot be woken by it. The web view inside
 * the app has no Push API — Android's does not implement one — and the shell's
 * plugins reach the copy of the app it carries and no further, so a page
 * served by a server can neither receive a push nor book an alarm. The way a
 * phone rings for a server's reminders is that the phone asks, and books
 * Android's own alarms with the answer.
 *
 * Which makes this the alarm clock's half of the arrangement: the list of
 * reminders that have not gone off yet and are near enough to be worth
 * booking, in the shape the booking side already takes. `upcomingReminders`
 * decides what "near enough" means, once, for this and for the copy of the app
 * that books alarms for the instance it is part of.
 *
 * Separate from `/schedule/upcoming`, which answers "what is planned" for
 * something that decides for itself what deserves an alarm. This answers "what
 * did they ask to be reminded of", which is already that decision — and it is
 * a narrower grant, because the token that reads it lives on a phone.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'reminders:read');
		return Response.json({ upcoming: upcomingReminders(ctx) });
	} catch (e) {
		return toJsonError(e);
	}
};
