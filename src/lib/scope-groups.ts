import type { PlainKey } from '$lib/i18n/keys';

/**
 * The permissions, gathered by what they are about.
 *
 * Thirty-one tick boxes in one column is a list nobody reads to the end, and
 * the consent screen is the one screen in the app where reading to the end is
 * the whole point. Grouped, it is eight headings somebody can scan and one
 * press per heading to take a whole area away.
 *
 * The order is the order they are drawn in, and it is deliberate: the week and
 * the todo list first, because that is what an assistant is usually being
 * connected for, and the wide ones last.
 *
 * Every scope belongs to exactly one group, and `tests/scope-groups.test.ts`
 * refuses a scope that belongs to none — a new permission with no group would
 * otherwise be granted silently, drawn nowhere.
 */
export const SCOPE_GROUPS = [
	{
		key: 'week',
		says: 'scopeGroups.yourWeek',
		scopes: ['schedule:read', 'schedule:write', 'today:read', 'reminders:read', 'calendar:read']
	},
	{ key: 'tasks', says: 'scopeGroups.tasksAndGoals', scopes: ['tasks:read', 'tasks:write'] },
	{
		key: 'writing',
		says: 'scopeGroups.whatYouWrite',
		scopes: ['notes:read', 'notes:write', 'ideas:read', 'ideas:write', 'audio:read', 'audio:write']
	},
	{ key: 'people', says: 'scopeGroups.people', scopes: ['people:read', 'people:write'] },
	{
		key: 'body',
		says: 'scopeGroups.habitsAndWorkouts',
		scopes: ['habits:read', 'habits:write', 'workouts:read', 'workouts:write']
	},
	{
		key: 'home',
		says: 'scopeGroups.yourHome',
		scopes: [
			'inventory:read',
			'inventory:write',
			'locations:read',
			'locations:write',
			'kitchen:read',
			'kitchen:write'
		]
	},
	{
		key: 'money',
		says: 'scopeGroups.money',
		scopes: ['bills:read', 'bills:write', 'statements:read', 'statements:write']
	},
	{
		key: 'across',
		says: 'scopeGroups.acrossEverything',
		scopes: ['search:read', 'tags:read', 'tags:write', 'streams:read', 'streams:write']
	},
	{
		key: 'plumbing',
		says: 'scopeGroups.plumbing',
		scopes: ['plugin:declare', 'webhooks:manage']
	},
	{ key: 'removing', says: 'scopeGroups.removingThings', scopes: ['destructive'] }
] as const satisfies readonly { key: string; says: PlainKey; scopes: readonly string[] }[];

export type ScopeGroup = (typeof SCOPE_GROUPS)[number];

export function groupOf(scope: string): ScopeGroup | null {
	return SCOPE_GROUPS.find((group) => (group.scopes as readonly string[]).includes(scope)) ?? null;
}

/**
 * The groups a given set of permissions falls into, in the order above.
 *
 * Takes whatever the screen is offering rather than the whole catalogue, so
 * the consent screen — which never offers the plumbing ones — does not draw an
 * empty heading for them.
 */
export function groupsOf<T extends { key: string }>(
	offered: T[]
): { key: string; says: PlainKey; choices: T[] }[] {
	return SCOPE_GROUPS.map((group) => ({
		key: group.key,
		says: group.says as PlainKey,
		choices: offered.filter((one) => (group.scopes as readonly string[]).includes(one.key))
	})).filter((group) => group.choices.length > 0);
}

/**
 * The read grant a write grant needs, or null when it stands alone.
 *
 * Writing needs reading: a key that could change a room without seeing it was
 * given back what it changed anyway — every edit answers with the thing
 * before and after — so "write but not read" was never really true, only
 * confusing. `x:write` brings `x:read` wherever that grant exists.
 */
export function readNeededBy(scope: string): string | null {
	return scope.endsWith(':write') ? scope.replace(/:write$/, ':read') : null;
}

/** These grants, and every read grant one of them needs, from the ones that exist. */
export function withNeededReads<T extends string>(scopes: readonly T[], known: readonly T[]): T[] {
	const out = new Set<T>(scopes);
	for (const scope of scopes) {
		const read = readNeededBy(scope) as T | null;
		if (read && known.includes(read)) out.add(read);
	}
	return [...out];
}

/**
 * What each family of permissions is called — the row names of the grid.
 *
 * A family is the part of a scope before the colon. Every family needs one,
 * and `tests/scope-groups.test.ts` refuses a scope whose family has none: a
 * row named `statements` in the middle of a page in Portuguese is how this
 * map was first found missing an entry.
 */
export const SCOPE_SUBJECTS: Record<string, PlainKey> = {
	schedule: 'settings.integrations.yourWeek',
	today: 'settings.integrations.todaysPlan',
	reminders: 'app.reminders',
	calendar: 'settings.integrations.connections.calendarLink',
	tasks: 'scopeGroups.tasksAndGoals',
	notes: 'settings.integrations.diaryAndNotebooks',
	ideas: 'app.ideas',
	audio: 'rooms.media.tabs.audios',
	people: 'app.people',
	habits: 'app.habits',
	workouts: 'app.workouts',
	inventory: 'app.inventory',
	locations: 'inventory.whereThingsLive',
	kitchen: 'app.recipes',
	bills: 'app.bills',
	statements: 'settings.integrations.bankStatements',
	search: 'ui.search',
	tags: 'app.tags',
	streams: 'settings.integrations.connections.dataStreams',
	plugin: 'scopeGroups.describeItself',
	webhooks: 'settings.integrations.connections.webhooks'
};

/** One row of the permission grid: a family, and its two halves where they exist. */
export type PermissionRow = {
	subject: string;
	/** Null only for a family missing from `SCOPE_SUBJECTS`, which a test refuses. */
	label: PlainKey | null;
	/** The grant that reads it, or null where reading is not a thing. */
	read: string | null;
	/** The grant that changes it — `x:write`, or a family's one verb (`webhooks:manage`). */
	write: string | null;
};

/**
 * The grid's rows for whatever a screen offers, in the order of the groups.
 *
 * `destructive` is never a row: it is not a family, and it is drawn apart, on
 * the danger ground, because it is the one grant given on purpose.
 */
export function permissionRows(offered: readonly string[]): PermissionRow[] {
	const order = SCOPE_GROUPS.flatMap((group) => group.scopes as readonly string[]);
	const rows = new Map<string, PermissionRow>();
	for (const scope of [...offered].sort((a, b) => order.indexOf(a) - order.indexOf(b))) {
		if (scope === 'destructive') continue;
		const [subject, verb] = scope.split(':');
		const row = rows.get(subject) ?? {
			subject,
			label: SCOPE_SUBJECTS[subject] ?? null,
			read: null,
			write: null
		};
		if (verb === 'read') row.read = scope;
		else row.write = scope;
		rows.set(subject, row);
	}
	return [...rows.values()];
}
