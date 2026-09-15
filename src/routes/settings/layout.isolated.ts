/**
 * Which settings tabs an isolated instance shows.
 *
 * Administration, billing and family are questions about a server somebody
 * else can reach — a device's own instance has none of them, and the tabs stay
 * away rather than opening onto refusals.
 *
 * Account and Instance do come, because each has a half that is true here.
 * Account is where your data goes out and where the whole thing ends; Instance
 * is what build is running and where the data is kept, which matters more on a
 * device than on a server — a phone migrates itself, and one that has not
 * opened the app in a month is genuinely behind. Both screens leave out what
 * needs a server: see their `page.isolated.ts`.
 */
import type { LayoutServerData } from './$types';

export async function load(): Promise<LayoutServerData> {
	return {
		// Not to change a deployment — there is none — but to see the build and
		// the database. `settings/instance/page.isolated.ts` is that half.
		canEditInstance: true,
		canAdminister: false,
		billable: false,
		family: false,
		// There is an account page here now: the data out, and the end of the
		// instance. What it does not have is an address, a password or sessions.
		hasAccount: true,
		// And nothing can be pointed at it: an assistant, a calendar link, a
		// webhook and a data stream all need somewhere to send a request, and
		// this instance is not on a network at all.
		reachable: false
	};
}
