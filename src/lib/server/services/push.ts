import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { and, eq, sql } from 'drizzle-orm';
import webpush from 'web-push';

import { db } from '../db/index.js';
import { pushSubscriptions } from '../db/schema.js';
import { CONFIG_DIR } from '../config.js';
import { str } from './validate.js';
import { ValidationError } from './errors.js';
import type { Ctx } from './ctx.js';

/**
 * Telling somebody something while the app is closed.
 *
 * Until now the app could only interrupt you if you were already looking at it:
 * a page open in a visible tab polled once a minute and raised a notification
 * from the page itself. That is the wrong shape for the thing reminders are
 * for. A reminder you only see when the tab is in front of you is a reminder
 * for somebody who did not need one, and on a phone it never worked at all —
 * Android refuses `new Notification()` outside a service worker, and with the
 * app closed nothing was running to call it anyway.
 *
 * Web push is the mechanism that does work: the browser keeps a connection to
 * its vendor's push service, and that service wakes the service worker whether
 * or not the app is open. So a phone with a signal gets the reminder with
 * everything closed and the screen off, which is what anybody means by a
 * reminder.
 *
 * ## The relay, and why it is acceptable here
 *
 * There is a third party in the path and it cannot be removed: the push service
 * belongs to whoever made the browser, and only that browser can be reached
 * through it. It is not, however, in the *trust* path. The payload is encrypted
 * with the subscription's own keys before it leaves this process, so the relay
 * carries ciphertext addressed to one browser; it learns that a message went to
 * an endpoint and nothing about who or what it is for. Nothing about this
 * instance is disclosed either — VAPID identifies the sender to the relay by a
 * public key, not by a domain it phones home to.
 *
 * An instance that would rather not use it simply does not set up keys, and
 * everything else keeps working: `configured()` is false, the browser is never
 * asked for permission, and reminders stay in-page as before.
 *
 * ## The keys
 *
 * VAPID is one keypair per instance, not per user. Taken from the environment
 * when it is set — an operator who wants them in their secret store can put
 * them there — and otherwise generated once and kept in the config directory,
 * because an instance that has to be told to run a keygen before notifications
 * work is an instance where notifications are broken by default.
 *
 * They are not rotated automatically. Changing them invalidates every existing
 * subscription: browsers pin the key they subscribed with, and the push service
 * rejects a message signed with another. Rotating means every device has to be
 * asked again, so it is a thing an operator does deliberately, by deleting the
 * file.
 */

const KEY_FILE = join(CONFIG_DIR, 'vapid.json');

/**
 * Dropped after this many consecutive failures.
 *
 * Generous, because the ordinary reason for a failure is a phone that is off
 * rather than a subscription that is dead — and the two look identical from
 * here. The unambiguous deaths (404, 410) delete the row immediately, so this
 * only ever catches the slow kind.
 */
const GIVE_UP_AFTER = 20;

export type Keys = { publicKey: string; privateKey: string };

let cached: Keys | null | undefined;

function fromEnvironment(): Keys | null {
	const publicKey = process.env.ONTOPLANO_VAPID_PUBLIC_KEY?.trim();
	const privateKey = process.env.ONTOPLANO_VAPID_PRIVATE_KEY?.trim();
	return publicKey && privateKey ? { publicKey, privateKey } : null;
}

/**
 * The instance's keypair, made on first use.
 *
 * Written with the mode of a secret, and read back on later starts: a keypair
 * that changed on every restart would silently unsubscribe every device that
 * had ever said yes.
 */
export function vapidKeys(): Keys | null {
	if (cached !== undefined) return cached;

	const environment = fromEnvironment();
	if (environment) return (cached = environment);

	// Off unless the instance is allowed to keep a key of its own. An operator
	// running a read-only config directory gets in-page reminders and no error.
	try {
		if (existsSync(KEY_FILE)) {
			const held = JSON.parse(readFileSync(KEY_FILE, 'utf-8')) as Partial<Keys>;
			if (held.publicKey && held.privateKey) {
				return (cached = { publicKey: held.publicKey, privateKey: held.privateKey });
			}
		}

		const made = webpush.generateVAPIDKeys();
		mkdirSync(CONFIG_DIR, { recursive: true });
		writeFileSync(KEY_FILE, JSON.stringify(made, null, 2), { encoding: 'utf-8', mode: 0o600 });
		return (cached = made);
	} catch {
		return (cached = null);
	}
}

/** Only for tests, which make and throw away config directories. */
export function forgetKeys(): void {
	cached = undefined;
}

/** Whether this instance can push at all. */
export function pushConfigured(): boolean {
	return vapidKeys() !== null;
}

/**
 * What the browser needs to subscribe. Null means "do not ask for permission".
 *
 * The private half never leaves this module; the public half is meant to be
 * public — it is what the browser hands to its push service so that only this
 * instance can address the subscription it gets back.
 */
export function publicKey(): string | null {
	return vapidKeys()?.publicKey ?? null;
}

/**
 * Who to contact about a misbehaving sender.
 *
 * Push services want a `mailto:` or a URL in the JWT and some of them enforce
 * it. The instance's own address if it has one, and a non-address that is
 * plainly not a real inbox otherwise — better than inventing somebody's.
 */
function contact(): string {
	const configured = process.env.ONTOPLANO_MAIL_FROM?.trim();
	return configured?.includes('@') ? `mailto:${configured}` : 'mailto:push@localhost';
}

export type Subscription = {
	endpoint: string;
	keys: { p256dh: string; auth: string };
};

/**
 * Remember a browser, or remember it again.
 *
 * Upsert on the endpoint: a browser that re-subscribes — after a service worker
 * update, or because the push service rotated the address — hands back the same
 * endpoint, and inserting would either fail on the unique index or grow a row
 * per visit. Re-subscribing also clears the failure count, since the thing that
 * was failing has just proved it is there.
 *
 * Taking the account from `ctx` rather than the body: a subscription belongs to
 * whoever was signed in when the browser said yes.
 */
export function saveSubscription(
	ctx: Ctx,
	subscription: Subscription,
	label?: string | null
): void {
	const endpoint = str(subscription?.endpoint, 'Endpoint', { max: 1000 });
	const p256dh = str(subscription?.keys?.p256dh, 'Key', { max: 300 });
	const auth = str(subscription?.keys?.auth, 'Key', { max: 300 });
	if (!/^https:\/\//.test(endpoint)) {
		throw new ValidationError('A push endpoint has to be https');
	}

	db.insert(pushSubscriptions)
		.values({
			userId: ctx.userId,
			endpoint,
			p256dh,
			auth,
			label: label?.slice(0, 120) || null
		})
		.onConflictDoUpdate({
			target: pushSubscriptions.endpoint,
			set: { userId: ctx.userId, p256dh, auth, failures: 0 }
		})
		.run();
}

/** A device saying it does not want these any more. */
export function removeSubscription(ctx: Ctx, endpoint: string): boolean {
	const result = db
		.delete(pushSubscriptions)
		.where(and(eq(pushSubscriptions.userId, ctx.userId), eq(pushSubscriptions.endpoint, endpoint)))
		.run();
	return result.changes > 0;
}

/** The devices signed up for one account, newest first. */
export function subscriptionsFor(userId: string) {
	return db
		.select()
		.from(pushSubscriptions)
		.where(eq(pushSubscriptions.userId, userId))
		.all()
		.reverse();
}

/** What a notification says and where it goes when tapped. */
export type Payload = {
	title: string;
	body?: string;
	/** Followed on tap. Relative, so the same row works on any host. */
	url?: string;
	/** Collapses repeats: two pushes with one tag leave one notification. */
	tag?: string;
};

/**
 * Push one message to every device an account has signed up.
 *
 * Answers with how many actually went, because the caller's decision — mark
 * this reminder pushed or leave it for next minute — depends on whether
 * anybody was reached, not on whether we tried.
 */
export type PushOutcome = {
	sent: number;
	/** One line per device that did not take it, in words an operator can act on. */
	failed: { device: string; why: string }[];
};

export async function pushToUser(userId: string, payload: Payload): Promise<PushOutcome> {
	const keys = vapidKeys();
	if (!keys) return { sent: 0, failed: [] };

	const devices = subscriptionsFor(userId);
	if (devices.length === 0) return { sent: 0, failed: [] };

	webpush.setVapidDetails(contact(), keys.publicKey, keys.privateKey);
	const body = JSON.stringify(payload);
	let sent = 0;
	const failed: { device: string; why: string }[] = [];

	for (const device of devices) {
		try {
			await webpush.sendNotification(
				{ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
				body,
				{ TTL: 60 * 60 }
			);
			sent += 1;
			db.update(pushSubscriptions)
				.set({ failures: 0, lastPushAt: sql`(CURRENT_TIMESTAMP)` })
				.where(eq(pushSubscriptions.id, device.id))
				.run();
		} catch (error) {
			const status = (error as { statusCode?: number })?.statusCode;
			const named = device.label ?? 'a device';

			/*
			 * Three ways a push fails, and only one of them is worth retrying.
			 *
			 * 404 and 410: the push service never heard of this subscription, or
			 * it is gone for good — an uninstalled browser, a revoked permission.
			 *
			 * 403: the subscription is real and belongs to a *different* VAPID
			 * key. That happens when the instance's keys change, and it can never
			 * succeed — the browser pinned the old key when it subscribed. Left in
			 * the table it fails every minute forever while the person wonders why
			 * their phone is quiet, so it goes the same way, and the person is
			 * told to turn notifications on again on that device.
			 */
			if (status === 404 || status === 410 || status === 403) {
				db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, device.id)).run();
				failed.push({
					device: named,
					why:
						status === 403
							? 'it subscribed with a different key — turn notifications on again there'
							: 'the push service says it is gone — turn notifications on again there'
				});
				continue;
			}

			const failures = device.failures + 1;
			if (failures >= GIVE_UP_AFTER) {
				db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, device.id)).run();
				failed.push({ device: named, why: `failed ${failures} times running, so it was dropped` });
			} else {
				db.update(pushSubscriptions)
					.set({ failures })
					.where(eq(pushSubscriptions.id, device.id))
					.run();
				failed.push({
					device: named,
					why: status
						? `the push service answered ${status}`
						: 'the push service could not be reached'
				});
			}
		}
	}

	return { sent, failed };
}
