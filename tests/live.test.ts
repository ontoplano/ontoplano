import { afterEach, describe, expect, it, vi } from 'vitest';
import { changed, listen, openStreams, roomsForEvent } from '../src/lib/server/live';

/**
 * The bus that tells open tabs their data moved.
 *
 * Written because the failure it prevents is silent: an assistant writes to the
 * account, the write succeeds, and the tab in front of the person goes on
 * showing what was true before they asked. Nothing errors, nothing is logged —
 * the screen is simply wrong, and it stays wrong until they reload by hand.
 */
const stops: (() => void)[] = [];
afterEach(() => {
	while (stops.length) stops.pop()!();
});

function watch(userId: string, onChange: Parameters<typeof listen>[1]) {
	const stop = listen(userId, onChange);
	stops.push(stop);
	return stop;
}

describe('who hears a change', () => {
	it('reaches every tab of the account it belongs to', () => {
		const first = vi.fn();
		const second = vi.fn();
		watch('ana', first);
		watch('ana', second);

		changed('ana', ['planner'], 'assistant');

		expect(first).toHaveBeenCalledOnce();
		expect(second).toHaveBeenCalledOnce();
		expect(first.mock.calls[0][0].rooms).toEqual(['planner']);
		expect(first.mock.calls[0][0].via).toBe('assistant');
	});

	/**
	 * The one that matters more than the others.
	 *
	 * A bus keyed by account is one `emit` away from being a bus keyed by
	 * nothing, and the failure mode is somebody watching a stranger's writes.
	 */
	it('never reaches anybody else', () => {
		const other = vi.fn();
		watch('joão', other);

		changed('ana', ['diary']);

		expect(other).not.toHaveBeenCalled();
	});

	it('stops when the tab does', () => {
		const heard = vi.fn();
		const stop = watch('ana', heard);

		changed('ana', ['todos']);
		stop();
		changed('ana', ['todos']);

		expect(heard).toHaveBeenCalledOnce();
	});

	it('leaves nothing behind when every tab has gone', () => {
		const before = openStreams();
		const stop = watch('ana', () => {});
		expect(openStreams()).toBe(before + 1);
		stop();
		expect(openStreams()).toBe(before);
		// Twice is not an error: a stream can be cancelled and then torn down.
		stop();
		expect(openStreams()).toBe(before);
	});

	it('says nothing when there is nothing to say', () => {
		const heard = vi.fn();
		watch('ana', heard);

		changed('ana', []);
		changed('', ['planner']);

		expect(heard).not.toHaveBeenCalled();
	});

	/** One listener that throws must not stop the announcement reaching others. */
	it('carries on past a listener that throws', () => {
		const good = vi.fn();
		watch('ana', () => {
			throw new Error('this tab is broken');
		});
		watch('ana', good);

		expect(() => changed('ana', ['planner'])).not.toThrow();
		// The point: the tab that still works still heard it.
		expect(good).toHaveBeenCalledOnce();
	});
});

describe('which room a webhook event belongs to', () => {
	it('maps the events the services actually emit', () => {
		expect(roomsForEvent('todo.created')).toContain('todos');
		expect(roomsForEvent('todo.created')).toContain('planner');
		expect(roomsForEvent('diary.created')).toEqual(['diary']);
		expect(roomsForEvent('shopping.added')).toEqual(['shopping']);
	});

	/** An event nobody mapped announces nothing, rather than reloading the app. */
	it('says nothing about an event it does not know', () => {
		expect(roomsForEvent('something.new')).toEqual([]);
	});
});
