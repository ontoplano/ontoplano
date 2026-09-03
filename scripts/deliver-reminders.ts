/**
 * The minute's worth of reminders that have to leave the building.
 *
 * Every minute, because a reminder is a time and being told at ten past is
 * being told late:
 *
 *   * * * * * cd /path/to/ontoplano && npx tsx scripts/deliver-reminders.ts
 *
 * Cheap on the ordinary minute — one indexed query that answers nothing — and
 * safe to run twice: a reminder is stamped as pushed only after it has gone.
 *
 * It says what it did on every run, including the runs where it did nothing.
 * A job that is silent when it works and silent when nobody has ever turned
 * notifications on is a job you cannot tell apart from a broken one, and this
 * one spent an evening being exactly that.
 */
import { deliverDueReminders } from '../src/lib/server/services/reminder-delivery.js';

const { pushed, due, devices, accounts, birthdays, configured } = await deliverDueReminders();

if (!configured) {
	console.log(
		`reminders: no push keys on this instance — nothing can be sent. ` +
			`${accounts} accounts, ${birthdays} birthdays written.`
	);
} else if (devices === 0) {
	console.log(
		`reminders: no device has signed up for notifications yet ` +
			`(${accounts} accounts). Settings → Preferences → Notifications, once per browser.`
	);
} else if (due === 0) {
	console.log(`reminders: nothing due. ${devices} devices signed up across ${accounts} accounts.`);
} else {
	console.log(`reminders: ${pushed} of ${due} due went out, to ${devices} devices.`);
}
