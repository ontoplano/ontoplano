// `better-auth/minimal` exports the initializer, not the models — importing the
// types from there silently made `locals.user` an `any`, and with it every
// `locals.user.id` passed to a service.
import type { Session, User } from 'better-auth';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
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
