import type { PlainKey } from '$lib/i18n/keys';

/**
 * What each permission says, as a catalogue key.
 *
 * The sentences used to be the values of `SCOPES` itself, which is where a
 * permission's English definition belongs — the API reference and the docs are
 * generated from it. But they were also what the token screen drew, so
 * somebody reading the app in Portuguese was handed a list of English
 * sentences about their own diary and a word like "statements" in the middle
 * of it. A permission is one of the few things in here that has to be read
 * carefully before it is granted, so it is the last place to leave in the
 * source language.
 *
 * Keyed by the scope, exhaustively: a scope added without a sentence here is a
 * type error rather than a blank line on the screen.
 */
export const SCOPE_WORDS = {
	'streams:write': 'scopes.streamsWrite',
	'streams:read': 'scopes.streamsRead',
	'schedule:read': 'scopes.scheduleRead',
	'schedule:write': 'scopes.scheduleWrite',
	'today:read': 'scopes.todayRead',
	'reminders:read': 'scopes.remindersRead',
	'habits:read': 'scopes.habitsRead',
	'habits:write': 'scopes.habitsWrite',
	'plugin:declare': 'scopes.pluginDeclare',
	'webhooks:manage': 'scopes.webhooksManage',
	'inventory:read': 'scopes.inventoryRead',
	'inventory:write': 'scopes.inventoryWrite',
	'locations:read': 'scopes.locationsRead',
	'locations:write': 'scopes.locationsWrite',
	'calendar:read': 'scopes.calendarRead',
	'notes:read': 'scopes.notesRead',
	'notes:write': 'scopes.notesWrite',
	'ideas:read': 'scopes.ideasRead',
	'ideas:write': 'scopes.ideasWrite',
	'tasks:read': 'scopes.tasksRead',
	'tasks:write': 'scopes.tasksWrite',
	'kitchen:read': 'scopes.kitchenRead',
	'kitchen:write': 'scopes.kitchenWrite',
	'workouts:read': 'scopes.workoutsRead',
	'workouts:write': 'scopes.workoutsWrite',
	'bills:read': 'scopes.billsRead',
	'statements:read': 'scopes.statementsRead',
	'statements:write': 'scopes.statementsWrite',
	'bills:write': 'scopes.billsWrite',
	'people:read': 'scopes.peopleRead',
	'people:write': 'scopes.peopleWrite',
	'search:read': 'scopes.searchRead',
	'tags:read': 'scopes.tagsRead',
	'tags:write': 'scopes.tagsWrite',
	destructive: 'scopes.destructive'
} as const satisfies Record<string, PlainKey>;

/** The louder line under the wide grants, for the few that have one. */
export const SCOPE_CAUTION_WORDS = {
	'search:read': 'scopes.cautions.searchRead',
	destructive: 'scopes.cautions.destructive'
} as const satisfies Record<string, PlainKey>;

/**
 * What each webhook event means, likewise.
 *
 * Same story as the permissions: the sentence beside the tick box was an
 * English phrase in a module the docs are generated from, so the box that says
 * "tell me when a todo is added" said it in English whatever the app was set
 * to. The English stays where the docs read it; this is what the screen draws.
 */
export const WEBHOOK_EVENT_WORDS = {
	'todo.created': 'webhookEvents.todoCreated',
	'todo.completed': 'webhookEvents.todoCompleted',
	'idea.created': 'webhookEvents.ideaCreated',
	'diary.created': 'webhookEvents.diaryCreated',
	'inventory.added': 'webhookEvents.inventoryAdded',
	'inventory.bought': 'webhookEvents.inventoryBought'
} as const satisfies Record<string, PlainKey>;

export function webhookEventWord(event: string): PlainKey | null {
	return (WEBHOOK_EVENT_WORDS as Record<string, PlainKey>)[event] ?? null;
}

export function scopeWord(scope: string): PlainKey | null {
	return (SCOPE_WORDS as Record<string, PlainKey>)[scope] ?? null;
}

export function scopeCautionWord(scope: string): PlainKey | null {
	return (SCOPE_CAUTION_WORDS as Record<string, PlainKey>)[scope] ?? null;
}
