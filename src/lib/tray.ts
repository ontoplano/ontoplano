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
export async function clearTray(): Promise<void> {
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
	try {
		const registration = await navigator.serviceWorker.getRegistration();
		if (!registration || typeof registration.getNotifications !== 'function') return;
		for (const shown of await registration.getNotifications()) shown.close();
	} catch {
		// A tray that cannot be read is a tray left as it was; nothing to report.
	}
}
