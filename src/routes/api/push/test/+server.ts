import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pushConfigured, pushToUser, subscriptionsFor } from '$lib/server/services/push';

/**
 * Push one notification to this account's devices, now.
 *
 * The chain between "I pressed allow" and "my phone buzzed" has six links in
 * it — permission, a subscription, a row, keys, a timer, a push service — and
 * when nothing arrives, every one of them is a candidate. Nobody should have to
 * bisect that by setting a reminder and waiting a minute.
 *
 * So: the same code path a real reminder takes, on demand, answering with what
 * happened rather than with a status code. It is not a debug endpoint that
 * bypasses anything — it pushes for real, which is the point.
 */
export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ ok: false }, { status: 401 });

	if (!pushConfigured()) {
		return json({
			ok: false,
			why: 'This instance has no notification keys, so nothing can be sent from it.'
		});
	}

	const devices = subscriptionsFor(locals.user.id);
	if (devices.length === 0) {
		return json({
			ok: false,
			why: 'No device has signed up yet — turn notifications on here first.'
		});
	}

	const sent = await pushToUser(locals.user.id, {
		title: 'Ontoplano',
		body: 'This is what a reminder will look like.',
		url: '/',
		tag: 'ontoplano-test'
	});

	return json({
		ok: sent > 0,
		devices: devices.length,
		sent,
		why:
			sent > 0
				? null
				: 'The push service refused every device. They may have been revoked in the browser.'
	});
};
