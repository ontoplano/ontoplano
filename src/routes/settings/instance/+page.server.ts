import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { loadConfig, saveConfig, isRegistrationMode } from '$lib/server/config';
import { instanceSells } from '$lib/server/services/billing';
import { companions } from '$lib/server/services/companions';
import { isDemo, isSelfHosted, isStaging } from '$lib/server/settings';
import { canEditInstance } from '$lib/server/services/admin';
import { build } from '$lib/server/services/version';
import { ValidationError } from '$lib/server/services/errors';
import { toActionFailure } from '$lib/server/http-errors';
import { counts, confirmedAddresses, newsletterEnabled } from '$lib/server/services/newsletter';
import {
	createInvite,
	defaultGrantUntil,
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

	const config = loadConfig();

	/*
	 * The demo shows what this page is, not where this box is.
	 *
	 * Everybody browsing the demo is signed into its one account, which is the
	 * first account, which is an administrator — so this page is public there.
	 * The bind address and the database path are facts about somebody's server,
	 * including the name of the user it runs as, and they are nobody's business
	 * but the operator's. Blanked rather than removed: the point of a demo is to
	 * show the shape of the thing.
	 */
	const demo = isDemo();
	if (demo) {
		config.server = { ...config.server, host: '', port: 0 };
		config.database = { ...config.database, path: '' };
	}

	return {
		config,
		demo,
		invites: listInvites(),
		// What is running, so "did my deploy land" is answerable from here rather
		// than from an ssh session.
		build: build(),
		// The processes the app needs beside itself — the reminders timer above
		// all. The demo has no business showing the demo box's units.
		companions: demo ? [] : await companions(),
		staging: isStaging(),
		// The file says one thing and the environment may say another; the page
		// should show what is actually in force, not what is written down.
		effectiveRegistration: registrationMode(),
		// What the invite form opens on: a month from now, as a date field's value.
		defaultGrantUntil: defaultGrantUntil(new Date()).slice(0, 10),
		// Whether an invitation is worth anything beyond letting somebody in.
		// `instanceSells()`, not `!isSelfHosted()`: an instance that never said
		// ONTOPLANO_SELLS=true has no billing for an invitation to waive, and a
		// fresh clone must not open its life dressed as the one that charges.
		sellsAnything: instanceSells(),
		// The list, if this instance keeps one. Two numbers rather than the
		// addresses: a page nobody asked for should not put a hundred people's
		// email on screen, and the export is one click away when it is wanted.
		newsletter: newsletterEnabled() && !demo ? counts() : null
	};
};

/** The owner check is repeated per action, not inherited from the load. */
function owner(userId: string): string {
	if (!canEditInstance(userId)) error(404, 'Not found');
	return userId;
}

export const actions: Actions = {
	/*
	 * The list, as a file.
	 *
	 * Confirmed and not unsubscribed, one address per line, because whatever
	 * sends the issue takes a paste — and because a list that included the
	 * people who never confirmed is the thing that gets a sender banned.
	 */
	exportSubscribers: async ({ locals }) => {
		owner(locals.user!.id);
		if (!newsletterEnabled()) error(404, 'Not found');
		return { success: true, action: 'exportSubscribers', addresses: confirmedAddresses() };
	},

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
				{
					note: formData.get('note'),
					expiresInDays: formData.get('expiresInDays'),
					grantsUntil: formData.get('grantsUntil')
				},
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
