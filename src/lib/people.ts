/**
 * People, and how you know them.
 *
 * A person is not a tag: a tag groups entries, a person accumulates a history —
 * everything you wrote that mentioned them, in one place. The relationship is
 * there so the list sorts into something you can scan, not to model anything.
 */
export const RELATIONSHIPS = ['family', 'friend', 'partner', 'professional', 'other'] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const RELATIONSHIP_LABELS: Record<Relationship, string> = {
	family: 'Family',
	friend: 'Friend',
	partner: 'Partner',
	professional: 'Work',
	other: 'Other'
};

export function isRelationship(value: unknown): value is Relationship {
	return typeof value === 'string' && (RELATIONSHIPS as readonly string[]).includes(value);
}

/**
 * Names written into an entry's people field.
 *
 * Same shape as tags — comma separated, `@` optional — because it is the same
 * gesture and there is no reason for a person to learn two.
 */
export function parsePeople(raw: string): string[] {
	return [
		...new Set(
			raw
				.split(',')
				.map((n) => n.replace(/^@+/, '').trim())
				.filter(Boolean)
		)
	];
}

/**
 * A birthday, written the way somebody says it.
 *
 * Stored as it was given — `1990-03-14` when the year is known and `--03-14`
 * when it is not, which is what an address book needs and a date type cannot
 * hold. On a card that shape is unreadable: "--01-08" is a string, "Jan 8" is
 * a birthday. The year is not shown even where it is known, because the card
 * is answering "when", not "how old".
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function birthdayLabel(birthday: string | null | undefined): string | null {
	if (!birthday) return null;
	const match = /(\d{2})-(\d{2})$/.exec(birthday);
	if (!match) return null;
	const month = MONTHS[Number(match[1]) - 1];
	const day = Number(match[2]);
	if (!month || !day) return null;
	return `${month} ${day}`;
}
