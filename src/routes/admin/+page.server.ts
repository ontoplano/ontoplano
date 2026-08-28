import type { Actions, PageServerLoad } from './$types';
import { recentEvents, searchAccounts, setRole } from '$lib/server/services/admin';
import { toActionFailure } from '$lib/server/services/errors';

export const load: PageServerLoad = async ({ url, locals }) => {
	const query = url.searchParams.get('q') ?? '';

	return {
		query,
		accounts: searchAccounts(query),
		events: recentEvents(),
		// So the page can leave your own row alone rather than offering a button
		// the server will refuse.
		me: locals.user!.id
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
