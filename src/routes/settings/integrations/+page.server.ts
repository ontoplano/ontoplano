import type { Actions, PageServerLoad } from './$types';

import { ASSISTANT_SCOPES } from '$lib/server/mcp/tools';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/http-errors';
import {
	deleteStream,
	listStreams,
	streamStats,
	updateStreamDisplay,
	STREAM_DISPLAYS
} from '$lib/server/services/streams';
import {
	ALL_SCOPES,
	CALENDAR_LINK_LIMIT,
	SCOPES,
	createToken,
	isCalendarLink,
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

	const tokens = listTokens(ctx);
	const calendarLinks = tokens.filter((t) => isCalendarLink(t.scopes));

	return {
		/*
		 * One list, calendar links included.
		 *
		 * They were filtered out of here and given a card of their own, on the
		 * grounds that two views of one row invite "which am I looking at". The
		 * simpler truth won: a calendar link *is* a token, it is revoked like
		 * one, and somebody who wants to see the addresses they have handed out
		 * should find them in the list of things they have handed out. The card
		 * above still makes them, and explains what they are for.
		 */
		tokens: tokens.map((t) => ({
			...t,
			// Assembled here rather than in the page: only the server knows the
			// origin this instance answers on.
			feedUrl: t.plaintext ? `${url.origin}/calendar/${t.plaintext}` : null
		})),
		calendarLinks,
		calendarLinkLimit: CALENDAR_LINK_LIMIT,
		streams: listStreams(ctx, { includeArchived: true }).map((s) => ({
			...s,
			stats: streamStats(ctx, s.id)
		})),
		/*
		 * What an AI assistant asks for, as one button.
		 *
		 * Eighteen checkboxes is a form somebody ticks wrong, and the wrong tick
		 * here is either a token that cannot do its job or one that can do more
		 * than it needs. The set is read from the tools themselves, so a tool
		 * added later is in the preset without anybody remembering.
		 */
		assistantScopes: ASSISTANT_SCOPES,
		scopes: ALL_SCOPES.map((key) => ({
			key,
			description: SCOPES[key]
		})),
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
				name: formData.get('label'),
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

	/**
	 * Mint another calendar link.
	 *
	 * Several are allowed — a phone, a laptop, a partner's calendar — because
	 * one per account meant that wanting it in a second place cost you the
	 * first. Each is revoked on its own, in the list below, which is what makes
	 * "I pasted that one somewhere I should not have" recoverable without
	 * breaking the calendars that are fine.
	 */
	calendarLink: async ({ request, locals, url }) => {
		const ctx = buildCtx(locals.user!.id);
		const formData = await request.formData();

		try {
			const token = createToken(ctx, {
				name: formData.get('label')?.toString()?.trim() || 'Calendar link',
				scopes: ['calendar:read']
			});
			return {
				success: true,
				action: 'calendarLink',
				feedUrl: `${url.origin}/calendar/${token.plaintext}`
			};
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
				name: formData.get('label'),
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
