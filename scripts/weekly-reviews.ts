/**
 * Monday morning's mail, for everybody whose Monday it is.
 *
 * Hourly, because the hour belongs to the account: somebody in Auckland and
 * somebody in São Paulo both want it at seven, and a job that ran once a day
 * could only ever be right for one of them. Every run is cheap — it reads the
 * clock in each account's own zone and does nothing for the twenty-three hours
 * that are not theirs.
 *
 *   0 * * * * cd /path/to/ontoplano && npx tsx scripts/weekly-reviews.ts
 *
 * Safe to run twice: the week it last wrote about is stored per account.
 */
/*
 * First, and for its side effect: opening the server database is what binds
 * one for the services to read. A job that reaches a service without this
 * dies on its first query with "No database is bound to this runtime" —
 * silently, at one minute past whatever, in a timer nobody is watching.
 * `scripts/check-job-deps.mjs` fails the lint on a job that leaves it out.
 */
import '../src/lib/server/db/index.js';
import { sendWeeklyReviews } from '../src/lib/server/services/review-mail.js';

const { sent, considered } = await sendWeeklyReviews();

console.log(`weekly review: ${sent} sent, ${considered} had a week worth writing about`);
