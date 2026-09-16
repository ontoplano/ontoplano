/**
 * How many copies of the demo one address may be given, and how quickly.
 *
 * A person opening the demo, closing it and opening it again wants a handful;
 * a script wants thousands. Both are answered by the same number.
 *
 * Here rather than beside the service because the waiting room says it out
 * loud — "the demo hands out five an hour" — and a number in a sentence that
 * disagrees with the number in the check is worse than no number at all.
 * `services/demo.ts` re-exports these so the server keeps one import.
 */
export const DEMO_ACCOUNTS_PER_ADDRESS = 5;
export const DEMO_WINDOW_MS = 60 * 60 * 1000;
