import { db } from '$lib/db/index.js';
import { modelProviderKeys } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { NotFoundError, ValidationError } from '$lib/services/errors.js';
import { oneOf, optionalStr, str } from '$lib/services/validate.js';
import { stamp, stamps } from '$lib/services/time.js';
import { record } from '$lib/services/audit.js';
import { providerOf, PROVIDER_IDS, type ProviderId } from '$lib/assistant-providers.js';
import { assertPublicUrl } from '$lib/server/outbound.js';
import { isSelfHosted } from '$lib/server/settings.js';
import type { Ctx } from '$lib/services/ctx.js';

/**
 * The model-provider key behind the in-app chat.
 *
 * One row per account, replaced on save: the chat speaks to one provider at
 * a time. The key authenticates this instance to a company the person chose,
 * so it is stored as given (see the schema note) and shown back only as a
 * prefix — the settings screen can say which key it is without being able to
 * say what it is.
 */

/** Longer than any provider issues today, and a bound all the same. */
const MAX_KEY_LENGTH = 300;
const MAX_MODEL_LENGTH = 100;
const MAX_BASE_URL_LENGTH = 200;
/** Enough of the key to recognise it by, not enough to use. */
const PREFIX_LENGTH = 8;

export type ModelKeyDescription = {
	provider: ProviderId;
	prefix: string;
	model: string | null;
	baseUrl: string | null;
	createdAt: string;
};

export function saveModelKey(
	ctx: Ctx,
	raw: { provider: unknown; key?: unknown; model?: unknown; baseUrl?: unknown }
): ModelKeyDescription {
	const provider = oneOf(raw.provider, 'provider', PROVIDER_IDS);
	const meta = providerOf(provider)!;

	const key = meta.needsKey
		? str(raw.key, 'key', { max: MAX_KEY_LENGTH })
		: optionalStr(raw.key, 'key', { max: MAX_KEY_LENGTH });

	const model = optionalStr(raw.model, 'model', { max: MAX_MODEL_LENGTH });
	if (!model && !meta.defaultModel)
		throw new ValidationError(`${meta.label} needs a model name — for example ${meta.modelHint}`);

	let baseUrl = meta.editableBaseUrl
		? optionalStr(raw.baseUrl, 'address', { max: MAX_BASE_URL_LENGTH })
		: '';
	if (baseUrl) {
		/*
		 * On a self-hosted instance a private address is the ordinary case —
		 * Ollama on the same machine is the whole point. On the hosted one it
		 * is a request-forgery probe aimed at this server's own network, so
		 * the same guard the webhooks use answers it at save time, and
		 * `fetchPublic` answers it again at call time.
		 */
		baseUrl = isSelfHosted()
			? new URL(baseUrl).toString()
			: assertPublicUrl(baseUrl, 'address').toString();
	}

	const row = db
		.insert(modelProviderKeys)
		.values({
			...stamps(ctx),
			userId: ctx.userId,
			provider,
			key,
			prefix: key.slice(0, PREFIX_LENGTH),
			model: model || null,
			baseUrl: baseUrl || null
		})
		.onConflictDoUpdate({
			target: modelProviderKeys.userId,
			set: {
				provider,
				key,
				prefix: key.slice(0, PREFIX_LENGTH),
				model: model || null,
				baseUrl: baseUrl || null,
				updatedAt: stamp(ctx)
			}
		})
		.returning()
		.get();

	record(ctx.userId, 'assistant_key_saved', { detail: { provider } });
	return describe(row);
}

/** What the settings screen may know: everything but the key. */
export function describeModelKey(ctx: Ctx): ModelKeyDescription | null {
	const row = db
		.select()
		.from(modelProviderKeys)
		.where(eq(modelProviderKeys.userId, ctx.userId))
		.get();
	return row ? describe(row) : null;
}

/** The whole row, key included — for the chat backend and nobody else. */
export function configuredModelKey(ctx: Ctx) {
	return (
		db.select().from(modelProviderKeys).where(eq(modelProviderKeys.userId, ctx.userId)).get() ??
		null
	);
}

export function removeModelKey(ctx: Ctx): void {
	const res = db.delete(modelProviderKeys).where(eq(modelProviderKeys.userId, ctx.userId)).run();
	if (res.changes === 0) throw new NotFoundError('assistant key');
	record(ctx.userId, 'assistant_key_removed');
}

/** The model the chat will actually ask for, name or default. */
export function modelNameFor(row: { provider: string; model: string | null }): string {
	return row.model || providerOf(row.provider)?.defaultModel || '';
}

function describe(row: typeof modelProviderKeys.$inferSelect): ModelKeyDescription {
	return {
		provider: row.provider,
		prefix: row.prefix,
		model: row.model,
		baseUrl: row.baseUrl,
		createdAt: row.createdAt
	};
}
