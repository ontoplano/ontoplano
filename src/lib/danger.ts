/**
 * The words the two irreversible buttons ask you to type.
 *
 * Here rather than in the page, because the form asks for one and the action
 * checks the other, and the two agreeing is the whole point of a confirmation.
 * They were the same string written twice for about an hour, which is how long
 * it takes for that to stop being true.
 *
 * Deleting the account asks for the address instead — it is the one word that
 * is definitely this account's and not the one above it in the muscle memory.
 */
export const EMPTY_CONFIRMATION = 'DELETE EVERYTHING';

/**
 * And what unmaking a device's own instance asks for.
 *
 * Its own words, not the account's: this one is not "empty the account and
 * keep it" — there is no account and no server, and what goes is the whole
 * instance and the file it lives in. Asking for the same phrase as the softer
 * button on a different screen is how somebody types the thing they have typed
 * before without reading which screen they are on.
 *
 * It names the thing being destroyed, because the one word that is definitely
 * about this and not about something else is its own name.
 */
export const ERASE_CONFIRMATION = 'ERASE ONTOPLANO';
