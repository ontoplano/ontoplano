/**
 * The events a webhook can subscribe to.
 *
 * A list, not logic: it names what the app announces, so it is needed both by
 * the server that delivers webhooks and by the services that fire them —
 * which also run on an isolated instance, where nothing is listening but the
 * sentence "this fired todo.created" is still the same sentence.
 */
export const WEBHOOK_EVENTS = [
	'todo.created',
	'todo.completed',
	'idea.created',
	'diary.created',
	'shopping.added',
	'shopping.bought'
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** What each event means, for the page and the docs. */
export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
	'todo.created': 'a todo is added',
	'todo.completed': 'a todo is finished',
	'idea.created': 'an idea is captured',
	'diary.created': 'a diary entry is written',
	'shopping.added': 'something goes on the shopping list',
	'shopping.bought': 'something on the list is bought'
};
