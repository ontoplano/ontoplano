/**
 * Telling the open tabs that something changed underneath them.
 *
 * The app has always assumed the browser is the only thing writing: you press a
 * button, the action answers, the page reloads its own data. That stopped being
 * true when an assistant got a token. Ask one to skip the gym and put deep work
 * on this morning and it does — and the tab you are looking at goes on showing
 * the week as it was five minutes ago, which is worse than not having asked.
 *
 * ## Why this is not WebSockets
 *
 * A socket is for a conversation. This is an announcement in one direction —
 * "something of yours changed, go and look" — and for that, server-sent events
 * are strictly the better tool:
 *
 *  - it is an ordinary GET, so every proxy, every corporate middlebox and the
 *    reverse proxy in front of this app already handle it, with no `Upgrade`
 *    dance and no second port;
 *  - `EventSource` reconnects on its own, with backoff, forever — the
 *    reconnect logic a socket needs is the part that is always subtly wrong;
 *  - it costs one idle response per tab and no protocol of our own.
 *
 * The payload is deliberately not the change. It is the *rooms* that changed,
 * and the page answers by reloading its own data through the loaders it already
 * has. Sending the new state would mean a second way to build every screen, and
 * two ways to build a screen is one way to have them disagree.
 *
 * ## What it is not
 *
 * In-process, and that is a real limit rather than an oversight: one instance is
 * one Node process, so a bus in memory reaches every tab it needs to. Two
 * processes behind a load balancer would need something between them — Redis, a
 * Postgres channel, a socket — and this app does not have two, has never wanted
 * two, and would need a different database before it could.
 */
import { EventEmitter } from 'node:events';

/** The parts of the app a change can belong to. A page listens for its own. */
export type Room =
	| 'planner'
	| 'todos'
	| 'goals'
	| 'diary'
	| 'notebooks'
	| 'ideas'
	| 'people'
	| 'shopping'
	| 'kitchen'
	| 'health';

export interface LiveChange {
	/** Which rooms are now out of date. */
	rooms: Room[];
	/** When, so a client can ignore an announcement it has already acted on. */
	at: string;
	/** What made it happen, for the log and for a page that wants to say so. */
	via: 'assistant' | 'api' | 'app';
}

/*
 * One emitter for the process, keyed by account.
 *
 * `setMaxListeners` because the default of ten is a memory-leak warning, and
 * ten open tabs is a person with a laptop and a phone, not a leak. The cap
 * below is the real guard.
 */
const bus = new EventEmitter();
bus.setMaxListeners(0);

/**
 * How many streams one account may hold open at once.
 *
 * A browser opens one per tab and closes it on navigation; a script that
 * forgets to close them would otherwise hold a file descriptor each until the
 * process died. Past the cap the oldest is ended, so the newest tab always
 * works — the alternative refuses the tab somebody is actually looking at.
 */
const MAX_STREAMS_PER_ACCOUNT = 20;

const open = new Map<string, Set<() => void>>();

/** Say that something of this account's changed. Never throws at the caller. */
export function changed(userId: string, rooms: Room[], via: LiveChange['via'] = 'app'): void {
	if (!userId || rooms.length === 0) return;
	try {
		const change: LiveChange = { rooms: [...new Set(rooms)], at: new Date().toISOString(), via };
		bus.emit(userId, change);
	} catch (e) {
		// Announcing a write must never break the write it is announcing.
		console.error('live: could not announce a change:', e instanceof Error ? e.message : e);
	}
}

/**
 * Listen for this account's changes. Returns the function that stops listening.
 *
 * The caller is responsible for calling it — the SSE route does so from the
 * stream's `cancel`, which fires when the tab closes, navigates or is thrown
 * away by the browser.
 */
export function listen(userId: string, onChange: (change: LiveChange) => void): () => void {
	// Each listener is fenced off from the others. `EventEmitter` calls them in
	// turn on one stack, so one tab whose stream has already been torn down
	// would otherwise stop the announcement before it reached the tab somebody
	// is actually looking at.
	const handler = (change: LiveChange) => {
		try {
			onChange(change);
		} catch (e) {
			console.error('live: a listener failed:', e instanceof Error ? e.message : e);
		}
	};
	bus.on(userId, handler);

	const streams = open.get(userId) ?? new Set<() => void>();
	open.set(userId, streams);

	let stopped = false;
	const stop = () => {
		if (stopped) return;
		stopped = true;
		bus.off(userId, handler);
		streams.delete(stop);
		if (streams.size === 0) open.delete(userId);
	};

	streams.add(stop);

	// One over the cap: end the oldest, which is the one least likely to be a
	// tab somebody is looking at.
	if (streams.size > MAX_STREAMS_PER_ACCOUNT) {
		const oldest = streams.values().next().value;
		oldest?.();
	}

	return stop;
}

/** How many streams are open, for the health page and for a test. */
export function openStreams(): number {
	let total = 0;
	for (const streams of open.values()) total += streams.size;
	return total;
}

/**
 * Which room a webhook event belongs to.
 *
 * The services already announce what they did, for webhooks. Reusing that means
 * a write that tells the outside world also tells the tab in front of you, and
 * nothing has to remember to do both.
 */
export function roomsForEvent(event: string): Room[] {
	if (event.startsWith('todo.')) return ['todos', 'planner'];
	if (event.startsWith('diary.')) return ['diary'];
	if (event.startsWith('idea.')) return ['ideas'];
	if (event.startsWith('shopping.')) return ['shopping'];
	if (event.startsWith('recipe.')) return ['kitchen'];
	if (event.startsWith('habit.') || event.startsWith('weight.')) return ['health'];
	if (event.startsWith('goal.')) return ['goals'];
	if (event.startsWith('block.') || event.startsWith('schedule.')) return ['planner'];
	return [];
}
