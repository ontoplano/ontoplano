import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/server/auth';
import { record } from '$lib/server/services/audit';

/**
 * Give the account back.
 *
 * Posted from the banner that sits over every page while an administrator is
 * borrowing a session. better-auth swaps the cookie back to the administrator's
 * own session; the note in the borrowed account's history is what makes the
 * whole thing visible to the person it happened to.
 */
export const POST: RequestHandler = async (event) => {
	const impersonated = event.locals.user?.id ?? null;
	const admin = (event.locals.session as { impersonatedBy?: string } | undefined)?.impersonatedBy;

	if (impersonated && admin) record(impersonated, 'impersonation_ended', { actorId: admin });

	await auth.api.stopImpersonating({ headers: event.request.headers });

	redirect(303, admin ? `/admin/${impersonated}` : '/');
};
