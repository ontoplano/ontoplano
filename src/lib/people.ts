import type { PlainKey } from './i18n/keys.js';
/**
 * People, and how you know them.
 *
 * A person is not a tag: a tag groups entries, a person accumulates a history —
 * everything you wrote that mentioned them, in one place. The relationship is
 * there so the list sorts into something you can scan, not to model anything.
 */
export const RELATIONSHIPS = ['family', 'friend', 'partner', 'professional', 'other'] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const RELATIONSHIP_LABELS: Record<Relationship, PlainKey> = {
	family: 'start.family',
	friend: 'people.friend',
	partner: 'people.partner',
	professional: 'tasks.plan.work',
	other: 'people.other'
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

/** A leap year, so a birthday on the twenty-ninth of February is a day. */
const STAND_IN_YEAR = '2000';

/**
 * A birthday as a day the date formatter can read: `2000-03-14`.
 *
 * Stored as it was given — `1990-03-14` when the year is known and `--03-14`
 * when it is not, which is what an address book needs and a date type cannot
 * hold.
 *
 * The year is a stand-in because the card says when, not how old, and the
 * words for the day belong to `$lib/when` like every other date the app prints.
 */
export function birthdayDay(birthday: string | null | undefined): string | null {
	if (!birthday) return null;
	const match = /(\d{2})-(\d{2})$/.exec(birthday);
	if (!match) return null;
	const month = Number(match[1]);
	const day = Number(match[2]);
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;
	return `${STAND_IN_YEAR}-${match[1]}-${match[2]}`;
}
