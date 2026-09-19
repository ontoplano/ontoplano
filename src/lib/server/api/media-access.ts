/**
 * Whether a key may see a file, decided by what the file is used for.
 *
 * The rule, and the reason it is this rule rather than a new grant: a picture
 * or a recording is never loose. It is in a note, or it is somebody's face, or
 * it is one of a recipe's photographs — and a person who has said "you may
 * read my notebooks" has already said what should happen to the pictures in
 * them. Inventing `media:read` would ask them the same question twice and let
 * the two answers disagree.
 *
 * So the permission a file needs is the permission its referrer needs, and a
 * file nothing refers to is reachable by nobody. One readable referrer is
 * enough: a picture in a note you may read is a picture you may see, whatever
 * else it also sits in.
 *
 * ## What is deliberately not reachable
 *
 * A picture that only lives in a gallery album. There is no scope for the
 * gallery — the room has never had one — and this is not the change that
 * invents it. `album` is listed below with no scope against it so that the
 * omission is a decision somebody can read rather than a kind nobody thought
 * of.
 */
import type { FileCaller } from '$lib/services/host';
import type { Referrer, ReferrerKind } from '$lib/services/media-referrers';
import { authenticateToken, type Scope } from '../services/tokens';
import { spendCallBudget, assertNoPaymentHold } from './auth';

/** Which grant each kind of referrer answers to. `null` is "no grant reaches it". */
const SCOPE_OF: Record<ReferrerKind, Scope | null> = {
	note: 'notes:read',
	idea: 'ideas:read',
	todo: 'tasks:read',
	person: 'people:read',
	recipe: 'kitchen:read',
	album: null
};

/**
 * The bearer of this request, if it is a key rather than a browser.
 *
 * Null when there is no bearer header at all, which leaves the route to its
 * session check. A header that is present and bad still throws: a key that has
 * been revoked deserves to be told so, not quietly treated as a stranger.
 */
export function fileCaller(request: Request): FileCaller | null {
	const header = request.headers.get('authorization') ?? '';
	if (!header.toLowerCase().startsWith('bearer ')) return null;

	const token = authenticateToken(header.slice(7).trim(), new Date());
	assertNoPaymentHold(token.userId);
	// Reading a file is a call like any other. Without this a key would have an
	// endpoint it could pull on for ever for nothing.
	spendCallBudget(token.tokenId, token.userId, false);

	return {
		userId: token.userId,
		mayRead(referrers: Referrer[]) {
			return referrers.some((referrer) => {
				const needed = SCOPE_OF[referrer.kind];
				if (!needed || !token.scopes.includes(needed)) return false;

				/*
				 * A key confined to one notebook sees that notebook's files and
				 * no others — including the ones in a thing that has no notebook
				 * at all, which is why this refuses rather than passes when the
				 * referrer's notebook is null.
				 */
				const confined = token.confinement;
				if (!confined) return true;
				if (confined.kind !== 'notebook') return false;
				return referrer.notebookId === confined.id;
			});
		}
	};
}
