import type { SubmitFunction } from '@sveltejs/kit';

/**
 * A form that is already sending does not send again.
 *
 * Pressing Create twice made two tasks. The press is not the mistake — the
 * first one takes long enough to look like it missed, so pressing again is
 * what anybody does — and the answer is not to ask people to press more
 * carefully: while a form is in flight, its own submit is not a thing that can
 * be done twice.
 *
 * It wraps the callback `use:enhance` already takes, because that is the only
 * thing in the app that knows both ends of a submission: when it starts, and
 * when its answer has been applied. `busy` is for the button, so the screen
 * says what is happening rather than appearing to have swallowed the press.
 *
 *     const sending = submitLock();
 *     <form use:enhance={sending.wrap(() => async ({ update }) => { … })}>
 *     <button disabled={sending.busy()}>
 */
export function submitLock() {
	let sending = $state(false);

	return {
		busy: () => sending,

		wrap(run: SubmitFunction): SubmitFunction {
			return (event) => {
				// The second press of a press-happy double click. Cancelled
				// rather than queued: it is the same intention, not a second one.
				if (sending) {
					event.cancel();
					return;
				}
				sending = true;

				const after = run(event);
				return async (outcome) => {
					try {
						if (typeof after === 'function') await after(outcome);
						else await outcome.update();
					} finally {
						sending = false;
					}
				};
			};
		}
	};
}
