// `better-auth/minimal` exports the initializer, not the models — importing the
// types from there silently made `locals.user` an `any`, and with it every
// `locals.user.id` passed to a service.
import type { Session, User } from 'better-auth';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	// Baked in by `define` in vite.config.ts, and read by
	// `$lib/server/services/version`. Inside `declare global` because this file
	// has imports, which makes it a module — a top-level `declare const` here
	// would be scoped to the module and invisible everywhere else.
	const __APP_VERSION__: string;
	const __APP_COMMIT__: string;
	const __APP_BUILT_AT__: string;

	namespace App {
		interface Locals {
			user?: User;
			session?: Session;
			/** Request id: stamped by the logging hook, echoed by the error page. */
			rid?: string;
			/**
			 * Whether the Android app is drawing this page rather than a browser.
			 *
			 * The app says so on every launch and the answer is kept in a cookie;
			 * see `$lib/platform.ts`. It is not a screen size and not
			 * `display-mode: standalone` — both of those are also true of the site
			 * saved to a home screen on a phone with no app on it.
			 */
			nativeApp?: boolean;
		}

		/**
		 * What `handleError` hands to the error page.
		 *
		 * The id ties the page somebody is looking at to a line in the log, so a
		 * bug report is a search rather than a conversation.
		 */
		interface Error {
			message: string;
			id?: string;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
