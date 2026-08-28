import { and, count, desc, eq, like, or, sql } from 'drizzle-orm';

import { db } from '../db/index.js';
import { session, user } from '../db/auth.schema.js';
import { auditEvents } from '../db/schema.js';
import { ROLES, type Role } from '../../roles.js';
import { isInstanceOwner } from '../settings.js';
import { record } from './audit.js';
import { resolvePlan } from './subscriptions.js';
import { NotFoundError, ValidationError } from './errors.js';
import { str } from './validate.js';

/**
 * Administration: looking at somebody else's account.
 *
 * Two ways to be one. The instance owner is whoever installed it — the first
 * account, on a self-hosted box. Everybody else has to be given the role, and
 * the giving is itself an audited act.
 *
 * Not being an administrator is a 404 rather than a 403 (I3): a page you may
 * not see should not confirm that it exists.
 */

export { ROLES };
export type { Role };

export function isRole(value: unknown): value is Role {
	return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export type Account = {
	id: string;
	email: string;
	name: string;
	emailVerified: boolean;
	role: Role;
	createdAt: string;
	sessions: number;
	/** What they are entitled to right now, in the words the billing page uses. */
	plan: string;
	/**
	 * Whoever installed this instance, who is an administrator whatever the
	 * `role` column says. Worth marking, because demoting them would appear to
	 * work and change nothing.
	 */
	isOwner: boolean;
};

export function roleOf(userId: string): Role {
	const row = db.select({ role: user.role }).from(user).where(eq(user.id, userId)).get();
	return isRole(row?.role) ? row.role : 'member';
}

export function isAdmin(userId: string): boolean {
	return roleOf(userId) === 'admin' || isInstanceOwner(userId);
}

/** Throws the same thing a missing page would. */
export function requireAdmin(userId: string): void {
	if (!isAdmin(userId)) throw new NotFoundError('page');
}

/**
 * Whether this account should be an administrator by virtue of being first.
 *
 * Called at registration: an instance with nobody in it hands the first account
 * the keys, because otherwise there is nobody who can hand them to anyone.
 */
export function claimFirstAccount(userId: string): void {
	const existing = db.select({ id: user.id }).from(user).all();
	if (existing.length !== 1 || existing[0].id !== userId) return;

	db.update(user).set({ role: 'admin' }).where(eq(user.id, userId)).run();
	record(userId, 'role_changed', { detail: { to: 'admin', reason: 'first account' } });
}

export function searchAccounts(query: string, limit = 25): Account[] {
	const trimmed = query.trim();
	const pattern = `%${trimmed.toLowerCase()}%`;

	const rows = db
		.select({
			id: user.id,
			email: user.email,
			name: user.name,
			emailVerified: user.emailVerified,
			role: user.role,
			createdAt: user.createdAt
		})
		.from(user)
		.where(
			trimmed
				? or(like(user.email, pattern), like(user.name, pattern))
				: // No query lists the newest, which is what an operator opening this
					// page usually wants to see.
					undefined
		)
		// Administrators first. They are the handful of accounts that can do
		// anything to the others, so "who has the keys" should be answerable by
		// looking at the top of the list rather than by reading all of it.
		.orderBy(sql`case when ${user.role} = 'admin' then 0 else 1 end`, desc(user.createdAt))
		.limit(limit)
		.all();

	return rows.map((row) => ({
		id: row.id,
		email: row.email,
		name: row.name,
		emailVerified: row.emailVerified,
		role: isRole(row.role) ? row.role : 'member',
		createdAt: new Date(row.createdAt).toISOString(),
		sessions: sessionCount(row.id),
		plan: describePlan(row.id),
		isOwner: isInstanceOwner(row.id)
	}));
}

export function accountById(id: string): Account {
	const row = db
		.select({
			id: user.id,
			email: user.email,
			name: user.name,
			emailVerified: user.emailVerified,
			role: user.role,
			createdAt: user.createdAt
		})
		.from(user)
		.where(eq(user.id, id))
		.get();

	if (!row) throw new NotFoundError('account');

	return {
		id: row.id,
		email: row.email,
		name: row.name,
		emailVerified: row.emailVerified,
		role: isRole(row.role) ? row.role : 'member',
		createdAt: new Date(row.createdAt).toISOString(),
		sessions: sessionCount(row.id),
		plan: describePlan(row.id),
		isOwner: isInstanceOwner(row.id)
	};
}

/**
 * Give or take away the role.
 *
 * An administrator cannot demote themselves: the instance would be left with
 * nobody who can promote anyone, and the way out of that is a database editor.
 */
export function setRole(actorId: string, subjectId: string, raw: unknown): void {
	requireAdmin(actorId);

	const role = str(raw, 'role', { max: 20 });
	if (!isRole(role)) throw new ValidationError('Unknown role');

	// You cannot take your own keys away. An instance whose last administrator
	// demoted themselves has nobody who can undo it, and the mistake is one
	// click from the button that does the legitimate thing.
	if (actorId === subjectId) throw new ValidationError('Change somebody else, not yourself');

	// And you cannot take the owner's, because you would not be taking anything:
	// whoever installed the instance is an administrator by virtue of being
	// first, whatever this column says. Letting the change succeed would show a
	// "member" badge on somebody who still has every power.
	if (isInstanceOwner(subjectId) && role !== 'admin') {
		throw new ValidationError('This account owns the instance and is always an administrator');
	}

	const result = db.update(user).set({ role }).where(eq(user.id, subjectId)).run();
	if (result.changes === 0) throw new NotFoundError('account');

	record(subjectId, 'role_changed', { actorId, detail: { to: role } });
}

/** How many events the instance has recorded lately, for the admin landing. */
export function recentEvents(limit = 25) {
	return db
		.select({
			id: auditEvents.id,
			userId: auditEvents.userId,
			actorId: auditEvents.actorId,
			event: auditEvents.event,
			createdAt: auditEvents.createdAt,
			email: user.email
		})
		.from(auditEvents)
		.innerJoin(user, eq(auditEvents.userId, user.id))
		.orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
		.limit(limit)
		.all();
}

/** "pro (trial)" reads better here than a status code. */
function describePlan(userId: string): string {
	const entitlement = resolvePlan(userId);
	if (entitlement.source === 'self-hosted') return 'self-hosted';
	if (entitlement.source === 'trial') return `${entitlement.plan} (trial)`;
	if (entitlement.source === 'lapsed') return 'free (lapsed)';
	return entitlement.plan;
}

function sessionCount(userId: string): number {
	return (
		db
			.select({ n: count() })
			.from(session)
			.where(and(eq(session.userId, userId)))
			.get()?.n ?? 0
	);
}
