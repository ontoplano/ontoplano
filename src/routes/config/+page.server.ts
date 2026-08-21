import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { loadConfig, saveConfig, DB_PATH } from '$lib/server/config';
import {
	FEATURE_DEFAULTS,
	getFeatureFlags,
	getTheme,
	isTheme,
	setTheme,
	setUserSetting
} from '$lib/server/settings';

export const load: PageServerLoad = async ({ locals }) => {
	const config = loadConfig();
	return {
		config,
		features: getFeatureFlags(locals.user!.id),
		theme: getTheme(locals.user!.id)
	};
};

export const actions: Actions = {
	setTheme: async ({ request, locals }) => {
		const formData = await request.formData();
		const theme = formData.get('theme')?.toString() ?? '';

		if (!isTheme(theme)) return fail(400, { message: 'Unknown theme' });

		setTheme(locals.user!.id, theme);

		return { success: true, action: 'setTheme' };
	},

	save: async ({ request }) => {
		const formData = await request.formData();
		const host = formData.get('host')?.toString()?.trim() ?? '0.0.0.0';
		const port = Number(formData.get('port') || 1493);
		const firstDay = Number(formData.get('firstDay') ?? 0);
		const generateDay = Number(formData.get('generateDay') ?? 6);

		if (!host) return fail(400, { message: 'Host is required' });
		if (port < 1 || port > 65535) return fail(400, { message: 'Port must be between 1 and 65535' });
		if (firstDay < 0 || firstDay > 6) return fail(400, { message: 'Invalid first day' });
		if (generateDay < 0 || generateDay > 6) return fail(400, { message: 'Invalid generate day' });

		const current = loadConfig();

		saveConfig({
			server: { host, port },
			database: { path: current.database.path || DB_PATH },
			week: { firstDay, generateDay }
		});

		return { success: true, action: 'save' };
	},

	toggleFeature: async ({ request, locals }) => {
		const formData = await request.formData();
		const key = formData.get('key')?.toString();

		if (!key || !(key in FEATURE_DEFAULTS)) {
			return fail(400, { message: 'Invalid feature key' });
		}

		const currentFlags = getFeatureFlags(locals.user!.id);
		setUserSetting(locals.user!.id, key, String(!currentFlags[key]));

		return { success: true, action: 'toggleFeature' };
	}
};
