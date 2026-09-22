import { error, fail, redirect } from '@sveltejs/kit';

import type { Actions, PageServerLoad } from './$types';

import { scopeCautionWord, scopeWord } from '$lib/scope-words';
import {
	CODE_CHALLENGE_METHOD,
	findClient,
	forgetStaleCodes,
	issueCode,
	scopesFor
} from '$lib/server/services/oauth';

/**
 * "Something wants to connect to your ontoplano."
 *
 * The only screen in the flow, and the only place anybody decides anything.
 * An assistant sent the person here; this says who is asking, what they would
 * be handing over, and offers the one grant that is not included — the same
 * shape the key form uses, because it is the same decision.
 *
 * Everything the client sent is checked before a word of it is drawn. Two
 * rules do the real work: the redirect address must be one the client
 * registered, matched whole, and PKCE is required — so a code intercepted on
 * the way back is worth nothing to whoever took it.
 */

/** What the client asked for, once it has survived being read. */
type Ask = {
	clientId: string;
	clientName: string;
	clientUri: string | null;
	redirectUri: string;
	state: string | null;
	codeChallenge: string;
	scope: string | null;
	resource: string | null;
};

/**
 * A refusal the person reads, rather than one the client swallows.
 *
 * Only for the two that cannot be sent back — an unknown client and a
 * redirect address it never registered — because sending an error to an
 * address nobody vouched for is the open redirect this is meant to prevent.
 * Everything else goes home to the client as an `error=` parameter.
 */
function refuse(why: string): never {
	error(400, why);
}

function readAsk(url: URL): Ask {
	const clientId = url.searchParams.get('client_id') ?? '';
	const client = clientId ? findClient(clientId) : null;
	if (!client)
		refuse('That assistant is not registered with this instance. Try connecting it again.');

	const redirectUri = url.searchParams.get('redirect_uri') ?? '';
	// Whole-string, never by prefix: `https://good.example` must not match
	// `https://good.example.attacker.test`.
	if (!client.redirectUris.includes(redirectUri))
		refuse('That assistant asked to be sent back to an address it never registered.');

	return {
		clientId: client.clientId,
		clientName: client.name,
		clientUri: client.uri,
		redirectUri,
		state: url.searchParams.get('state'),
		codeChallenge: url.searchParams.get('code_challenge') ?? '',
		scope: url.searchParams.get('scope'),
		resource: url.searchParams.get('resource')
	};
}

/**
 * Back to the client — by way of one page of our own.
 *
 * Never straight there from here. The answer to this screen is a form post,
 * and `form-action 'self'` covers where a post may *end up*, not only where it
 * is sent — so a redirect from an action to the assistant's own address is
 * blocked by the browser, and what somebody sees is a button that did
 * nothing. The policy is right and stays as it is: the hand-back is an
 * ordinary navigation from `/oauth/connected` instead, which is not a form
 * submission and is nobody's business but the browser's.
 */
function handBack(ask: Ask, params: Record<string, string>): never {
	const back = new URL(ask.redirectUri);
	for (const [key, value] of Object.entries(params)) back.searchParams.set(key, value);
	if (ask.state) back.searchParams.set('state', ask.state);

	const stop = new URL('/oauth/connected', 'http://x');
	stop.searchParams.set('to', back.toString());
	stop.searchParams.set('client_id', ask.clientId);
	redirect(303, stop.pathname + stop.search);
}

/** Home to the client, saying what went wrong there rather than here. */
function backWithError(ask: Ask, error: string, description?: string): never {
	handBack(ask, description ? { error, error_description: description } : { error });
}

/**
 * The same refusal on a GET, where nothing is being submitted and the browser
 * may be sent straight home to the client.
 */
function straightBack(ask: Ask, error: string, description: string): never {
	const back = new URL(ask.redirectUri);
	back.searchParams.set('error', error);
	back.searchParams.set('error_description', description);
	if (ask.state) back.searchParams.set('state', ask.state);
	redirect(302, back.toString());
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const ask = readAsk(url);

	/*
	 * Signed in first, then asked. The address is carried through the login
	 * page so saying yes is still one press when they come back — which is the
	 * whole promise of this flow, and the moment where a lesser one would tell
	 * somebody to go and find a settings screen.
	 */
	if (!locals.user) {
		redirect(302, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	}

	if ((url.searchParams.get('response_type') ?? '') !== 'code') {
		straightBack(ask, 'unsupported_response_type', 'Only the code flow is supported.');
	}
	if (!ask.codeChallenge) {
		straightBack(ask, 'invalid_request', 'A code_challenge is required.');
	}
	if ((url.searchParams.get('code_challenge_method') ?? '') !== CODE_CHALLENGE_METHOD) {
		backWithError(
			ask,
			'invalid_request',
			`code_challenge_method must be ${CODE_CHALLENGE_METHOD}.`
		);
	}

	/*
	 * What it is asking for, in sentences rather than in scope names, each with
	 * a box of its own. Ticked to begin with — the assistant asked for these
	 * and saying yes to all of them has to stay one press — but every one of
	 * them can be taken away before the press. The deleting line is not in
	 * here: it is the box underneath, and it starts empty.
	 */
	const granted = scopesFor(ask.scope, false).map((scope) => ({
		key: scope,
		says: scopeWord(scope),
		caution: scopeCautionWord(scope)
	}));

	/*
	 * The question, carried on the form's own action.
	 *
	 * A form action is `?/allow`, which replaces the whole query string — so
	 * without this the action runs against an address with no client, no
	 * redirect and no challenge in it, and the screen refuses the very request
	 * it is drawing. Found by walking the flow: the browser sat on
	 * `/oauth/authorize?/allow` with a 400 behind it.
	 */
	return { ask, granted, search: url.search.slice(1) };
};

export const actions: Actions = {
	/** Yes — and the code goes back to the address the client registered. */
	allow: async ({ request, url, locals }) => {
		const ask = readAsk(url);
		// Belt and braces: the load already walked them through signing in, and
		// an action is its own request that could arrive without one.
		if (!locals.user) backWithError(ask, 'access_denied', 'Nobody is signed in.');
		const form = await request.formData();
		const now = new Date();

		/*
		 * What they left ticked, and nothing they did not.
		 *
		 * `scopesFor` is still what bounds it — a form that posts a permission
		 * the client never asked for, or one this instance does not offer, gets
		 * no more for having said it. Deleting is not among the boxes: it is
		 * the one grant that is added rather than kept, by the box underneath.
		 */
		const offered = scopesFor(ask.scope, form.get('mayDelete') !== null);
		const kept = new Set(form.getAll('scopes').map(String));
		const scopes = offered.filter((scope) => scope === 'destructive' || kept.has(scope));

		// Nothing ticked is not a connection, and it is not a refusal either:
		// it is a form somebody is still filling in. Back to the screen with a
		// sentence, rather than home to the client with a key that opens
		// nothing.
		if (scopes.every((scope) => scope === 'destructive')) {
			return fail(400, { error: 'nothingTicked' });
		}

		forgetStaleCodes(now);
		const code = issueCode({
			clientId: ask.clientId,
			userId: locals.user!.id,
			scopes,
			codeChallenge: ask.codeChallenge,
			redirectUri: ask.redirectUri,
			resource: ask.resource,
			now
		});

		handBack(ask, { code });
	},

	/** No, said in the words the client understands. */
	deny: async ({ url }) => {
		const ask = readAsk(url);
		backWithError(ask, 'access_denied', 'The person said no.');
	}
};
