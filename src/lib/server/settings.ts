/**
 * What this deployment is: self-hosted, staging, demo, local, and what that
 * makes it able to do. Read from the environment, so it is server-only by
 * nature. A person's own settings live in `$lib/services/settings.ts` and are
 * re-exported here so server code keeps one import for both.
 */
import { loadConfig } from './config.js';
import type { Pricing } from '../plans.js';
import { db } from '$lib/db/index.js';
import { user } from '$lib/db/schema.js';
import { FULL, type Capabilities } from '$lib/capabilities';

export * from '$lib/services/settings.js';

// --- Instance ownership --------------------------------------------------------

/**
 * Whether this request may change deployment settings — bind host, port,
 * database path.
 *
 * Those belong to whoever runs the server, not to whoever happens to be logged
 * in. On a self-hosted instance that is the single account; on a shared one it
 * is nobody, and the settings are read-only from the web entirely.
 *
 * ONTOPLANO_SELF_HOST is opt-in rather than opt-out, so a deployment that
 * forgets to set anything is the safe one.
 */
/**
 * Whether this deployment is somebody's own box.
 *
 * Opt-in, like `isInstanceOwner` below: a deployment that forgets to say is
 * treated as hosted, which is the answer with the fewer consequences.
 */
export function isSelfHosted(): boolean {
	return loadConfig().instance.selfHost;
}

/**
 * Is this instance running on the device it is used from?
 *
 * The phone build will be: ontoplano serving itself, on the phone, for the one
 * person holding it. That is a perfectly good instance and most of the app
 * does not care — but a handful of features are somebody else dialling in, or
 * something happening while nobody is looking, and a phone can do neither.
 *
 * Declared rather than detected, and off by default, because the default here
 * is a stranger's own server: a machine that stays on and answers the door.
 * Only the build that knows it is living on a phone says so.
 */
export function isIsolated(): boolean {
	return process.env.ONTOPLANO_ISOLATED === 'true';
}

/**
 * What this instance can do, as the two questions in `$lib/capabilities.ts`.
 *
 * Not a plan, and it must never be read as one. Everything in the app is in
 * the repository and anybody may run all of it; this says where *this copy*
 * happens to be running, which is a fact rather than a purchase.
 */
export function capabilities(): Capabilities {
	if (!isIsolated()) return FULL;
	// Nothing can reach a phone — mobile data is behind carrier-grade NAT, so
	// there is not even a port to forward — and it is not running when the app
	// is closed.
	return { reachable: false, awake: false };
}

/**
 * Is this instance a staging one — not the real thing?
 *
 * A label, and only a label. Every page that could mislead somebody about
 * which instance they are looking at carries a band saying it, and the icon of
 * an installed copy is marked so two of them on one phone are not the same
 * picture. Nothing else consults this.
 *
 * That is the point of it. Staging exists to behave exactly like production —
 * same registration rules, same billing, same email verification — because a
 * copy that answers a question differently is not testing the thing it stands
 * in for. It used to imply open registration, so the one instance people were
 * invited to try was the one instance running a code path production never
 * ran. Anything staging should do differently is said out loud in its own env
 * file, in the same variable production uses to say the opposite.
 *
 * It is an environment variable rather than a config setting because the
 * switch belongs to whoever runs the box, not to whoever is logged into it —
 * and because the failure worth guarding is leaving it set on the real
 * instance, where a band on every page is what makes that impossible to miss.
 */
export function isStaging(): boolean {
	return process.env.ONTOPLANO_STAGING === 'true';
}

/**
 * Where the project's own pages are, for the two links on the front door.
 *
 * The marketing site and the documentation are separate deployments, so the
 * app has to name them — and on the *hosted* instance that is
 * ontoplano.com and docs.ontoplano.com, which is also the right answer for a
 * self-hoster: those are the project's home, not this box's.
 *
 * Overridable because staging is a whole deployment, not a flag. Staging has a
 * site and docs of its own (`site.staging.…`, `docs.staging.…`), and a staging
 * app whose links leave for production is a staging app you cannot look at the
 * hero on. Its env file points these two at its own pair, and no code anywhere
 * asks whether it is staging (S-STAGING).
 */
export function siteUrl(): string {
	return loadConfig().instance.siteUrl;
}

export function docsUrl(): string {
	return loadConfig().instance.docsUrl;
}

/**
 * The domain a "you are signed in" hint may be written for.
 *
 * The marketing site and the app are two deployments on two hostnames, and
 * the session cookie belongs to the app's. So somebody who is signed in and
 * lands on the front page is a stranger as far as that page can tell, and it
 * shows them the pitch and a sign-up button.
 *
 * A cookie on the shared parent domain fixes that, and it carries nothing:
 * one bit saying an account is open somewhere. It is off unless an operator
 * names the domain, because a self-hosted instance has no second hostname to
 * tell and no business writing cookies for anybody's parent domain.
 */
export function siteCookieDomain(): string {
	return (process.env.ONTOPLANO_SITE_COOKIE_DOMAIN || '').trim();
}

/**
 * The public demo.
 *
 * Every visitor gets an account of their own, seeded with a week worth looking
 * at and deleted once it has been left alone — see `services/demo.ts` for why
 * that beats one shared account wiped on a timer. Opt-in, like every other
 * deployment answer here: a box that forgets to say is an ordinary instance.
 *
 * `ONTOPLANO_DEMO_EMAIL` is no longer part of the switch. There is no one
 * account to name, and requiring it would have meant a box that upgraded to
 * this and dropped the variable silently stopped being a demo.
 */
export function isDemo(): boolean {
	return process.env.ONTOPLANO_DEMO === 'true';
}

/**
 * Whether this instance carries the workbenches under `/dev`.
 *
 * `[instance] dev_tools` in `config.toml`, with everything else an instance
 * allows, rather than an environment variable of its own — the deployment's
 * variables say where the database is and what to bind; what the instance
 * permits is one file.
 *
 * A setting rather than "is this staging", too: staging runs production's
 * code, and a screen that appears because an instance is called staging is
 * exactly the branch that rule exists to prevent. Off unless somebody says
 * otherwise, so a self-hosted instance never learns these pages exist.
 */
export function devToolsEnabled(): boolean {
	return loadConfig().instance.devTools;
}

/**
 * How long a demo account outlives its last page view.
 *
 * Since last seen rather than since created: somebody reading carefully for two
 * hours should not have the page taken away mid-sentence, and somebody who left
 * an hour ago is not coming back. Three hours by default — long enough to be a
 * proper look, short enough that a day's visitors are not still on the disk in
 * the morning.
 */
export function demoLifetimeMinutes(): number {
	const raw = Number(process.env.ONTOPLANO_DEMO_TTL_MINUTES);
	// Half an hour since last seen, not three. A demo visit is minutes long, and
	// the accounts are seeded rows on a small disk — keeping each one alive for
	// an afternoon after somebody has gone is paying for an audience that left.
	return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30;
}

/**
 * How many demo accounts may exist at once.
 *
 * The ceiling is the answer to "somebody points a script at it": each account
 * costs a seeded week on a small disk, and the honest failure when the demo is
 * full is the front page rather than a broken app.
 */
export function demoMaxAccounts(): number {
	const raw = Number(process.env.ONTOPLANO_DEMO_MAX_ACCOUNTS);
	return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 200;
}

/**
 * What this instance charges, and how its trial runs.
 *
 * From `[pricing]` in `config.toml` rather than compiled in, because a price
 * is not a fact about the software — the person running the instance decides
 * it, and changing it should not be a deploy. It is in the same file as
 * everything else an instance decides, so there is one place to look. The
 * defaults are argued for in the marketing repository, alongside the study of
 * what everyone else charges.
 */
export function pricing(): Pricing {
	const { pricing: set } = loadConfig();
	return {
		monthlyCents: set.monthlyCents,
		yearlyCents: set.yearlyCents,
		// The family rate, always quoted. It briefly had a switch of its own —
		// the family plan used to be inferred from a payment provider's price id
		// being present, and when the provider left this repository something had
		// to replace that. But the product offers a family plan; a second
		// setting saying so is a thing to remember, and the day that changes is
		// a day the pricing page is being redesigned anyway.
		familyMonthlyCents: set.familyMonthlyCents,
		familyYearlyCents: set.familyYearlyCents,
		familySeats: set.familySeats,
		currency: set.currency,
		trialDays: set.trialDays,
		trialRequiresCard: set.trialRequiresCard,
		provider: set.provider
	};
}

export function isInstanceOwner(userId: string): boolean {
	if (!isSelfHosted()) return false;

	const owner = process.env.ONTOPLANO_OWNER_ID;
	if (owner) return owner === userId;

	// Self-hosted with no owner named: the first account to exist is the owner,
	// which is the person who installed it.
	const first = db.select({ id: user.id }).from(user).orderBy(user.createdAt).limit(1).get();
	return first?.id === userId;
}

/**
 * The shared secret that lets a probe see disk and memory on `/healthz`.
 *
 * Unset means the endpoint stays as bare as it has always been. An empty
 * string is treated as unset rather than as a token that matches an empty
 * header, which is the failure this returns `null` to avoid.
 */
export function healthToken(): string | null {
	const value = process.env.ONTOPLANO_HEALTH_TOKEN;
	return value && value.length > 0 ? value : null;
}
