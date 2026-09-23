import type { Referrer, ReferrerKind } from './media-referrers';

/**
 * Whether a caller may see a file, decided by what the file is used for.
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
 *
 * ## Why it lives here
 *
 * Two doors ask it: an HTTP request carrying a bearer key, and an assistant
 * over MCP, which never holds a raw key at all — its client keeps the
 * credential and hands out none. This module imports nothing but types, so the
 * MCP tool table can ask it without dragging the token service, the database
 * and the billing provider into a cycle with itself. It did, once, and the
 * dev server died on `Cannot access '__vite_ssr_import_10__' before
 * initialization`.
 */

/** Which grant each kind of referrer answers to. `null` is "no grant reaches it". */
export const SCOPE_OF: Record<ReferrerKind, string | null> = {
	note: 'notes:read',
	// A notebook's own picture answers to the same grant its notes do: it is
	// what the notebook is, and somebody who may read the notebook may see it.
	notebook: 'notes:read',
	idea: 'ideas:read',
	todo: 'tasks:read',
	person: 'people:read',
	recipe: 'kitchen:read',
	album: null
};

/** A key pinned to one thing, as much of it as this rule needs. */
export type FileConfinement = { kind: string; id: number } | null;

export function mayReadFile(
	referrers: Referrer[],
	scopes: readonly string[],
	confined: FileConfinement
): boolean {
	return referrers.some((referrer) => {
		const needed = SCOPE_OF[referrer.kind];
		if (!needed || !scopes.includes(needed)) return false;

		/*
		 * A key confined to one notebook sees that notebook's files and no
		 * others — including the ones in a thing that has no notebook at all,
		 * which is why this refuses rather than passes when the referrer's
		 * notebook is null.
		 */
		if (!confined) return true;
		if (confined.kind !== 'notebook') return false;
		return referrer.notebookId === confined.id;
	});
}
