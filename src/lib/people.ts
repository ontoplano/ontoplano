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
