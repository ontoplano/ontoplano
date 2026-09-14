/**
 * Which tabs Settings has, for whoever is looking at it.
 *
 * In a module of its own because two things need the same list and neither
 * owns it: the room's layout draws the strip, and `/admin` — a tab that is
 * not one of these routes, with a layout of its own — draws it too, or going
 * there would be a one-way trip.
 */
export type SettingsTab = { href: string; label: string };

export function settingsTabs(who: {
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
}): SettingsTab[] {
	const account = who.hasAccount !== false;
	return [
		...(account ? [{ href: '/settings/account', label: 'Account' }] : []),
		{ href: '/settings/preferences', label: 'Preferences' },
		...(who.billable ? [{ href: '/settings/billing', label: 'Billing' }] : []),
		...(who.family ? [{ href: '/settings/family', label: 'Family' }] : []),
		// Named for the half people come here for. The tab strip inside splits
		// assistants from the calendar link, the webhooks and the data streams.
		...(account ? [{ href: '/settings/integrations', label: 'AI & Integrations' }] : []),
		...(who.canEditInstance ? [{ href: '/settings/instance', label: 'Instance' }] : []),
		...(who.canAdminister ? [{ href: '/admin', label: 'Administration' }] : [])
	];
}
