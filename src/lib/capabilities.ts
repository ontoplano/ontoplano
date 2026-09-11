/**
 * What an instance can do, which is not the same as what an account bought.
 *
 * Ontoplano is about to be able to run on the phone it is used from, and a
 * phone is not a server: nothing on the internet can reach it, and it is not
 * awake when the app is closed. Several features depend on exactly one of
 * those two things, so rather than each of them inventing its own check, they
 * ask here.
 *
 * **This is not a plan and must never become one.** There is no "Pro" in this
 * app; everything is in the repository and anybody can run all of it. What a
 * capability says is "this instance cannot do that", which is a fact about
 * where it is running — and the honest answer to it always names both
 * remedies together: run the instance on a machine that stays on, or let
 * somebody host it for you. Ceilings on what an account may do are a different
 * question entirely, and `plans.ts` owns it.
 */

/**
 * The two questions that answer every case.
 *
 * `reachable` — can something out on the internet open a connection to this
 * instance. A calendar client polling a feed, an assistant calling the MCP
 * endpoint, a plugin pushing readings in: all of them are somebody else
 * dialling us.
 *
 * `awake` — does this instance run when nobody is looking at it. Mail that
 * goes out on a Monday morning, a reminder that has to fire while the phone is
 * in a pocket.
 */
export type Capability = 'reachable' | 'awake';

export type Capabilities = Record<Capability, boolean>;

/** Everything a normal deployment can do, which is everything. */
export const FULL: Capabilities = { reachable: true, awake: true };

/**
 * What a feature needs, and what to say when it cannot have it.
 *
 * `because` is written for the person reading it, in their words, and says
 * what is true rather than what is missing — "nothing can reach this instance"
 * rather than "unavailable on your plan", which would be a lie as well as a
 * different product.
 */
export type Feature = {
	/** What it is called on screen. */
	name: string;
	needs: Capability;
	/** One sentence: why this instance cannot do it. */
	because: string;
};

export const FEATURES = {
	calendarFeed: {
		name: 'Calendar feed',
		needs: 'reachable',
		because: 'Google and Apple fetch the feed themselves, and they cannot reach this instance.'
	},
	assistants: {
		name: 'AI assistants',
		needs: 'reachable',
		because: 'An assistant connects to this instance over the internet, and nothing can.'
	},
	streams: {
		name: 'Data from other apps',
		needs: 'reachable',
		because: 'A plugin pushes readings in over the internet, and nothing can reach this instance.'
	},
	webhooks: {
		name: 'Webhooks',
		needs: 'reachable',
		because: 'Nothing outside can reach this instance to be told about anything.'
	},
	invites: {
		name: 'Invitations',
		needs: 'reachable',
		because:
			'An invitation is a link somebody else opens, and this instance is not somewhere they can.'
	},
	reviewMail: {
		name: 'The weekly review mail',
		needs: 'awake',
		because: 'It goes out on a Monday morning, and this instance only runs while the app is open.'
	},
	reminderMail: {
		name: 'Reminders by mail',
		needs: 'awake',
		because:
			'A mail has to be sent while you are not looking, and this instance is not running then.'
	}
} as const satisfies Record<string, Feature>;

export type FeatureKey = keyof typeof FEATURES;

/** Whether this instance can do that thing at all. */
export function can(capabilities: Capabilities, key: FeatureKey): boolean {
	return capabilities[FEATURES[key].needs];
}

/**
 * Why not, and what to do about it — or `null` when there is nothing to say.
 *
 * Both remedies, always, in the same breath. Offering only the hosted one
 * would be selling; offering only the self-hosted one would be pretending the
 * hosted one is not there. Somebody who has just met a wall deserves to know
 * both doors exist.
 */
export function whyNot(capabilities: Capabilities, key: FeatureKey): string | null {
	if (can(capabilities, key)) return null;

	const feature = FEATURES[key];
	const remedy =
		feature.needs === 'reachable'
			? 'Run ontoplano on a machine the internet can reach, or on an instance somebody hosts for you.'
			: 'Run ontoplano on a machine that stays on, or on an instance somebody hosts for you.';

	return `${feature.because} ${remedy}`;
}
