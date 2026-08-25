import type { Actions, PageServerLoad } from './$types';
import { recentEvents, searchAccounts, setRole } from '$lib/server/services/admin';
import { toActionFailure } from '$lib/server/services/errors';

export const load: PageServerLoad = async ({ url }) => {
	const query = url.searchParams.get('q') ?? '';

	return {
		query,
		accounts: searchAccounts(query),
		events: recentEvents()
	};
};

export const actions: Actions = {
	setRole: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			setRole(locals.user!.id, formData.get('id')?.toString() ?? '', formData.get('role'));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
