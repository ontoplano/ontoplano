import type { Actions, PageServerLoad } from './$types';

import { ASSISTANT_SCOPES, ASSISTANT_SCOPES_DESTRUCTIVE } from '$lib/server/mcp/tools';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import {
	deleteStream,
	listStreams,
	streamStats,
	updateStreamDisplay,
	STREAM_DISPLAYS
} from '$lib/services/streams';
import {
	ALL_SCOPES,
	CALENDAR_LINK_LIMIT,
	CALENDAR_LINK_NAME,
	createToken,
	freeName,
	isCalendarLink,
	listTokens,
	revokeToken
} from '$lib/server/services/tokens';
import { scopeCautionWord, scopeWord, webhookEventWord } from '$lib/scope-words';
import { listAssistantCalls, putBack } from '$lib/server/services/assistant-log';
import { confinementChoices, describeConfinement } from '$lib/server/mcp/confinement';
import { ASSISTANT_PUSH_KEY, catchUp } from '$lib/server/services/assistant-notify';
import { getUserSetting, setUserSetting } from '$lib/server/settings';
import {
	WEBHOOK_EVENTS,
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
			/** The one thing it may work on, named — or null for the account. */
			tiedTo: describeConfinement(ctx, t.confinement),
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
		/*
		 * …and the wider set, behind its own quieter button. Deleting is not the
		 * same grant as writing, so the preset everybody presses does not carry
		 * it — see `destructive` in tokens.ts.
		 */
		assistantScopesDestructive: ASSISTANT_SCOPES_DESTRUCTIVE,
		/*
		 * The permissions, as catalogue keys rather than sentences.
		 *
		 * `SCOPES` is the English definition the API reference is generated
		 * from; what somebody reads before granting one has to be in their own
		 * language. See `$lib/scope-words`.
		 */
		scopes: ALL_SCOPES.map((key) => ({
			key,
			says: scopeWord(key),
			// The louder line under the wide grants, said before the tick.
			caution: scopeCautionWord(key)
		})),
		displays: STREAM_DISPLAYS,
		/*
		 * Without the secret. It is a credential, and a page that lists it is a
		 * page whose payload hands over the ability to forge signed deliveries
		 * — for ever, since there is nothing to rotate. Shown once, when it is
		 * made, exactly as an API token is.
		 */
		webhooks: listSubscriptions(ctx).map((s) => ({
			id: s.id,
			url: s.url,
			events: s.events.split(',').filter(Boolean),
			secretHint: `${s.secret.slice(0, 6)}…`,
			lastDeliveryAt: s.lastDeliveryAt,
			lastStatus: s.lastStatus,
			disabled: Boolean(s.disabledAt)
		})),
		webhookEvents: WEBHOOK_EVENTS.map((key) => ({ key, says: webhookEventWord(key) })),
		/** What the tokens did lately, newest first, with the way back. */
		assistantCalls: listAssistantCalls(ctx, { limit: 30 }),
		// Absent means on: the point of the thing is knowing.
		notifyAssistant: (getUserSetting(ctx.userId, ASSISTANT_PUSH_KEY) ?? 'on') !== 'off',
		/** What a token can be tied to, same as the assistant page offers. */
		reach: confinementChoices(ctx),
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
				expiresInDays: formData.get('expiresInDays'),
				// Checked against the confinement table and against what this
				// account can list — never trusted as posted.
				confinedKind: formData.get('confinedKind'),
				confinedId: formData.get('confinedId')
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
				// Numbered when it has to be: several of these is the point, and
				// two live keys may not share a name. See `freeName`.
				name: formData.get('label')?.toString()?.trim() || freeName(ctx, CALENDAR_LINK_NAME),
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

	/** Recreate what a deleting call removed, from the before it recorded. */
	/**
	 * Whether a burst of assistant writes buzzes the phone.
	 *
	 * Turning it on starts the counter at the newest call rather than at zero:
	 * otherwise the first sweep after switching it on summarises everything an
	 * assistant has ever done, which is a notification about last month.
	 */
	notifyAssistant: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const on = (await request.formData()).get('on') === 'true';
		if (on) catchUp(ctx.userId);
		setUserSetting(ctx.userId, ASSISTANT_PUSH_KEY, on ? 'on' : 'off');
		return { success: true, message: on ? 'You will be told.' : 'You will not be told.' };
	},

	putBack: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const formData = await request.formData();

		try {
			const { made } = putBack(ctx, Number(formData.get('id')));
			return { success: true, action: 'putBack', made };
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
			const made = createSubscription(ctx, {
				url: formData.get('url'),
				events: formData.getAll('events')
			});
			// The one time it is shown. Copied now or not at all.
			return { success: true, action: 'createWebhook', secret: made.secret };
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
