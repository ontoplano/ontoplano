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
