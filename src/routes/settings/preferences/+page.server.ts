import type { Actions, PageServerLoad } from './$types';
import { clientErrorState, setClientErrorConsent } from '$lib/server/services/client-errors';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import { load as local, actions as localActions } from './page.self-contained';

/*
 * Everything but error reports lives in page.self-contained.ts and runs on any
 * instance. Error reporting is the exception: whether this deployment
 * collects them is the operator's setting, so the server answers with the
 * account's real state and owns the consent action. A self-contained instance keeps
 * the self-contained answer — 'off', which is also what hides the row.
 */
export const load: PageServerLoad = async (event) => {
	return {
		...(await local(event)),
		errorReports: clientErrorState(event.locals.user!.id)
	};
};

export const actions: Actions = {
	...localActions,
	setErrorReports: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			setClientErrorConsent(buildCtx(locals.user!.id), formData.get('decision'));
			return { success: true, action: 'setErrorReports' };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
