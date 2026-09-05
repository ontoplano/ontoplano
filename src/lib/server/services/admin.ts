import { and, count, desc, eq, like, or, sql } from 'drizzle-orm';

import { db } from '../db/index.js';
import { session, user } from '../db/auth.schema.js';
import { auditEvents, subscriptions } from '../db/schema.js';
import { ROLES, type Role } from '../../roles.js';
import { isInstanceOwner, isSelfHosted } from '../settings.js';
import { record } from './audit.js';
import { membersOf, resolvePlan, seatOwnerAccount, seatsFor, startTrial } from './subscriptions.js';
import { NotFoundError, ValidationError } from './errors.js';
import { str } from './validate.js';
import { deleteAccount } from './account.js';

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
	/** Hosted instance, no plan history: the one case an admin may start a trial. */
	canGrantTrial?: boolean;
	/** Hosted instance with a plan: the operator may move its end date. */
	canEndPlan?: boolean;
	/** When that plan runs out, if a date is set. */
	planEndsAt?: string | null;
};

export function roleOf(userId: string): Role {
	const row = db.select({ role: user.role }).from(user).where(eq(user.id, userId)).get();
	return isRole(row?.role) ? row.role : 'member';
}

export function isAdmin(userId: string): boolean {
	return roleOf(userId) === 'admin' || isInstanceOwner(userId);
}

/**
 * Who may touch the deployment settings.
 *
 * Self-hosted: the owner, as always. Hosted: the administrators — the
 * instance page is where registration mode lives, and the person running
 * ontoplano.com flips that more often than anyone self-hosting does.
 */
export function canEditInstance(userId: string): boolean {
	if (isSelfHosted()) return isInstanceOwner(userId);
	return isAdmin(userId);
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
		isOwner: isInstanceOwner(row.id),
		canGrantTrial: !isSelfHosted() && !hasPlanHistory(row.id),
		canEndPlan: !isSelfHosted() && hasPlanHistory(row.id),
		planEndsAt: planEndsAt(row.id)
	};
}

/**
 * Hand an account its trial, by an administrator's hand.
 *
 * For the account that predates billing: created while the instance ran as
 * self-hosted, so it has no subscription row, and the moment plans are
 * enforced it would freeze at "none". Only such accounts qualify — giving a
 * lapsed account another trial is a discount, and discounts belong to the
 * payment provider, not to a button here.
 */
export function grantTrial(actorId: string, subjectId: string, now = new Date()): void {
	requireAdmin(actorId);

	if (isSelfHosted()) throw new ValidationError('A self-hosted instance has no plans');
	if (hasPlanHistory(subjectId))
		throw new ValidationError('This account already has a plan history');

	startTrial(subjectId, now, actorId);
}

/**
 * End an account's plan on a chosen date, by an administrator's hand.
 *
 * An operator's tool, not a customer one: set it to yesterday and the
 * account shows exactly what a lapsed user sees, set it ahead and a trial
 * stretches. It moves only the dates this instance keeps — the provider's
 * own billing schedule is not touched, so use it on test accounts.
 */
export function setPlanEnd(actorId: string, subjectId: string, endsAt: string): void {
	requireAdmin(actorId);
	if (isSelfHosted()) throw new ValidationError('A self-hosted instance has no plans');

	const date = new Date(endsAt);
	if (isNaN(date.getTime())) throw new ValidationError('That is not a date');
	const iso = date.toISOString();

	const row = db
		.select({ id: subscriptions.id, status: subscriptions.status })
		.from(subscriptions)
		.where(eq(subscriptions.userId, subjectId))
		.get();
	if (!row) throw new NotFoundError('This account has no plan to end');

	db.update(subscriptions)
		.set({
			currentPeriodEnd: iso,
			...(row.status === 'trialing' ? { trialEndsAt: iso } : {}),
			updatedAt: new Date().toISOString()
		})
		.where(eq(subscriptions.id, row.id))
		.run();
	record(subjectId, 'plan_end_set', { actorId, detail: { endsAt: iso } });
}

/** When the current plan runs out, for the operator's clock. */
function planEndsAt(userId: string): string | null {
	const row = db
		.select({
			currentPeriodEnd: subscriptions.currentPeriodEnd,
			trialEndsAt: subscriptions.trialEndsAt
		})
		.from(subscriptions)
		.where(eq(subscriptions.userId, userId))
		.get();
	return row?.currentPeriodEnd ?? row?.trialEndsAt ?? null;
}

function hasPlanHistory(userId: string): boolean {
	return (
		db
			.select({ id: subscriptions.id })
			.from(subscriptions)
			.where(eq(subscriptions.userId, userId))
			.get() !== undefined
	);
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

/**
 * Erase an account, having been made to type its address.
 *
 * The friction is the feature. A test account and a real one sit in the same
 * list, look alike, and are one row apart — and this is the button in the app
 * with no undo behind it at all: `deleteAccount` empties every table the person
 * owns inside one transaction, and there is nothing left to restore from
 * afterwards except a backup of the whole instance.
 *
 * So the confirmation is not a second click, which lands under the first. It is
 * the address of the account being deleted, typed. Somebody who has the wrong
 * row open types the wrong address and is told so, which is the only kind of
 * confirmation that catches the mistake it is there for. Case and surrounding
 * space are forgiven; nothing else is.
 *
 * Two accounts are refused outright rather than made harder:
 *
 * - **Yourself.** An administrator deleting their own account through the
 *   administration page is either a mistake or a thing to do from the account
 *   page, where it belongs and where it asks properly.
 * - **The instance's owner**, who is an administrator by virtue of being first
 *   and whose deletion would leave nobody able to undo anything.
 */
export function deleteAccountAsAdmin(actorId: string, subjectId: string, typed: unknown): void {
	requireAdmin(actorId);

	if (actorId === subjectId) {
		throw new ValidationError('Delete your own account from Settings, not from here');
	}
	if (isInstanceOwner(subjectId)) {
		throw new ValidationError('This account owns the instance and cannot be deleted here');
	}

	const subject = accountById(subjectId);
	const said = str(typed, 'address', { max: 320 }).trim().toLowerCase();
	if (said !== subject.email.trim().toLowerCase()) {
		throw new ValidationError('That is not this account’s address — nothing was deleted');
	}

	/*
	 * Written down before it happens, because afterwards there is no row to
	 * hang it on: `audit_events` is one of the tables the delete empties, and a
	 * record of the deletion filed against the deleted account would go with
	 * it. This one is filed against the administrator who did it.
	 */
	record(actorId, 'account_deleted', {
		actorId,
		detail: { email: subject.email, subjectId }
	});

	deleteAccount(subjectId);
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

	/*
	 * A family plan, said from whichever end this account is.
	 *
	 * The payer used to read as a plain "pro" and a member as another plain
	 * "pro", so the operator could not tell one paid account from five riding
	 * on it — the exact question support gets when a family's card fails.
	 */
	if (entitlement.source === 'family') {
		const owner = seatOwnerAccount(userId);
		return owner ? `pro (on ${owner.name}'s plan)` : 'pro (family seat)';
	}
	const seats = seatsFor(userId);
	if (seats > 1) {
		return `${entitlement.plan} (family payer, ${membersOf(userId).length + 1} of ${seats} seats)`;
	}
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
