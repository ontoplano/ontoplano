/**
 * The phone's back gesture goes back.
 *
 * Android's default inside a web view is to leave the app when the view itself
 * reports no history — and a single-page app's history is the router's, not
 * the view's, so swiping back from four screens deep minimised ontoplano
 * instead of returning to the third. Every other app on the phone walks back
 * through where you have been, and this one should too.
 *
 * What it does not do is trap somebody: at the first screen of the session
 * there is genuinely nothing behind, and there the gesture does what it has
 * always done and puts the app away. That is the behaviour people expect at
 * the top of an app, and an app you cannot back out of is worse than one that
 * backs out too eagerly.
 */
import { inPhoneApp } from './instance-choice';

/**
 * The slice of Capacitor's App plugin this uses.
 *
 * `addListener` comes back either as a handle or as a promise of one, and
 * which of the two depends on whether you hold the generated wrapper or the
 * raw proxy the native layer injects. This holds the raw proxy — see the note
 * on `phoneApp()` — and it hands back the handle directly. Calling `.then` on
 * it threw, and because this runs while the client is starting, the throw took
 * the whole app with it: every build opened to a white screen.
 */
type ListenerHandle = { remove(): unknown };
type PhoneApp = {
	addListener(
		event: 'backButton',
		handler: (state: { canGoBack: boolean }) => void
	): ListenerHandle | Promise<ListenerHandle>;
	minimizeApp(): unknown;
};

function phoneApp(): PhoneApp | null {
	const capacitor = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
	const found = capacitor?.Plugins?.App;
	return found ? (found as PhoneApp) : null;
}

/**
 * Close whatever is on top, and say whether there was anything to close.
 *
 * The back gesture used to ask one question — is there history behind me —
 * and a form open over the page is not history. So pressing back with the
 * quick capture up did whatever the page underneath would have done, which at
 * the first screen of a session is leaving the app: you opened a to-do, went
 * back to dismiss it, and ontoplano disappeared.
 *
 * A dialog first, because that is what every form on a phone is drawn as, and
 * closing it fires the `close` event the component is already listening for —
 * so the history entry it claimed is released the same way the arrow or Escape
 * would release it. Then the wheels, which are not dialogs but do answer
 * Escape, so the gesture says Escape to them.
 *
 * What is deliberately not here is a registry somebody has to remember to add
 * to. The question "is something open over the page" is answerable from the
 * page itself.
 */
export function closeTopOverlay(): boolean {
	if (typeof document === 'undefined') return false;

	const open = document.querySelector('dialog[open]');
	if (open instanceof HTMLDialogElement) {
		open.close();
		return true;
	}

	if (document.querySelector('.pie-layer, .fan')) {
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		return true;
	}

	return false;
}

/**
 * Where the session started, so "nothing behind" is a fact rather than a guess.
 *
 * `history.length` counts the whole tab's history, which in a web view that
 * has been running for days is never 1 — it would say there is somewhere to go
 * back to long after the app has been relaunched. The length at the moment
 * this app started is the floor.
 */
let startedAt = 0;

export function backGestureGoesBack(): () => void {
	if (typeof window === 'undefined' || !inPhoneApp()) return () => {};
	const app = phoneApp();
	if (!app) return () => {};

	startedAt = window.history.length;
	let listener: ListenerHandle | null = null;
	let gone = false;

	// `Promise.resolve` takes either shape — a handle or a promise of one — so
	// this does not care which half of Capacitor's API it is holding.
	Promise.resolve(
		app.addListener('backButton', () => {
			// What is on top of the page goes first: a form, a wheel. Only when
			// there is nothing over it does the gesture mean "the page behind".
			if (closeTopOverlay()) return;
			if (window.history.length > startedAt) window.history.back();
			else Promise.resolve(app.minimizeApp()).catch(() => undefined);
		})
	)
		.then((handle) => {
			if (gone) Promise.resolve(handle.remove()).catch(() => undefined);
			else listener = handle;
		})
		.catch(() => undefined);

	return () => {
		gone = true;
		if (listener) Promise.resolve(listener.remove()).catch(() => undefined);
	};
}
