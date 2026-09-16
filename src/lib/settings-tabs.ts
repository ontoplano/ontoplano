import type { Translate } from './i18n/index.js';

/**
 * Which tabs Settings has, for whoever is looking at it.
 *
 * In a module of its own because two things need the same list and neither
 * owns it: the room's layout draws the strip, and `/admin` — a tab that is
 * not one of these routes, with a layout of its own — draws it too, or going
 * there would be a one-way trip.
 */
export type SettingsTab = { href: string; label: string };

/**
 * The translator is an argument, not something this module reaches for.
 *
 * A module that asks for the current language is a module that can only run
 * where there is one — which rules out the server, where the language belongs
 * to whoever is being written to rather than to whoever asked. Every helper
 * that produces words takes it the same way.
 */
export function settingsTabs(
	t: Translate,
	who: {
		billable?: boolean;
		/** Only an account actually on a family plan has anybody to manage. */
		family?: boolean;
		canEditInstance?: boolean;
		canAdminister?: boolean;
		/**
		 * Whether there is an account and a server behind this instance.
		 *
		 * False on a device's own instance: there is nobody to sign in as, no
		 * sessions to end, no mail to send and no server for an assistant to
		 * talk to. Preferences are still the person's, so they stay — a tab
		 * that opens onto "this screen needs an instance with a server" is
		 * worse than no tab.
		 */
		hasAccount?: boolean;
		/**
		 * Whether other software can be pointed at this instance.
		 *
		 * Separate from `hasAccount`, and the two came apart the moment a device
		 * got an account page: an assistant, a calendar subscription, a webhook and
		 * a data stream are all something reaching this instance over a network,
		 * and a phone-only instance is not reachable over anything. It has an
		 * account — your data out, your data in, the end of it — and nothing for
		 * anybody else to connect to.
		 */
		reachable?: boolean;
	}
): SettingsTab[] {
	const account = who.hasAccount !== false;
	const reachable = who.reachable !== false;
	return [
		...(account ? [{ href: '/settings/account', label: t('rooms.settings.tabs.account') }] : []),
		{ href: '/settings/preferences', label: t('rooms.settings.tabs.preferences') },
		...(who.billable
			? [{ href: '/settings/billing', label: t('rooms.settings.tabs.billing') }]
			: []),
		...(who.family ? [{ href: '/settings/family', label: t('rooms.settings.tabs.family') }] : []),
		// Named for the half people come here for. The tab strip inside splits
		// assistants from the calendar link, the webhooks and the data streams.
		...(account && reachable
			? [{ href: '/settings/integrations', label: t('rooms.settings.tabs.integrations') }]
			: []),
		...(who.canEditInstance
			? [{ href: '/settings/instance', label: t('rooms.settings.tabs.instance') }]
			: []),
		...(who.canAdminister
			? [{ href: '/admin', label: t('rooms.settings.tabs.administration') }]
			: [])
	];
}
