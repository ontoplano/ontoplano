import { isIsolated } from '$lib/isolated/mode';
import { invalidateAll } from '$app/navigation';

/**
 * The browser half: hear that something changed, and reload the page's own data.
 *
 * `invalidateAll()` rather than a patch: every screen is already built by its
 * loaders, and re-running them is the one way to update a page that cannot
 * disagree with how the page was built in the first place. It is a cheap call —
 * SvelteKit refetches the loaders and Svelte updates only what actually
 * differs, so a list that gained one row does not flash.
 *
 * ## Three rules, each of which was a bug waiting
 *
 * **Only when the tab can be seen.** A laptop with forty tabs would otherwise
 * refetch forty screens nobody is looking at, every time an assistant wrote
 * anything. Hidden tabs remember that something happened and catch up when they
 * come back.
 *
 * **Never while somebody is typing.** A reload with a half-written note in a
 * textarea is the app eating their sentence. If a field is focused the reload
 * waits for it to be given up.
 *
 * **Coalesced.** An assistant doing six things does six announcements in two
 * seconds, and six reloads is a page that strobes. They collapse into one.
 */
const SETTLE_MS = 400;

/** The lock that picks the tab holding the stream, and the channel it speaks on. */
const LIVE_CHANNEL = 'ontoplano-live';

/** What the tab holding the stream tells the others. */
type LiveMessage =
	| { kind: 'changed'; data: string }
	| { kind: 'open'; reconnected: boolean }
	| { kind: 'down' }
	| { kind: 'hello' };

export interface LiveChange {
	rooms: string[];
	at: string;
	via: 'assistant' | 'api' | 'app';
}

export type LiveOptions = {
	/** Reload only when one of these changed. Empty means any change. */
	rooms?: string[];
	/** Told after a reload actually happened, for a page that wants to say so. */
	onreload?: (change: LiveChange) => void;
};

/** Whether the person is in the middle of writing something. */
function busyTyping(): boolean {
	const el = document.activeElement;
	if (!el) return false;
	if (el instanceof HTMLTextAreaElement) return true;
	if (el instanceof HTMLInputElement)
		return !['checkbox', 'radio', 'button', 'submit'].includes(el.type);
	return el instanceof HTMLElement && el.isContentEditable;
}

/**
 * Open the stream and keep the page current. Returns the function that closes it.
 *
 * Safe to call when there is no session: the endpoint answers 401, `EventSource`
 * retries, and nothing else happens. It is not called there anyway — the layout
 * only starts it for somebody signed in.
 */
export function live(options: LiveOptions = {}): () => void {
	if (typeof window === 'undefined' || typeof EventSource === 'undefined') return () => {};
	// An isolated instance has exactly one client — this one — so there is nobody
	// whose changes could arrive, and no server to hold the stream open.
	if (isIsolated()) return () => {};

	const wanted = options.rooms ?? [];
	let pending: LiveChange | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let closed = false;
	let source: EventSource | null = null;

	const flush = () => {
		timer = null;
		if (closed || !pending) return;

		/*
		 * Not now: the tab is in the background, or a sentence is half written.
		 *
		 * The change is kept. A hidden tab is woken by `visibilitychange`,
		 * which always arrives; a focused field is not, because `focusout`
		 * only fires if focus actually moves — somebody who leaves the cursor
		 * in a box and walks away never gives it up, and the change waited
		 * there for ever. So this asks again rather than waiting to be told.
		 */
		if (document.visibilityState !== 'visible') return;
		if (busyTyping()) return later();

		const change = pending;
		pending = null;
		void invalidateAll().then(() => options.onreload?.(change));
	};

	const later = () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(flush, SETTLE_MS);
	};

	/**
	 * Load the page again because something was missed, rather than announced.
	 *
	 * Through the same gate as an announcement — coalesced, and never over a
	 * half-written sentence — but past the `rooms` filter, because what was
	 * missed is by definition unknown.
	 */
	const catchUp = () => {
		pending = { rooms: [], at: new Date().toISOString(), via: 'app' };
		later();
	};

	/*
	 * Opened once the page has finished loading itself.
	 *
	 * A stream is a request that never completes, so opening it during load
	 * means the page never reaches an idle network — which breaks anything
	 * waiting for one, the test suite included, and competes with the requests
	 * that draw the first screen. `requestIdleCallback` with a timeout gets it
	 * open promptly on a fast machine and still gets it open on a slow one.
	 */
	/**
	 * Marked on the document once the stream is actually open.
	 *
	 * Not for styling: for anything that has to know the difference between
	 * "the request was answered" and "the server is listening". The subscriber
	 * is registered when the response *body* starts, which is after the
	 * response itself — so a change written in that window reaches nobody, and
	 * a test that waited for the response raced it about one time in three.
	 * `EventSource` fires `open` on the first byte, which is the moment the
	 * other end has already subscribed.
	 *
	 * The same idiom as `data-ready` for hydration, and true in the same way.
	 */
	const LIVE_MARK = 'data-live';

	/*
	 * Whether this is a reconnection rather than the first connection.
	 *
	 * A stream carries no replay: anything announced while it was down reached
	 * nobody and is not coming again. `EventSource` reconnects on its own and
	 * says nothing about the gap, so a tab that lost its stream for four
	 * seconds — a proxy closing an idle connection, a loaded box, a phone
	 * whose web view was frozen — went on showing what it had, indefinitely,
	 * while looking perfectly connected. The screen only came right when some
	 * navigation happened to reload it.
	 *
	 * So a reconnection reloads once. It costs one loader run on a thing that
	 * is already rare, and it is the difference between a stream that drops
	 * and one that loses data when it drops. A tab that heard the stream
	 * through another one and now opens its own counts as reconnecting too:
	 * there was a gap between the two.
	 */
	let everOpened = false;

	const markOpen = (reconnected: boolean) => {
		document.documentElement.setAttribute(LIVE_MARK, '');
		if (reconnected) catchUp();
		everOpened = true;
	};
	const markDown = () => document.documentElement.removeAttribute(LIVE_MARK);

	/*
	 * One stream per browser, not one per tab.
	 *
	 * Over HTTP/1.1 a browser allows six connections to a host, and a stream
	 * is a connection held for as long as the tab is open. Six tabs took all
	 * six, and from then on every request in every one of them — the next
	 * page, the next tab — queued behind streams that never finish: the app
	 * simply never loaded. HTTP/2 lifts the ceiling, but nothing guarantees
	 * the proxy in front of an instance speaks it.
	 *
	 * So one tab holds the stream and tells the others what it hears. Which
	 * tab is a Web Lock: whoever holds it opens the stream, and when that tab
	 * closes the browser hands the lock to a waiting one, which opens its own.
	 * A browser without locks or channels falls back to a stream of its own.
	 */
	const channel =
		typeof BroadcastChannel !== 'undefined' && navigator.locks
			? new BroadcastChannel(LIVE_CHANNEL)
			: null;
	let leading = !channel;
	let release: (() => void) | null = null;

	const tell = (message: LiveMessage) => channel?.postMessage(message);

	const open = () => {
		if (closed) return;
		source = new EventSource('/api/live');
		source.addEventListener('changed', (event) => {
			const data = (event as MessageEvent).data as string;
			tell({ kind: 'changed', data });
			onChanged(data);
		});
		source.addEventListener('open', () => {
			tell({ kind: 'open', reconnected: everOpened });
			markOpen(everOpened);
		});
		source.addEventListener('error', () => {
			tell({ kind: 'down' });
			markDown();
		});
	};

	if (channel) {
		channel.onmessage = (event: MessageEvent<LiveMessage>) => {
			const message = event.data;
			if (leading) {
				// A tab that has just arrived asks whether the stream is up.
				if (message.kind === 'hello' && source?.readyState === EventSource.OPEN)
					tell({ kind: 'open', reconnected: false });
				return;
			}
			if (message.kind === 'changed') onChanged(message.data);
			else if (message.kind === 'open') markOpen(message.reconnected && everOpened);
			else if (message.kind === 'down') markDown();
		};
	}

	const start = () => {
		if (closed) return;
		if (!channel) return open();

		tell({ kind: 'hello' });
		void navigator.locks.request(LIVE_CHANNEL, () => {
			if (closed) return;
			leading = true;
			open();
			// Held until this tab stops listening, which hands the lock on.
			return new Promise<void>((done) => (release = done));
		});
	};

	const idle = (window as Window & { requestIdleCallback?: typeof requestIdleCallback })
		.requestIdleCallback;
	if (idle) idle(start, { timeout: 2000 });
	else setTimeout(start, 1200);

	function onChanged(data: string) {
		let change: LiveChange;
		try {
			change = JSON.parse(data);
		} catch {
			return;
		}

		if (wanted.length > 0 && !change.rooms.some((r) => wanted.includes(r))) return;
		pending = change;
		later();
	}

	/*
	 * Coming back to the front.
	 *
	 * Acting on what was missed is half of it, and it was all this did: if
	 * something had been announced while the tab was hidden, it caught up.
	 *
	 * The other half is that a stream does not always survive being in the
	 * background. Android freezes a web view and its sockets go with it, so
	 * the phone came back with nothing pending and nothing connected — which
	 * is the app opening on a badge saying three notifications and a bell
	 * holding none, until some navigation happened to reload the data. So a
	 * return to the front reloads once and reopens the stream if it has
	 * closed. The point of noticing is that the screen is right when somebody
	 * looks at it.
	 */
	const onVisible = () => {
		if (document.visibilityState !== 'visible') return;
		if (pending) flush();
		else catchUp();
		// `CLOSED` is a stream that will not retry on its own.
		if (!closed && leading && (source === null || source.readyState === EventSource.CLOSED)) open();
	};
	document.addEventListener('visibilitychange', onVisible);

	// And the moment they stop typing.
	const onBlur = () => {
		if (pending) later();
	};
	document.addEventListener('focusout', onBlur);

	return () => {
		closed = true;
		if (timer) clearTimeout(timer);
		document.removeEventListener('visibilitychange', onVisible);
		document.removeEventListener('focusout', onBlur);
		source?.close();
		source = null;
		channel?.close();
		release?.();
		markDown();
	};
}
