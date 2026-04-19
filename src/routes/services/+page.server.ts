import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getServices, controlService } from '$lib/server/systemd';

export const load: PageServerLoad = async () => {
	return { services: getServices() };
};

export const actions: Actions = {
	restart: async ({ request }) => {
		const name = (await request.formData()).get('name')?.toString()?.trim();
		if (!name) return fail(400, { message: 'Missing service name' });
		const result = controlService(name, 'restart');
		if (!result.ok) return fail(500, { message: result.error || 'Failed to restart' });
		return { success: true };
	},

	stop: async ({ request }) => {
		const name = (await request.formData()).get('name')?.toString()?.trim();
		if (!name) return fail(400, { message: 'Missing service name' });
		const result = controlService(name, 'stop');
		if (!result.ok) return fail(500, { message: result.error || 'Failed to stop' });
		return { success: true };
	},

	start: async ({ request }) => {
		const name = (await request.formData()).get('name')?.toString()?.trim();
		if (!name) return fail(400, { message: 'Missing service name' });
		const result = controlService(name, 'start');
		if (!result.ok) return fail(500, { message: result.error || 'Failed to start' });
		return { success: true };
	}
};
