/**
 * The phone's notification tray, kept in step with the bell.
 *
 * On Android the number on the app's icon is the count of its notifications
 * still sitting in the tray — not anything the app sets. A reminder read in
 * the app stayed in the tray, so the icon said 2 while the bell, rightly,
 * said nothing was waiting: two answers to one question.
 *
 * So once nothing is unread, the tray is emptied of ours. Whatever the bell
 * still counts stays, and the icon and the bell agree again.
 */
/** How long to wait for a worker that is still starting before giving up. */
export const TRAY_WORKER_WAIT_MS = 10_000;

/**
 * The worker, once it is running.
 *
 * `getRegistration()` answers with nothing while the worker is still starting
 * — which is exactly the moment an app launched from its icon asks — so the
 * tray was left full and the icon kept its count. `ready` waits for it; the
 * limit is for a page with no worker at all, where `ready` never settles.
 */
async function worker(container: ServiceWorkerContainer) {
	const now = await container.getRegistration();
	if (now) return now;
	if (!container.ready) return undefined;
	return Promise.race([
		container.ready,
		new Promise<undefined>((gaveUp) => setTimeout(() => gaveUp(undefined), TRAY_WORKER_WAIT_MS))
	]);
}

export async function clearTray(): Promise<void> {
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
	try {
		const registration = await worker(navigator.serviceWorker);
		if (!registration || typeof registration.getNotifications !== 'function') return;
		for (const shown of await registration.getNotifications()) shown.close();
		// Where the platform keeps a count of its own as well.
		await navigator.clearAppBadge?.().catch(() => undefined);
	} catch {
		// A tray that cannot be read is a tray left as it was; nothing to report.
	}
}
