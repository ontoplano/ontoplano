import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { loadConfig, saveConfig, DB_PATH } from '$lib/server/config';
import { isInstanceOwner } from '$lib/server/settings';
import { toActionFailure, ValidationError } from '$lib/server/services/errors';

/**
 * Deployment settings: bind host, port, database path.
 *
 * These describe the machine, not the account, so they are only readable and
 * writable on a self-hosted instance by its owner. Anyone else gets a 404 —
 * "not yours" and "not there" are the same answer. This page moves to /admin
 * once roles land.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!isInstanceOwner(locals.user!.id)) error(404, 'Not found');

	return { config: loadConfig() };
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		if (!isInstanceOwner(locals.user!.id)) error(404, 'Not found');

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
				week: current.week
			});

			return { success: true, action: 'save' };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
