/**
 * Every timezone, in words somebody would recognise.
 *
 * It was a text field. `America/Sao_Paulo` is what the app stores and what the
 * standard calls it, and it is not a thing to ask anybody to type: get one
 * letter wrong and the whole app is a day out, with nothing on screen to say
 * why. The two places that asked — first run, and preferences — asked in the
 * one form that can be answered wrongly.
 *
 * So: a list, grouped by part of the world, each entry reading as a place and
 * an offset. `Intl.supportedValuesOf('timeZone')` is where the names come
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
		return { label: 'GMT', minutes: 0 };
	}

	const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(raw);
	if (!match) return { label: 'GMT', minutes: 0 };

	const sign = match[1] === '-' ? -1 : 1;
	const minutes = sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));

	return { label: raw.replace('-', '−'), minutes };
}

/**
 * The whole list, grouped and sorted.
 *
 * Sorted by offset inside each group rather than alphabetically: somebody
 * looking for their own zone knows roughly what their offset is and does not
 * know whether their city sorts before or after the next one along.
 */
export function zoneGroups(at = new Date()): { region: string; zones: Zone[] }[] {
	const all: Zone[] = supported().map((id) => {
		const { label, minutes } = offsetOf(id, at);
		return { id, city: cityOf(id), region: regionOf(id), offset: label, minutes };
	});

	const byRegion = new Map<string, Zone[]>();
	for (const zone of all) {
		const group = byRegion.get(zone.region) ?? [];
		group.push(zone);
		byRegion.set(zone.region, group);
	}

	return (
		[...byRegion.entries()]
			.map(([region, zones]) => ({
				region,
				zones: zones.sort((a, b) => a.minutes - b.minutes || a.city.localeCompare(b.city))
			}))
			// "Other" last: it is the bucket, and a bucket does not go first.
			.sort((a, b) =>
				a.region === 'Other' ? 1 : b.region === 'Other' ? -1 : a.region.localeCompare(b.region)
			)
	);
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

/** `São Paulo · GMT−3` — one zone, as the option reads. */
export function zoneLabel(zone: Zone): string {
	return `${zone.city} · ${zone.offset}`;
}
