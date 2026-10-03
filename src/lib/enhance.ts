import { enhance as kitEnhance } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import { navigating } from '$app/state';
import type { SubmitFunction } from '@sveltejs/kit';
import { afterPress } from '$lib/after-press';
import { historySettled, loadAfterHistory, popsSoFar } from '$lib/back-closes';

/**
 * `use:enhance`, with one press meaning one submission.
 *
 * Pressing Create twice made two tasks. The press is not the mistake — the
 * first one takes long enough to look like it missed, so pressing again is
 * what anybody does — and asking people to press more carefully is not a fix.
 * So while a form is in flight its buttons are disabled, and a submission
 * that repeats the one already going is dropped.
 *
 * **Identical, not merely second.** A form can genuinely be sent twice in a
 * row with something new to say each time — the notebook's divider posts a
 * width as it is dragged, and swallowing the second post left the panel
 * remembering where the drag passed through rather than where it ended. What
 * a double press sends is byte-for-byte what the first press sent; what a
 * drag sends is a different number. So the comparison is the form's own data,
 * which tells those two apart without either of them having to declare
 * anything.
 *
 * Here rather than per form, and imported *instead of* `$app/forms`, so a
 * form written next year is guarded by existing. The eslint config refuses
 * the other import for that reason.
 *
 * The buttons: a form's own submitters, plus anything elsewhere on the page
 * pointing at it with `form="its-id"` — a modal's footer sits outside the
 * `<form>` it submits, which is exactly where the Create button was.
 */
function submitters(form: HTMLFormElement): HTMLButtonElement[] {
	const own = [...form.querySelectorAll<HTMLButtonElement>('button:not([type="button"])')];
	/*
	 * `getAttribute('id')`, never `form.id`.
	 *
	 * A form exposes its own named controls as properties of itself, and those
	 * win over the element's — so on any form carrying a field called `id`,
	 * `form.id` is that `<input>` rather than the string. Which is every edit
	 * form in this app: the hidden field naming the row being edited is called
	 * `id`. `CSS.escape` then stringified an element into
	 * `[object HTMLInputElement]`, the selector matched nothing, and the Save
	 * button in the dialog's footer was never disabled — while Create, on a
	 * form with no such field, worked perfectly. One symptom, and it looked
	 * like the footer being outside the form.
	 */
	const id = form.getAttribute('id');
	const outside = id
		? [...document.querySelectorAll<HTMLButtonElement>(`button[form="${CSS.escape(id)}"]`)]
		: [];
	return [...new Set([...own, ...outside])];
}

/** What a submission is saying, as one comparable string. */
function said(data: FormData): string {
	return [...data.entries()]
		.map(([key, value]) => `${key}=${value instanceof File ? value.name : value}`)
		.join('&');
}

/**
 * A form answered after somebody has already moved on does not call them back.
 *
 * `update()` re-runs the loads of the page the form is on, and SvelteKit lets
 * an invalidation win over a navigation already under way — so writing a note
 * and pressing another notebook before the write came back left you on the
 * first one, with the press silently dropped. The page being left does not
 * need fresh data — but the one being opened does not load all of its own
 * either: a layout it shares with the page being left is reused as it stood
 * when the navigation began, before the write. `enhance` loads once more after
 * it lands (`reloadAfterMoving`).
 */
type Outcome = Parameters<
	Extract<Awaited<ReturnType<SubmitFunction>>, (...args: never[]) => unknown>
>[0];

function stayingPut(outcome: Outcome): Outcome {
	const update = outcome.update;
	return {
		...outcome,
		update: (options?: Parameters<typeof update>[0]) =>
			update(navigating.to ? { ...options, invalidateAll: false } : options)
	};
}

/**
 * A form is emptied after its handler is done with it, never before.
 *
 * SvelteKit's `update()` resets the form first and then waits for the page's
 * data to come back. Every dialog here closes *after* `update()` — so for the
 * length of a round trip the dialog stood open with its fields reset, and a
 * bound field resets to nothing: pressing Save on Edit notebook blanked the
 * title before the dialog went away. It was fixed form by form, with
 * `reset: false`, and kept coming back with the next form written the
 * ordinary way.
 *
 * So inside a dialog `update()` never resets. It notes whether a reset was
 * asked for — SvelteKit's default is yes — and the reset happens once the
 * handler has returned, by which time the dialog has been told to close and
 * the reset lands in the same frame, unseen.
 *
 * Only inside a dialog. A form that stays on the page keeps SvelteKit's own
 * order — reset, then reload — because the reload is what puts a control
 * drawn from the page's data back: a switch written `checked={data.on}` is
 * reset to unticked and ticked again by the fresh data. Reset after the
 * reload instead, it stayed unticked with nothing left to tick it, and the
 * weekly review's switch undid itself on every press.
 */
function resetAfterwards(outcome: Outcome): { outcome: Outcome; finish: () => void } {
	const update = outcome.update;
	let wanted = false;
	return {
		outcome: {
			...outcome,
			update: (options?: Parameters<typeof update>[0]) => {
				if (!outcome.formElement.closest('dialog')) return update(options);
				wanted = options?.reset ?? true;
				return update({ ...options, reset: false });
			}
		},
		finish: () => {
			const form = outcome.formElement;
			// `HTMLFormElement.prototype`, because a field called `reset` would
			// shadow the method on the form itself.
			if (wanted && outcome.result.type === 'success' && form.isConnected)
				HTMLFormElement.prototype.reset.call(form);
		}
	};
}

/**
 * A dialog saved from its footer gets out of the way before the answer.
 *
 * The press on Create or Save is the end of what somebody is doing with the
 * dialog, and holding it on screen for the round trip made every form in the
 * app feel a second or two slow. So the dialog steps away at once and the
 * page behind is usable; `Modal` keeps everything typed. When the answer
 * arrives, it steps back only if the page has not closed it — which is a
 * refusal, shown in the dialog's error banner with the fields as they were.
 *
 * Only a press from the footer: a button inside the body of a dialog is
 * usually one step of something still going on there. `data-stays` on the
 * button or the form opts a footer press out.
 */
function steppingAway(event: Parameters<SubmitFunction>[0]): HTMLDialogElement | null {
	const by = event.submitter;
	if (!by?.closest('[data-modal-footer]')) return null;
	if (by.hasAttribute('data-stays') || event.formElement.hasAttribute('data-stays')) return null;
	return by.closest('dialog');
}

/**
 * The two answers a press outside a dialog can give before the server does,
 * declared on the button (or the form) rather than written per screen.
 *
 * - `data-leaves`: the press takes its row off the list — archive, delete,
 *   put away. The row (`data-leaves="<selector>"`, or the nearest list row)
 *   goes on the press and comes back if the server refuses — or if the
 *   page's data, once it returns, still draws it: unarchiving from a list
 *   that shows both kinds takes nothing off it, and a list that reuses its
 *   nodes puts the next row in the one that was hidden.
 * - `aria-pressed`: the press is a switch. It reads as flipped on the press,
 *   and flips back if refused; when the page's data returns it draws the
 *   switch from the answer anyway.
 *
 * Both after the press has finished landing (`$lib/after-press`): a row taken
 * away under the pointer would otherwise hand the rest of the click to the
 * row that moved up into its place.
 */
const ROW = '[data-row], .list-row, .row-card, [data-todo-id], li';

/** How often to look whether a navigation under way has landed. */
const NAVIGATION_POLL_MS = 50;
/** And for how long, before giving up on it. */
const NAVIGATION_WAIT_MS = 10_000;

/** Until no navigation is under way: an invalidation started during one cancels it. */
async function navigationLanded(): Promise<void> {
	const until = Date.now() + NAVIGATION_WAIT_MS;
	while (navigating.to && Date.now() < until) {
		await new Promise((next) => setTimeout(next, NAVIGATION_POLL_MS));
	}
}

function answerAtOnce(event: Parameters<SubmitFunction>[0]): {
	takeBack: () => void;
	settle: () => void;
} {
	const by = event.submitter as HTMLElement | null;
	const declares = (name: string) =>
		by?.hasAttribute(name) ? by : event.formElement.hasAttribute(name) ? event.formElement : null;
	const undo: (() => void)[] = [];
	const hidden: HTMLElement[] = [];

	const leaver = declares('data-leaves');
	if (leaver) {
		const named = leaver.getAttribute('data-leaves');
		const row = (named ? leaver.closest(named) : leaver.closest(ROW)) as HTMLElement | null;
		if (row) {
			afterPress(() => {
				row.hidden = true;
			});
			undo.push(() => (row.hidden = false));
			hidden.push(row);
		}
	}

	if (by?.hasAttribute('aria-pressed')) {
		const was = by.getAttribute('aria-pressed');
		afterPress(() => by.setAttribute('aria-pressed', was === 'true' ? 'false' : 'true'));
		undo.push(() => was !== null && by.setAttribute('aria-pressed', was));
	}

	return {
		takeBack: () => {
			for (const one of undo) afterPress(one);
		},
		settle: () => {
			for (const row of hidden) if (row.isConnected) row.hidden = false;
		}
	};
}

export function enhance(form: HTMLFormElement, submit?: SubmitFunction) {
	let sending: string | null = null;

	const guarded: SubmitFunction = (event) => {
		const saying = said(event.formData);
		if (sending === saying) {
			// The second press of a double click: the first one is already
			// doing what was asked, and there is nothing to tell anybody.
			event.cancel();
			return;
		}
		sending = saying;
		const pressed = submitters(event.formElement);
		for (const button of pressed) button.disabled = true;

		const after = submit?.(event);
		const dialog = steppingAway(event);
		dialog?.dispatchEvent(new Event('stepaway'));
		const { takeBack, settle } = dialog
			? { takeBack: () => {}, settle: () => {} }
			: answerAtOnce(event);
		const popsBefore = popsSoFar();
		const pathBefore = location.pathname;
		return async (outcome) => {
			const saved = outcome.result.type === 'success';
			try {
				const { outcome: answered, finish } = resetAfterwards(stayingPut(outcome));
				if (outcome.result.type === 'failure' || outcome.result.type === 'error') takeBack();
				if (typeof after === 'function') await after(answered);
				else await answered.update();
				finish();
				settle();
			} finally {
				// With the outcome: the dialog comes back for a refusal, and for
				// nothing else — see `stepBack` in Modal.
				const refused = outcome.result.type === 'failure' || outcome.result.type === 'error';
				dialog?.dispatchEvent(new CustomEvent('stepback', { detail: { refused } }));
				sending = null;
				// A form that has been taken off the screen takes its buttons
				// with it; setting a property on a detached node is harmless.
				for (const button of pressed) button.disabled = false;
			}
			/*
			 * The save's data can be lost on its way to the screen two ways, and
			 * both are paid for only on the path that lost it — a load once more,
			 * after the thing that got in the way.
			 *
			 * - A phone's dialog gives its history entry back as it closes, and a
			 *   pop that lands while the data is loading cancels the load: the
			 *   task was added, the toast said so, and the list did not have it.
			 * - Somebody moved on while it was being sent — the dialog steps away
			 *   on the press, so the next press comes quickly — and the page they
			 *   went to reused a layout as it stood before the write: the
			 *   wishlist opened without the thing just put on it.
			 */
			if (saved) {
				void historySettled().then(async () => {
					// Another page, not another query on this one: a filter pressed
					// after the save writes the address too, and its own navigation
					// loads the page fresh. Reloading over it cancelled the next
					// press's navigation, so a second press on a label did nothing.
					const elsewhere = (path: string | undefined) => path !== undefined && path !== pathBefore;
					const moved = elsewhere(navigating.to?.url.pathname) || elsewhere(location.pathname);
					if (!moved && popsSoFar() === popsBefore) return;
					await navigationLanded();
					await loadAfterHistory(invalidateAll);
				});
			}
		};
	};

	return kitEnhance(form, guarded);
}
