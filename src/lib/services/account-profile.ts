/**
 * The account row itself, for whatever draws a name at the top of a page —
 * and the name on it, which both instances let a person change.
 *
 * The rest of `user` handling — sessions, passwords, deletion — is the
 * server's business and stays there. This is the one read that every
 * instance needs: on an isolated instance it is the single seeded account, and
 * the layout builds its `user` from it.
 */
import { eq } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import { user } from '$lib/db/schema.js';
import { MAX_DISPLAY_NAME_LENGTH } from '$lib/display-name.js';
import type { Ctx } from './ctx.js';
import { NotFoundError, ValidationError } from './errors.js';

export function profileOf(userId: string) {
	return db.select().from(user).where(eq(user.id, userId)).get() ?? null;
}

/**
 * The name the app calls this account by — in the header, and to the family
 * on what they share. Not a credential: nothing signs in with it, so it takes
 * no password to change.
 */
export function renameAccount(ctx: Ctx, raw: unknown): string {
	const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
	if (!name) throw new ValidationError({ key: 'errors.account.aNameCannotBeEmpty' });
	if (name.length > MAX_DISPLAY_NAME_LENGTH)
		throw new ValidationError({
			key: 'errors.account.thatNameIsTooLong',
			values: { max: MAX_DISPLAY_NAME_LENGTH }
		});

	const res = db
		.update(user)
		.set({ name, updatedAt: ctx.now })
		.where(eq(user.id, ctx.userId))
		.run();
	if (res.changes === 0) throw new NotFoundError('account');
	return name;
}
