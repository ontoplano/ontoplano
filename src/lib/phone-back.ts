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

/** The slice of Capacitor's App plugin this uses. */
type PhoneApp = {
	addListener(
		event: 'backButton',
		handler: (state: { canGoBack: boolean }) => void
	): Promise<{ remove(): Promise<void> }>;
	minimizeApp(): Promise<void>;
};

function phoneApp(): PhoneApp | null {
	const capacitor = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
	const found = capacitor?.Plugins?.App;
	return found ? (found as PhoneApp) : null;
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
	let listener: { remove(): Promise<void> } | null = null;
	let gone = false;

	app
		.addListener('backButton', () => {
			if (window.history.length > startedAt) window.history.back();
			else app.minimizeApp().catch(() => undefined);
		})
		.then((handle) => {
			if (gone) handle.remove().catch(() => undefined);
			else listener = handle;
		})
		.catch(() => undefined);

	return () => {
		gone = true;
		listener?.remove().catch(() => undefined);
	};
}
