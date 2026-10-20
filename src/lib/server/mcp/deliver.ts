/**
 * Filing into the other notebooks, for a key tied to one.
 *
 * Its own module, with nothing imported that imports the tools, because both
 * the tool table and the confinement ask it — see `confinement.ts`.
 */

/** The grant that lets a notebook's key file things into the others. */
export const DELIVER_SCOPE = 'notebooks:deliver';

/** Whether this key is tied to a notebook and may also file into the rest. */
export function delivers(
	confinement: { kind: string } | null | undefined,
	scopes: readonly string[]
): boolean {
	return confinement?.kind === 'notebook' && scopes.includes(DELIVER_SCOPE);
}
