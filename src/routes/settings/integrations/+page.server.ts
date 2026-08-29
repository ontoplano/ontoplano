import type { Actions, PageServerLoad } from './$types';

import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/services/errors';
import {
	deleteStream,
	listStreams,
	streamStats,
	updateStreamDisplay,
	STREAM_DISPLAYS
} from '$lib/server/services/streams';
import {
	ALL_SCOPES,
	SCOPES,
	createToken,
	listTokens,
	revokeToken
} from '$lib/server/services/tokens';
import {
	WEBHOOK_EVENTS,
	WEBHOOK_EVENT_LABELS,
	createSubscription,
	deleteSubscription,
	listSubscriptions,
	reviveSubscription
} from '$lib/server/services/webhooks';

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = buildCtx(locals.user!.id);

	return {
		tokens: listTokens(ctx),
		streams: listStreams(ctx, { includeArchived: true }).map((s) => ({
			...s,
			stats: streamStats(ctx, s.id)
		})),
		scopes: ALL_SCOPES.map((key) => ({ key, description: SCOPES[key] })),
		displays: STREAM_DISPLAYS,
		webhooks: listSubscriptions(ctx).map((s) => ({
			id: s.id,
			url: s.url,
			events: s.events.split(',').filter(Boolean),
			secret: s.secret,
			lastDeliveryAt: s.lastDeliveryAt,
			lastStatus: s.lastStatus,
			disabled: Boolean(s.disabledAt)
		})),
		webhookEvents: WEBHOOK_EVENTS.map((key) => ({ key, label: WEBHOOK_EVENT_LABELS[key] })),
		origin: url.origin
	};
};

export const actions: Actions = {
	createToken: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const formData = await request.formData();

		try {
			const token = createToken(ctx, {
				name: formData.get('name'),
				scopes: formData.getAll('scopes'),
				expiresInDays: formData.get('expiresInDays')
			});
			// The plaintext is returned exactly once, here. It is not stored and
			// cannot be shown again.
			return { success: true, action: 'createToken', token };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	revokeToken: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const formData = await request.formData();

		try {
			revokeToken(ctx, Number(formData.get('id')));
			return { success: true, action: 'revokeToken' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	updateStream: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const formData = await request.formData();

		try {
			updateStreamDisplay(ctx, Number(formData.get('id')), {
				display: formData.get('display'),
				name: formData.get('name'),
				showOnDashboard: formData.get('showOnDashboard') === 'on',
				retentionDays: formData.get('retentionDays')
			});
			return { success: true, action: 'updateStream' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	deleteStream: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const formData = await request.formData();

		try {
			deleteStream(ctx, Number(formData.get('id')));
			return { success: true, action: 'deleteStream' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	createWebhook: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const formData = await request.formData();

		try {
			createSubscription(ctx, {
				url: formData.get('url'),
				events: formData.getAll('events')
			});
			return { success: true, action: 'createWebhook' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	deleteWebhook: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const formData = await request.formData();

		try {
			deleteSubscription(ctx, Number(formData.get('id')));
			return { success: true, action: 'deleteWebhook' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	reviveWebhook: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const formData = await request.formData();

		try {
			reviveSubscription(ctx, Number(formData.get('id')));
			return { success: true, action: 'reviveWebhook' };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
