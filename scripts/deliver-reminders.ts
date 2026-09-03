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
 */
import { deliverDueReminders } from '../src/lib/server/services/reminder-delivery.js';

const { pushed, accounts } = await deliverDueReminders();

if (pushed > 0) console.log(`reminders: ${pushed} pushed across ${accounts} accounts`);
