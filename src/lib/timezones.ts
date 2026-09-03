/**
 * Every timezone, in words somebody would recognise.
 *
 * It was a text field. `America/Sao_Paulo` is what the app stores and what the
 * standard calls it, and it is not a thing to ask anybody to type: get one
 * letter wrong and the whole app is a day out, with nothing on screen to say
 * why. The two places that asked — first run, and preferences — asked in the
 * one form that can be answered wrongly.
 *
 * So: a list, ordered by offset from west to east, each entry reading as a
 * place. `Intl.supportedValuesOf('timeZone')` is where the names come
 * from, so it is the platform's list rather than one to keep up to date.
 *
 * ## The offset is today's
 *
 * Half the world moves twice a year, so a zone has no single offset — and the
 * one worth showing is the one in force now, because that is the number
 * somebody is checking against their own clock. It is a label, never stored:
 * what is stored is the IANA name, which survives the clocks changing.
 */

export type Zone = {
	/** `America/Sao_Paulo` — what is stored. */
	id: string;
	/** `São Paulo` — what is read. */
	city: string;
	/** `America` — the optgroup. */
	region: string;
	/** `GMT−3` — today's, for the label. */
	offset: string;
	/** Minutes east of UTC, for sorting. */
	minutes: number;
};

/** `America/Argentina/Buenos_Aires` → `Buenos Aires`. */
function cityOf(id: string): string {
	const last = id.split('/').at(-1) ?? id;
	return last.replaceAll('_', ' ');
}

/**
 * `America/Argentina/Buenos_Aires` → `America`, and `UTC` → `Other`.
 *
 * The bare ones — `UTC`, `GMT`, and the legacy single-word names — have no
 * region in them, and a group called "UTC" holding one entry is worse than a
 * group called "Other" holding all of them.
 */
function regionOf(id: string): string {
	const first = id.split('/')[0];
	return id.includes('/') ? first.replaceAll('_', ' ') : 'Other';
}

/**
 * What a clock in that zone is offset by, right now.
 *
 * Read out of `Intl` rather than computed: the rules for who is on summer time
 * this week are exactly the thing not to reimplement. `shortOffset` gives
 * `GMT-3`, which is the answer, and the minus is replaced with a real one
 * because a hyphen beside a number reads as a hyphen.
 */
function offsetOf(id: string, at: Date): { label: string; minutes: number } {
	let raw: string;
	try {
		raw =
			new Intl.DateTimeFormat('en-GB', { timeZone: id, timeZoneName: 'shortOffset' })
				.formatToParts(at)
				.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
	} catch {
		return { label: 'GMT+0', minutes: 0 };
	}

	// No sign and no number is the zero offset — `shortOffset` writes it as a
	// bare "GMT", which in a column of GMT−3, GMT−2, …, GMT+1 is the one
	// heading that does not say where it sits.
	const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(raw);
	if (!match) return { label: 'GMT+0', minutes: 0 };

	const sign = match[1] === '-' ? -1 : 1;
	const minutes = sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));

	// Zero reads as a bare "GMT" out of Intl, which in a column of GMT−3, GMT−2,
	// GMT, GMT+1 is the one heading that does not say where it sits. It is the
	// middle of the list and it should look like it.
	if (minutes === 0) return { label: 'GMT+0', minutes };

	return { label: raw.replace('-', '−'), minutes };
}

/**
 * The whole list, in one order: by offset, west to east.
 *
 * It was grouped by continent, which is how the IANA names are spelled and not
 * how anybody looks for their own zone. Finding "São Paulo" meant knowing it is
 * filed under America, scrolling past Argentina and Bahia, and reading a list
 * whose only ordering principle was the alphabet. The thing somebody actually
 * knows about their timezone is roughly what it is offset by — the clock in
 * front of them says so — so that is the ordering, and the headings run
 * `GMT−8`, `GMT−7`, … `GMT+0`, `GMT+1`, the way a row of clocks on a wall does.
 *
 * Inside an offset the cities are alphabetical, because at that point the list
 * is short and a name is what is being looked for.
 */
export function zoneGroups(at = new Date()): { label: string; zones: Zone[] }[] {
	const all: Zone[] = supported().map((id) => {
		const { label, minutes } = offsetOf(id, at);
		return { id, city: cityOf(id), region: regionOf(id), offset: label, minutes };
	});

	const byOffset = new Map<number, Zone[]>();
	for (const zone of all) {
		const group = byOffset.get(zone.minutes) ?? [];
		group.push(zone);
		byOffset.set(zone.minutes, group);
	}

	return [...byOffset.entries()]
		.sort(([a], [b]) => a - b)
		.map(([, zones]) => ({
			// Every zone in the group shares the offset, so any of them can name it.
			label: zones[0].offset,
			zones: zones.sort((a, b) => a.city.localeCompare(b.city))
		}));
}

/**
 * The platform's list, or a small one it will certainly accept.
 *
 * `supportedValuesOf` is everywhere that matters and has been for years, but a
 * picker that renders nothing is worse than a text field — so if it is missing,
 * the fallback is enough zones to cover most people and the field still works.
 */
function supported(): string[] {
	const of = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
	if (typeof of === 'function') {
		try {
			// UTC by hand: it is not in the platform's list on every runtime, it is
			// what a server is set to, and a picker that cannot offer it is a
			// picker somebody has to work around.
			return [...new Set(['UTC', ...of('timeZone')])];
		} catch {
			/* fall through */
		}
	}
	return [
		'UTC',
		'America/Sao_Paulo',
		'America/New_York',
		'America/Los_Angeles',
		'Europe/London',
		'Europe/Lisbon',
		'Europe/Berlin',
		'Asia/Tokyo',
		'Australia/Sydney'
	];
}

/**
 * `São Paulo · America` — one zone, as the option reads.
 *
 * The part of the world rather than the offset: the group heading above it is
 * already the offset, and repeating it on four hundred lines is four hundred
 * lines of the same three characters. What the region settles is which Georgia,
 * which Cordoba.
 */
export function zoneLabel(zone: Zone): string {
	return zone.region === 'Other' ? zone.city : `${zone.city} · ${zone.region}`;
}
