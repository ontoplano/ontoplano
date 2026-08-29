import type { RequestHandler } from './$types';
import {
	SIGNATURE_HEADER,
	handleWebhook,
	isBillingConfigured,
	verifySignature
} from '$lib/server/services/billing';
import { toJsonError } from '$lib/server/services/errors';

/**
 * Where Paddle tells us what happened.
 *
 * Unauthenticated by design — the signature is the authentication. The raw body
 * is read as text and hashed before anything parses it, because re-serialising
 * JSON changes bytes and the comparison would fail for a reason nobody could
 * see.
 *
 * Always answers 200 once the signature checks out, including for events it
 * ignores: a provider that gets an error retries, and retrying something we
 * deliberately did nothing with is noise for both sides.
 */
export const POST: RequestHandler = async ({ request }) => {
	if (!isBillingConfigured()) return new Response('Billing is not configured', { status: 404 });

	const raw = await request.text();

	if (!verifySignature(raw, request.headers.get(SIGNATURE_HEADER))) {
		return new Response('Bad signature', { status: 401 });
	}

	try {
		// Paddle's own event id rides in the body; the hash is only the
		// fallback that keeps "apply once" true for a body without one.
		const outcome = handleWebhook(raw, hashOf(raw));
		return Response.json(outcome);
	} catch (e) {
		return toJsonError(e);
	}
};

/**
 * A stand-in id, for a delivery that carries none.
 *
 * Two identical bodies are the same event as far as we can tell, which is
 * exactly the property "apply once" needs.
 */
function hashOf(raw: string): string {
	let hash = 0;
	for (let i = 0; i < raw.length; i++) {
		hash = (hash * 31 + raw.charCodeAt(i)) | 0;
	}
	return `body:${hash}`;
}
