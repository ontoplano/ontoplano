import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { loadConfig, saveConfig, DB_PATH, isRegistrationMode } from '$lib/server/config';
import { isInstanceOwner } from '$lib/server/settings';
import { toActionFailure, ValidationError } from '$lib/server/services/errors';
import {
	createInvite,
	listInvites,
	revokeInvite,
	setRegistrationMode
} from '$lib/server/services/registration';

/**
 * Deployment settings: bind host, port, database path, and who may register.
 *
 * These describe the machine, not the account, so they are only readable and
 * writable on a self-hosted instance by its owner. Anyone else gets a 404 —
 * "not yours" and "not there" are the same answer. This page moves to /admin
 * once roles land.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!isInstanceOwner(locals.user!.id)) error(404, 'Not found');

	return { config: loadConfig(), invites: listInvites() };
};

/** The owner check is repeated per action, not inherited from the load. */
function owner(userId: string): string {
	if (!isInstanceOwner(userId)) error(404, 'Not found');
	return userId;
}

export const actions: Actions = {
	save: async ({ request, locals }) => {
		owner(locals.user!.id);

		const formData = await request.formData();

		try {
			const host = formData.get('host')?.toString()?.trim() ?? '';
			const port = Number(formData.get('port') || 1493);

			if (!host) throw new ValidationError('Host is required');
			if (!Number.isInteger(port) || port < 1 || port > 65535)
				throw new ValidationError('Port must be between 1 and 65535');

			const current = loadConfig();
			saveConfig({
				server: { host, port },
				database: { path: current.database.path || DB_PATH },
				week: current.week,
				registration: current.registration
			});

			return { success: true, action: 'save' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	setRegistration: async ({ request, locals }) => {
		owner(locals.user!.id);

		const formData = await request.formData();

		try {
			const mode = formData.get('mode');
			if (!isRegistrationMode(mode)) throw new ValidationError('Unknown registration mode');

			setRegistrationMode(mode);
			return { success: true, action: 'setRegistration' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	createInvite: async ({ request, locals }) => {
		const userId = owner(locals.user!.id);
		const formData = await request.formData();

		try {
			const invite = createInvite(
				userId,
				{ note: formData.get('note'), expiresInDays: formData.get('expiresInDays') },
				new Date()
			);

			return { success: true, action: 'createInvite', code: invite.code };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	revokeInvite: async ({ request, locals }) => {
		owner(locals.user!.id);
		const formData = await request.formData();

		try {
			revokeInvite(Number(formData.get('id')));
			return { success: true, action: 'revokeInvite' };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
