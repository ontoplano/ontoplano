import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { loadConfig, saveConfig, isRegistrationMode } from '$lib/server/config';
import { isStaging } from '$lib/server/settings';
import { canEditInstance } from '$lib/server/services/admin';
import { build } from '$lib/server/services/version';
import { toActionFailure, ValidationError } from '$lib/server/services/errors';
import {
	createInvite,
	listInvites,
	registrationMode,
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
	if (!canEditInstance(locals.user!.id)) error(404, 'Not found');

	return {
		config: loadConfig(),
		invites: listInvites(),
		// What is running, so "did my deploy land" is answerable from here rather
		// than from an ssh session.
		build: build(),
		staging: isStaging(),
		// The file says one thing and the environment may say another; the page
		// should show what is actually in force, not what is written down.
		effectiveRegistration: registrationMode()
	};
};

/** The owner check is repeated per action, not inherited from the load. */
function owner(userId: string): string {
	if (!canEditInstance(userId)) error(404, 'Not found');
	return userId;
}

export const actions: Actions = {
	/*
	 * There is no `save` action here any more.
	 *
	 * The host and port were editable from this page, and changing the address
	 * a running instance listens on, from inside that instance, has no good
	 * outcome: a wrong value takes the app off the air and the way back is a
	 * text editor and a restart on the box. They are shown, in config.toml they
	 * are set.
	 */

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

	setEmailChange: async ({ request, locals }) => {
		owner(locals.user!.id);

		const formData = await request.formData();
		const current = loadConfig();

		saveConfig({
			...current,
			account: { allowEmailChange: formData.get('allowEmailChange') === 'true' }
		});

		return { success: true, action: 'setEmailChange' };
	},

	setClientErrors: async ({ request, locals }) => {
		owner(locals.user!.id);

		const formData = await request.formData();
		const current = loadConfig();

		saveConfig({
			...current,
			reports: { clientErrors: formData.get('clientErrors') === 'true' }
		});

		return { success: true, action: 'setClientErrors' };
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
