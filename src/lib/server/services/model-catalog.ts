import { assertPublicUrl, fetchPublic } from '$lib/server/outbound.js';
import { isSelfHosted } from '$lib/server/settings.js';
import { ValidationError } from '$lib/services/errors.js';
import {
	OLLAMA_DEFAULT_BASE_URL,
	OPENROUTER_BASE_URL,
	providerOf,
	type ProviderId
} from '$lib/assistant-providers.js';

/**
 * What a provider will actually answer to, asked rather than typed.
 *
 * The model was a text box, which only works for somebody who already has the
 * provider's documentation open — and the answer changes every few months, so
 * a list compiled here would be wrong by the time anybody read it. Every one
 * of these companies publishes what it serves; this asks, with the key the
 * person just pasted, and the form offers what came back.
 *
 * The key is theirs and the call goes to the company they chose. Nothing is
 * stored by this: it is a question asked while a form is open.
 */

/**
 * Why an address could not be dialled, in words somebody can act on.
 *
 * The one worth spelling out is an address on the person's own machine. The
 * call is made by this instance, not by the browser, so `127.0.0.1` is this
 * server's own loopback and not the laptop the form is open on — which is a
 * surprise precisely to the person doing the most reasonable thing, running
 * Ollama locally and pasting the address it printed.
 */
function cannotReach(url: string, error: unknown): string {
	const where = (() => {
		try {
			return new URL(url).host;
		} catch {
			return url;
		}
	})();

	const said = error instanceof Error ? error.message : '';
	if (/refusing to (resolve|connect)|this machine|private/i.test(said))
		return (
			`This instance makes the call, not your browser \u2014 so ${where} is this server\u2019s ` +
			`own machine rather than yours, and it is refused. Point it at an address on the ` +
			`internet, or run ontoplano on the machine the model is on.`
		);
	if (/timeout|abort/i.test(said)) return `${where} did not answer in time.`;
	return `Nothing answered at ${where}.`;
}

/** A model, as the form offers it. */
export type ModelChoice = { id: string; label: string };

/** Long enough for OpenRouter's several hundred, short enough to bound. */
const MAX_MODELS = 400;

/** A provider that is thinking about something else is not worth waiting for. */
const ASK_TIMEOUT_MS = 10_000;

/**
 * The ones that are not chat models.
 *
 * OpenAI's list is everything the account can reach — embeddings, speech,
 * moderation, image generation — and offering those in a chat's model box is
 * offering somebody a mistake. Matched on the name because that is the only
 * thing the list endpoint says about them.
 */
const NOT_A_CHAT = /embed|whisper|tts|audio|dall-e|moderation|image|search|realtime|transcribe/i;

async function ask(url: string, headers: Record<string, string>): Promise<unknown> {
	const call = isSelfHosted() ? fetch : fetchPublic;

	// The two fetches have different `Response` types — node's and undici's —
	// and the union of them satisfies neither, so what is held here is what
	// both agree on: something with `ok`, `status`, `text` and `json`.
	let answer: Awaited<ReturnType<typeof call>>;
	try {
		answer = await call(url, {
			headers,
			signal: AbortSignal.timeout(ASK_TIMEOUT_MS)
		} as RequestInit);
	} catch (error) {
		/*
		 * A refusal from the outbound guard, a name that does not resolve, a
		 * port with nothing behind it — all of them arrive here as an ordinary
		 * `Error`, which `toServiceError` turns into "Unexpected error" and a
		 * 500. That is the least useful thing the form could say: nothing about
		 * this is unexpected, and the person can act on every one of these once
		 * they are told which happened.
		 */
		throw new ValidationError(cannotReach(url, error));
	}

	if (!answer.ok) {
		/*
		 * The provider's own words, where it gave any.
		 *
		 * "401" is not something a person can act on; "API key is invalid" is.
		 * All four wrap that sentence in JSON of their own shape, so the
		 * sentence is dug out rather than pasted whole — a form is no place for
		 * a request id and a type field.
		 */
		const said = sentenceIn(await answer.text().catch(() => ''));
		throw new ValidationError(
			said
				? `The provider answered ${answer.status}: ${said}`
				: `The provider answered ${answer.status}.`
		);
	}
	return answer.json();
}

/**
 * The human sentence inside a provider's error, if there is one.
 *
 * `{"error":{"message":"…"}}` is what OpenAI, OpenRouter and Ollama send;
 * Anthropic nests it the same way. Anything else is handed back as it came,
 * trimmed, because a body nobody recognises still beats a bare status.
 */
function sentenceIn(body: string): string {
	try {
		const parsed = JSON.parse(body) as { error?: { message?: unknown }; message?: unknown };
		const said = parsed.error?.message ?? parsed.message;
		if (typeof said === 'string' && said.trim() !== '') return said.slice(0, 200).trim();
	} catch {
		/* not JSON, which is its own answer */
	}
	return body.slice(0, 200).trim();
}

/** `{ data: [{ id }] }`, which is the shape all four speak. */
function idsFrom(body: unknown): ModelChoice[] {
	const rows = (body as { data?: unknown })?.data;
	if (!Array.isArray(rows)) return [];
	return rows
		.map((row) => {
			const one = row as { id?: unknown; display_name?: unknown; name?: unknown };
			const id = typeof one.id === 'string' ? one.id : '';
			const label =
				typeof one.display_name === 'string'
					? one.display_name
					: typeof one.name === 'string'
						? one.name
						: id;
			return { id, label: label || id };
		})
		.filter((one) => one.id !== '');
}

/**
 * Ask one provider what it serves.
 *
 * Newest first where the provider says so — all four return their list in
 * their own order, and every one of them puts the current generation at the
 * top or near it, so the order is left as given rather than sorted into
 * alphabetical, which would bury `claude-sonnet-5` under `claude-2`.
 */
export async function listModels(
	provider: ProviderId,
	key: string,
	baseUrl: string | null
): Promise<ModelChoice[]> {
	const meta = providerOf(provider);
	if (!meta) throw new ValidationError({ key: 'errors.modelCatalog.unknownProvider' });
	if (meta.needsKey && !key) throw new ValidationError({ key: 'errors.modelCatalog.aKeyIsNeeded' });

	/*
	 * Judged before it is dialled, so the answer is the same sentence saving
	 * it would have given. Asking first and saving second is the order anybody
	 * fills this form in, and until now the ask came back "Unexpected error"
	 * while the save explained itself.
	 */
	if (!isSelfHosted() && meta.editableBaseUrl) {
		// The default is `127.0.0.1` too, so judging only what was typed let the
		// empty field through to the same refusal a moment later, wearing the
		// dispatcher's words instead of these.
		assertPublicUrl(baseUrl || OLLAMA_DEFAULT_BASE_URL, 'address');
	}

	let body: unknown;
	switch (provider) {
		case 'anthropic':
			body = await ask('https://api.anthropic.com/v1/models?limit=100', {
				'x-api-key': key,
				'anthropic-version': '2023-06-01'
			});
			break;
		case 'openai':
			body = await ask('https://api.openai.com/v1/models', {
				Authorization: `Bearer ${key}`
			});
			break;
		case 'openrouter':
			body = await ask(`${OPENROUTER_BASE_URL}/models`, {
				Authorization: `Bearer ${key}`
			});
			break;
		case 'ollama':
			body = await ask(`${(baseUrl || OLLAMA_DEFAULT_BASE_URL).replace(/\/$/, '')}/models`, {});
			break;
	}

	const all = idsFrom(body);
	// Only OpenAI's list mixes in the things that are not chat models; the
	// filter is harmless on the others, which have nothing matching it.
	const chat = all.filter((one) => !NOT_A_CHAT.test(one.id));
	return (chat.length > 0 ? chat : all).slice(0, MAX_MODELS);
}
