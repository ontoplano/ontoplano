/**
 * @vitest-environment happy-dom
 *
 * The browser half of the live stream: what it does when it stops hearing.
 *
 * The server half is `live.test.ts`. This is the other end, and what it is
 * written for is the failure nobody sees: a stream carries no replay, so
 * anything announced while it was down reached nobody and is not coming
 * again. `EventSource` reconnects on its own and says nothing about the gap —
 * so a tab that lost four seconds to a proxy closing an idle connection, or
 * to a phone freezing its web view, went on showing what it had while looking
 * perfectly connected.
 *
 * The other one here is a change that arrives while a field is focused. That
 * reload is deliberately deferred — a page rebuilt under a half-written note
 * eats the sentence — but it was waiting on `focusout`, and somebody who
 * leaves the cursor in a box and walks away never gives it up.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const invalidateAll = vi.fn(async () => {});
vi.mock('$app/navigation', () => ({ invalidateAll: () => invalidateAll() }));
vi.mock('$lib/isolated/mode', () => ({ isIsolated: () => false }));

const { live } = await import('../src/lib/live');

/** How long the client waits for a burst of announcements to settle. */
const SETTLE_MS = 400;

/** A stand-in for the browser's own, with the two events the client listens to. */
class FakeStream {
	static open: FakeStream[] = [];
	static readonly CLOSED = 2;

	readyState = 0;
	closed = false;
	private listeners = new Map<string, ((event: unknown) => void)[]>();

	constructor(readonly url: string) {
		FakeStream.open.push(this);
	}

	addEventListener(name: string, handler: (event: unknown) => void) {
		this.listeners.set(name, [...(this.listeners.get(name) ?? []), handler]);
	}

	close() {
		this.closed = true;
		this.readyState = FakeStream.CLOSED;
	}

	/** The server answered and the body started — the moment it is subscribed. */
	connect() {
		this.readyState = 1;
		this.fire('open', {});
	}

	/** The connection went away. The real one retries by itself. */
	drop() {
		this.readyState = 0;
		this.fire('error', {});
	}

	announce(rooms: string[]) {
		this.fire('changed', { data: JSON.stringify({ rooms, at: 'now', via: 'assistant' }) });
	}

	private fire(name: string, event: unknown) {
		for (const handler of this.listeners.get(name) ?? []) handler(event);
	}
}

let stop: () => void = () => {};

beforeEach(() => {
	vi.useFakeTimers();
	invalidateAll.mockClear();
	FakeStream.open = [];
	vi.stubGlobal('EventSource', FakeStream);
	// The client opens the stream when the page next goes idle; the fallback
	// path is a plain timer, which fake timers can drive.
	vi.stubGlobal('requestIdleCallback', undefined);
	document.documentElement.removeAttribute('data-live');
});

afterEach(() => {
	stop();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

/** Start listening and run out the delay before the stream is opened. */
function start(): FakeStream {
	stop = live();
	vi.advanceTimersByTime(2000);
	const stream = FakeStream.open.at(-1);
	expect(stream, 'no stream was opened').toBeTruthy();
	return stream!;
}

describe('a page listening for changes', () => {
	test('reloads itself when something it cares about changed', async () => {
		const stream = start();
		stream.connect();

		stream.announce(['notebooks']);
		expect(invalidateAll).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(SETTLE_MS);
		expect(invalidateAll).toHaveBeenCalledOnce();
	});

	/*
	 * The one this file exists for.
	 *
	 * Nothing is announced across the gap, so there is no event to act on:
	 * what says the page is stale is the reconnection itself.
	 */
	test('reloads once when the stream comes back, because the gap carried no replay', async () => {
		const stream = start();
		stream.connect();
		await vi.advanceTimersByTimeAsync(SETTLE_MS);
		expect(invalidateAll).not.toHaveBeenCalled();

		// Whatever was written in here reached nobody and is not coming again.
		stream.drop();
		expect(document.documentElement.hasAttribute('data-live')).toBe(false);

		stream.connect();
		await vi.advanceTimersByTimeAsync(SETTLE_MS);
		expect(invalidateAll).toHaveBeenCalledOnce();
		expect(document.documentElement.hasAttribute('data-live')).toBe(true);
	});

	test('and not on the first connection, which has missed nothing', async () => {
		const stream = start();
		stream.connect();

		await vi.advanceTimersByTimeAsync(SETTLE_MS * 2);
		expect(invalidateAll).not.toHaveBeenCalled();
	});

	/*
	 * Deferred, and asked again — not deferred and forgotten.
	 *
	 * `focusout` only fires if focus actually moves. A cursor left in a box is
	 * a reload that waited for an event that was never coming.
	 */
	test('waits for a half-written sentence, and stops waiting when it is finished', async () => {
		const box = document.createElement('textarea');
		document.body.append(box);
		box.focus();

		const stream = start();
		stream.connect();
		stream.announce(['diary']);

		await vi.advanceTimersByTimeAsync(SETTLE_MS * 4);
		expect(invalidateAll, 'reloaded under a focused field').not.toHaveBeenCalled();

		/*
		 * Taken off the page rather than blurred, on purpose.
		 *
		 * A blur fires `focusout`, which the client also listens to — so
		 * blurring would pass whether or not the deferred reload ever asks
		 * again by itself. This is the case with no event at all.
		 */
		box.remove();
		await vi.advanceTimersByTimeAsync(SETTLE_MS * 2);
		expect(invalidateAll).toHaveBeenCalledOnce();
	});

	test('ignores a room it was not asked to watch', async () => {
		stop = live({ rooms: ['planner'] });
		vi.advanceTimersByTime(2000);
		const stream = FakeStream.open.at(-1)!;
		stream.connect();

		stream.announce(['kitchen']);
		await vi.advanceTimersByTimeAsync(SETTLE_MS);
		expect(invalidateAll).not.toHaveBeenCalled();

		stream.announce(['planner']);
		await vi.advanceTimersByTimeAsync(SETTLE_MS);
		expect(invalidateAll).toHaveBeenCalledOnce();
	});
});
