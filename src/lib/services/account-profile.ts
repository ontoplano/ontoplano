/**
 * The account row itself, for whatever draws a name at the top of a page.
 *
 * The rest of `user` handling — sessions, passwords, deletion — is the
 * server's business and stays there. This is the one read that every
 * instance needs: on a local instance it is the single seeded account, and
 * the layout builds its `user` from it.
 */
import { eq } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import { user } from '$lib/db/schema.js';

export function profileOf(userId: string) {
	return db.select().from(user).where(eq(user.id, userId)).get() ?? null;
}
