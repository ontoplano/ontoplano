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

	const { sent, failed } = await pushToUser(locals.user.id, {
		title: 'Ontoplano',
		body: 'This is what a reminder will look like.',
		url: '/',
		tag: 'ontoplano-test'
	});

	/*
	 * Which device, and why — not a count.
	 *
	 * "Sent to 1 of 2 devices" is the least useful true sentence available: it
	 * says something is wrong and nothing about what, and the obvious reading —
	 * "the phone was not seen" — is the one thing it does not mean. Every
	 * failure here names the device and the reason, and the commonest reason,
	 * a subscription made against a key this instance no longer has, comes with
	 * the thing to do about it.
	 */
	return json({
		ok: sent > 0 && failed.length === 0,
		devices: devices.length,
		sent,
		failed,
		why:
			failed.length > 0
				? failed.map((f) => `${f.device}: ${f.why}`).join('. ')
				: sent > 0
					? null
					: 'Nothing went, and nothing said why — which should not happen.'
	});
};
