/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * A history of our own: happy-dom's does not fire `popstate` on `back()`, and
 * the whole point here is what happens when that lands a moment later.
 */
const STATES = 'sveltekit:states';
let entries: Record<string, unknown>[] = [{}];
let at = 0;
const page = { state: {} as App.PageState };

function current(): App.PageState {
	return (entries[at][STATES] ?? {}) as App.PageState;
}

vi.mock('$app/navigation', () => ({
	pushState: (_url: string, state: App.PageState) => {
		entries = [...entries.slice(0, at + 1), { [STATES]: state }];
		at++;
		page.state = state;
	}
}));
vi.mock('$app/state', () => ({ page }));

const { BackCloses } = await import('../src/lib/back-closes');

/** The browser's back: the pop lands on a later task, as it does for real. */
function back() {
	setTimeout(() => {
		at = Math.max(0, at - 1);
		page.state = current();
		window.dispatchEvent(new PopStateEvent('popstate'));
	}, 5);
}

/** Let queued pushes and pops land. */
async function settle() {
	for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 10));
}

function screen() {
	const closed = vi.fn();
	const guard = new BackCloses(closed);
	return { guard, closed };
}

describe('screens stacked on the history', () => {
	beforeEach(() => {
		entries = [{}];
		at = 0;
		page.state = {};
		vi.spyOn(history, 'state', 'get').mockImplementation(() => entries[at]);
		vi.spyOn(history, 'back').mockImplementation(back);
	});

	it('opening a second screen leaves the first open', async () => {
		const edit = screen();
		const confirm = screen();
		edit.guard.claim();
		await settle();
		confirm.guard.claim();
		await settle();
		edit.guard.watch();
		confirm.guard.watch();

		expect(current().backCloses?.length).toBe(2);
		expect(edit.closed).not.toHaveBeenCalled();
		expect(confirm.closed).not.toHaveBeenCalled();
	});

	it('back closes only the top one, then the one below', async () => {
		const edit = screen();
		const confirm = screen();
		edit.guard.claim();
		confirm.guard.claim();
		await settle();

		history.back();
		await settle();
		edit.guard.watch();
		confirm.guard.watch();
		expect(confirm.closed).toHaveBeenCalledOnce();
		expect(edit.closed).not.toHaveBeenCalled();

		history.back();
		await settle();
		edit.guard.watch();
		expect(edit.closed).toHaveBeenCalledOnce();
		expect(at).toBe(0);
	});

	it('closing the top one by its own controls pops only its entry', async () => {
		const edit = screen();
		const confirm = screen();
		edit.guard.claim();
		confirm.guard.claim();
		await settle();

		await confirm.guard.release();
		edit.guard.watch();
		expect(at).toBe(1);
		expect(edit.closed).not.toHaveBeenCalled();
		expect(confirm.closed).not.toHaveBeenCalled();
	});

	it('closing both at once gives back both entries before it settles', async () => {
		const edit = screen();
		const confirm = screen();
		edit.guard.claim();
		confirm.guard.claim();
		await settle();

		// The lower one first, which cannot pop past the one above it yet.
		const lower = edit.guard.release();
		const upper = confirm.guard.release();
		await Promise.all([lower, upper]);
		expect(at).toBe(0);
	});

	it('a push waits for a pop still under way', async () => {
		const first = screen();
		first.guard.claim();
		await settle();

		const released = first.guard.release();
		const second = screen();
		second.guard.claim();
		await released;
		await settle();
		second.guard.watch();

		expect(at).toBe(1);
		expect(second.closed).not.toHaveBeenCalled();
	});

	it('a reset page.state is not a back press', async () => {
		const edit = screen();
		edit.guard.claim();
		await settle();
		page.state = {};
		edit.guard.watch();
		expect(edit.closed).not.toHaveBeenCalled();
	});
});
