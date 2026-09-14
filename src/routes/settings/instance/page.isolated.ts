/**
 * The Instance tab, on an instance that is a device.
 *
 * Most of this screen is about a deployment: the address a server listens on,
 * who may register with it, the timers beside it, the mailing list, the
 * invitations. A phone has none of that — there is nobody else who could
 * register, nothing listening, and no operator but the person holding it.
 *
 * What is left is the two questions the tab exists to answer, and they are the
 * same two here: what is running, and where the data is. The version matters
 * more here than on a server, not less — a device runs its own migrations and
 * a phone that has not opened the app in a month is genuinely behind.
 */
import { tableCount } from '$lib/services/account-data.js';
import { DB_FILE, POOL_NAME } from '$lib/isolated/config.js';

/** What the bundle says about itself. The defines apply in every build. */
const APP = {
	version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
	commit: typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'unknown',
	builtAt: typeof __APP_BUILT_AT__ === 'string' ? __APP_BUILT_AT__ : ''
};

export async function load() {
	return {
		/*
		 * The flag the screen branches on, so what does not apply is absent
		 * rather than blank. A row reading "Registration: closed" on a phone is
		 * not a fact about anything.
		 */
		onDevice: true,
		build: {
			...APP,
			/*
			 * A server can be older than the build it reports — the files were
			 * copied and the service never restarted — which is the whole point
			 * of the card on a server. Here the app and the process are the same
			 * thing: the page you are looking at is the build.
			 */
			startedAt: APP.builtAt
		},
		/**
		 * Where the data is: the private file, and how much schema is in it.
		 *
		 * A device runs the app's own migrations on itself, so "how many tables"
		 * is the honest answer to whether this copy is up to date with the build
		 * above — the pair of them is what somebody checks when a room has
		 * started behaving oddly.
		 */
		storage: {
			path: `${POOL_NAME}/${DB_FILE}`,
			tables: tableCount()
		},
		// Everything below is a deployment's, and the screen leaves it out.
		config: null,
		demo: false,
		invites: [],
		companions: [],
		staging: false,
		effectiveRegistration: 'closed',
		defaultGrantUntil: '',
		sellsAnything: false,
		newsletter: null
	};
}
