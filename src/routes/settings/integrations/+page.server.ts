import { fail } from '@sveltejs/kit';

import type { Actions, PageServerLoad } from './$types';

import { ASSISTANT_SCOPES } from '$lib/server/mcp/tools';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import { listAssistantCalls, putBack } from '$lib/server/services/assistant-log';
import {
	RINGER_TOKEN_NAME,
	createToken,
	isCalendarLink,
	listTokens,
	revokeToken
} from '$lib/server/services/tokens';
import { scopeWord } from '$lib/scope-words';
import { capabilities, isSelfHosted } from '$lib/server/settings';
import { confinementChoices, describeConfinement } from '$lib/server/mcp/confinement';
import { translatorFor, SOURCE_LOCALE } from '$lib/i18n/core';
import type { Translate } from '$lib/i18n/core';

/** What each family of permissions is called, in the words the app uses. */
function subjectLabels(t: Translate): Record<string, string> {
	return {
		tasks: t('tasks.board.toDoList'),
		schedule: t('settings.integrations.yourWeek'),
		today: t('settings.integrations.todaysPlan'),
		habits: t('app.habits'),
		notes: t('settings.integrations.diaryAndNotebooks'),
		ideas: t('app.ideas'),
		inventory: t('app.inventory'),
		locations: t('inventory.whereThingsLive'),
		kitchen: t('app.recipes'),
		workouts: t('app.workouts'),
		bills: t('app.bills'),
		people: t('app.people'),
		streams: t('settings.integrations.connections.dataStreams'),
		statements: t('settings.integrations.bankStatements'),
		tags: t('app.tags'),
		search: t('ui.search')
	};
}

function assistantGrid(t: Translate) {
	const SUBJECT_LABELS = subjectLabels(t);
	const rows = new Map<
		string,
		{ subject: string; label: string; read: string | null; write: string | null; says: string[] }
	>();

	for (const scope of ASSISTANT_SCOPES) {
		const [subject, verb] = scope.split(':');
		const row = rows.get(subject) ?? {
			subject,
			// Never the raw key: a family added later with no label here printed
			// itself, so the permissions table had a row called "statements" in
			// the middle of a page that was otherwise in the reader's language.
			// `tests/assistant-grid.test.ts` fails rather than letting that ship.
			label: SUBJECT_LABELS[subject] ?? subject,
			read: null,
			write: null,
			says: []
		};
		if (verb === 'read') row.read = scope;
		else row.write = scope;
		// The sentence in the reader's own language, not the English definition
		// the API reference is generated from. See `$lib/scope-words`.
		const says = scopeWord(scope);
		if (says) row.says.push(t(says));
		rows.set(subject, row);
	}

	// In the order the labels are written, which is roughly how much of somebody's
	// life each one is; anything unlabelled falls in after them rather than out.
	const order = Object.keys(SUBJECT_LABELS);
	return [...rows.values()].sort((a, b) => {
		const ai = order.indexOf(a.subject);
		const bi = order.indexOf(b.subject);
		return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
	});
}

import {
	configuredModelKey,
	describeModelKey,
	removeModelKey,
	saveModelKey
} from '$lib/server/services/model-keys';
import { listModels } from '$lib/server/services/model-catalog';
import { PROVIDERS, PROVIDER_IDS, type ProviderId } from '$lib/assistant-providers';
import { getChatMayDelete } from '$lib/services/settings';
import { setAssistantMayDelete } from '$lib/services/preferences';

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = buildCtx(locals.user!.id);
	const t = await translatorFor(locals.locale ?? SOURCE_LOCALE);

	/*
	 * The keys that would already work, so the page can say whether making one
	 * is the next thing to do.
	 *
	 * Not which key: a key's secret is shown once and never again. A calendar
	 * link is a key too and is not one of these — it carries the single scope
	 * that reads the plan, which is not an assistant.
	 */
	const assistants = listTokens(ctx).filter(
		(t) => !isCalendarLink(t.scopes) && t.scopes.some((s) => ASSISTANT_SCOPES.includes(s))
	);

	return {
		origin: url.origin,
		/*
		 * The chat's own settings, which used to be a tab of their own.
		 *
		 * Three tabs where the first two were both about the assistant: what
		 * the chat runs on is a setting of this page, not a room beside it.
		 */
		configured: describeModelKey(ctx),
		/*
		 * Whether the chat holds the deleting grant. Off unless somebody said
		 * otherwise — and theirs to say, which is the whole point of it being
		 * here rather than decided in the route that answers a chat turn.
		 */
		mayDelete: getChatMayDelete(locals.user!.id),
		/*
		 * The provider list rides down with the page rather than being imported
		 * by it, so the form and the service can only ever disagree about a
		 * provider by disagreeing with the same file.
		 */
		providers: PROVIDERS,
		/*
		 * Whether a model on the same machine is a thing this instance can
		 * reach. The chat's calls are made here, not in the browser, so on the
		 * hosted copy `127.0.0.1` is this server's own loopback — and the form
		 * says so beside the field rather than after the attempt.
		 */
		selfHosted: isSelfHosted(),
		/*
		 * What this instance can do, which decides whether half of this page is
		 * anything but a description. An assistant reaches in from the internet,
		 * and an instance living on a phone is not somewhere anything can reach.
		 */
		capabilities: capabilities(),
		assistants: assistants.map((t) => ({
			id: t.id,
			name: t.name,
			createdAt: t.createdAt,
			tiedTo: describeConfinement(ctx, t.confinement)
		})),
		/*
		 * What an assistant may do, as a grid rather than a column of sentences.
		 *
		 * Every grant is "<thing>:read" or "<thing>:write", and drawn as a list of
		 * full sentences that came out as twenty-six lines of prose nobody reads —
		 * which is the same as not showing it. One row per thing and a column each
		 * for reading and writing is the same information in fourteen rows you can
		 * scan down, and the sentence is still there on the row for anybody who
		 * wants it.
		 *
		 * Built from the tools rather than listed, so a tool added later brings its
		 * permission with it. A subject nobody has named yet gets its own key as a
		 * label instead of being dropped: a grant that is granted and not shown is
		 * the one mistake this screen must not make.
		 */
		permissions: assistantGrid(t),
		/*
		 * The things a key can be tied to, and what each still grants.
		 *
		 * A key confined to one notebook can only call the tools that name
		 * something inside it, so the rooms it cannot reach are boxes that would
		 * grant nothing. The page dims them rather than silently accepting them:
		 * a permission screen that offers a grant with no effect teaches people
		 * the screen is decoration.
		 */
		reach: confinementChoices(ctx),
		assistantCalls: listAssistantCalls(ctx, { limit: 20 })
	};
};

/** The name the phone's own key wears, so making a second one replaces it.
 *  Shared with the reminders page, which reads it to know whether this phone
 *  is set up to ring at all — see `services/tokens.ts`. */
const RINGER_TOKEN = RINGER_TOKEN_NAME;

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const form = await request.formData();
		try {
			const saved = saveModelKey(ctx, {
				provider: form.get('provider'),
				key: form.get('key'),
				model: form.get('model'),
				baseUrl: form.get('baseUrl')
			});
			return { success: true, saved };
		} catch (error) {
			return toActionFailure(error);
		}
	},

	/**
	 * What this provider will answer to, asked with the key on the form.
	 *
	 * The key may not be saved yet — somebody pastes one and wants to see the
	 * models before committing to it — so the form sends what it is holding.
	 * Where the field is empty and a key is already stored, the stored one is
	 * used, which is how "Replace" can browse without retyping.
	 */
	models: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const form = await request.formData();
		const provider = String(form.get('provider') ?? '');
		if (!(PROVIDER_IDS as readonly string[]).includes(provider))
			return { success: false, action: 'models', message: 'Unknown provider' };

		try {
			const typed = String(form.get('key') ?? '').trim();
			const stored = typed ? null : configuredModelKey(ctx);
			const key = typed || (stored?.provider === provider ? stored.key : '');
			const models = await listModels(
				provider as ProviderId,
				key,
				String(form.get('baseUrl') ?? '') || null
			);
			return { success: true, action: 'models', models };
		} catch (error) {
			return toActionFailure(error);
		}
	},

	/** The one grant the chat has to be given rather than born with. */
	permissions: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const form = await request.formData();
		try {
			setAssistantMayDelete(ctx, form.get('mayDelete'));
		} catch (error) {
			return toActionFailure(error);
		}
		return { success: true, action: 'permissions' };
	},

	remove: async ({ locals }) => {
		const ctx = buildCtx(locals.user!.id);
		try {
			removeModelKey(ctx);
		} catch (error) {
			return toActionFailure(error);
		}
		return { success: true };
	},

	/*
	 * A key for a phone to ring with.
	 *
	 * The app cannot be woken by an instance it is pointed at: Android's web
	 * view has no Push API, and the shell's plugins reach the copy of ontoplano
	 * it carries and no further. So the phone asks instead — and to ask, it
	 * needs a key of this instance's making.
	 *
	 * Here rather than beside the button that presses it, which is on
	 * Preferences. Two reasons, and the second is the hard one: keys are made in
	 * this file and nowhere else, and the isolated build compiles every page's
	 * server file into its database worker except the ones named in
	 * `isolated/routes.ts` — of which this is one. Minting a key from Preferences
	 * pulled the whole token graph, and `node:os` with it, into a bundle meant
	 * for a browser, and the build said so.
	 *
	 * It is the narrowest key this app issues: it reads the alarms that are
	 * about to go off, not the calendar they hang from. Making it twice replaces
	 * it rather than piling up, so somebody setting this up again does not leave
	 * a working key on a phone they no longer have.
	 */
	ringOnThisPhone: async ({ locals }) => {
		const ctx = buildCtx(locals.user!.id);
		try {
			for (const held of listTokens(ctx)) {
				if (held.name === RINGER_TOKEN) revokeToken(ctx, held.id);
			}
			const made = createToken(ctx, { name: RINGER_TOKEN, scopes: ['reminders:read'] });
			return { success: true, action: 'ringOnThisPhone', key: made.plaintext };
		} catch (error) {
			return toActionFailure(error);
		}
	},

	/*
	 * A key for an assistant, and nothing else.
	 *
	 * The full form — every scope, an expiry, the wider grants — is on the
	 * Integrations tab, for somebody wiring up a script. Here the list is the
	 * one an assistant actually uses — declaring a plugin, managing webhooks
	 * and handing out a calendar address are not things an assistant does, and
	 * offering them is asking somebody to decide something they have no way to
	 * decide. Deleting is offered, on its own line at the bottom and unticked:
	 * an assistant that can remove a person or a habit's history is a bad trade
	 * for most people most of the time, which makes it a thing to reach for
	 * rather than a thing to opt out of.
	 */
	createKey: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const form = await request.formData();
		const t = await translatorFor(locals.locale ?? SOURCE_LOCALE);

		/*
		 * What was ticked, clamped to what this form is for.
		 *
		 * The boxes are the caller's to untick — somebody who does not want an
		 * assistant reading their diary should be able to say so, and that is
		 * the whole point of showing them. The clamp is not about the boxes: a
		 * form post is anybody's to compose, and this route must not become a
		 * way to mint a key that deletes things when the page it belongs to
		 * never offers that.
		 */
		const asked = form.getAll('scopes').map(String);
		const offered = [...ASSISTANT_SCOPES, 'destructive'];
		const scopes = offered.filter((scope) => asked.includes(scope));
		if (scopes.length === 0) {
			return fail(400, { message: t('settings.integrations.tickAtLeastOne') });
		}

		try {
			/*
			 * Named after what it is tied to, when it is tied to something.
			 *
			 * The field is a placeholder, and a placeholder is not a value: a
			 * list of five keys all called "AI assistant" is a list nobody can
			 * revoke the right one from.
			 */
			const tied = confinementChoices(ctx)
				.find((choice) => choice.kind === form.get('confinedKind'))
				?.things.find((thing) => String(thing.id) === String(form.get('confinedId')));

			const token = createToken(ctx, {
				name:
					String(form.get('label') ?? '').trim() ||
					tied?.label ||
					t('settings.integrations.aiAssistantDefaultName'),
				scopes,
				// Checked against the table in `mcp/confinement.ts` and against
				// what this account can list — never trusted as posted.
				confinedKind: form.get('confinedKind'),
				confinedId: form.get('confinedId')
			});
			// The secret is returned exactly once, here. It is not stored and
			// cannot be shown again.
			return { success: true, token };
		} catch (error) {
			return toActionFailure(error);
		}
	},

	/*
	 * The way back from a call that deleted something.
	 *
	 * The same action the Integrations tab has, because the record is drawn on
	 * both and a form posts to the route it is rendered in.
	 */
	putBack: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const form = await request.formData();
		try {
			putBack(ctx, Number(form.get('id')));
		} catch (error) {
			return toActionFailure(error);
		}
		return { success: true };
	}
};
