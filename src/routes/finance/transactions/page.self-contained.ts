import type { SelfContainedEvent } from '$lib/self-contained/routes';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import { getCurrency } from '$lib/services/settings';
import {
	availableParsers,
	createRule,
	deleteMovement,
	deleteRule,
	importStatement,
	listMovements,
	listRules,
	updateRule
} from '$lib/services/statements';

/**
 * Where a bank export becomes rows: pick the export's parser, hand over the
 * file, and the lines land deduplicated — the same file twice adds nothing.
 * The rules that sort those lines into categories and tags live here too,
 * beside the lines they sort.
 */
export const load = async ({ locals }: SelfContainedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	return {
		currency: getCurrency(ctx.userId),
		parsers: availableParsers(),
		rules: listRules(ctx),
		movements: listMovements(ctx, { limit: 300 })
	};
};

export const actions = {
	import: async ({ request, locals }: SelfContainedEvent) => {
		const form = await request.formData();
		try {
			const result = importStatement(buildCtx(locals.user!.id), {
				source: form.get('source'),
				text: form.get('text'),
				flip: form.get('flip') === 'on'
			});
			return { success: true, ...result };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	createRule: async ({ request, locals }: SelfContainedEvent) => {
		const form = await request.formData();
		try {
			createRule(buildCtx(locals.user!.id), {
				kind: form.get('kind'),
				name: form.get('heading'),
				pattern: form.get('pattern')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	updateRule: async ({ request, locals }: SelfContainedEvent) => {
		const form = await request.formData();
		try {
			updateRule(buildCtx(locals.user!.id), Number(form.get('id')), {
				name: form.get('heading') ?? undefined,
				pattern: form.get('pattern') ?? undefined,
				position: form.get('position') ?? undefined
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	deleteRule: async ({ request, locals }: SelfContainedEvent) => {
		const form = await request.formData();
		try {
			deleteRule(buildCtx(locals.user!.id), Number(form.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	deleteMovement: async ({ request, locals }: SelfContainedEvent) => {
		const form = await request.formData();
		try {
			deleteMovement(buildCtx(locals.user!.id), Number(form.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
