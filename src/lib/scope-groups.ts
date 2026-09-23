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
	{ key: 'tasks', says: 'scopeGroups.todosAndGoals', scopes: ['tasks:read', 'tasks:write'] },
	{
		key: 'writing',
		says: 'scopeGroups.whatYouWrite',
		scopes: ['notes:read', 'notes:write', 'ideas:read', 'ideas:write']
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
