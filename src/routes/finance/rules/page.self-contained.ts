import type { SelfContainedEvent } from '$lib/self-contained/routes';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import { getCurrency } from '$lib/services/settings';
import { listLedgers } from '$lib/services/ledgers';
import {
	categorySlices,
	createRule,
	deleteRule,
	listRules,
	moveRule,
	uncategorizedCount,
	updateRule
} from '$lib/services/statements';

/**
 * The rules, and what they are currently doing.
 *
 * A rule is only as good as what it catches, so the page shows the count
 * beside each one and the shape of the whole month's spending next to them:
 * writing a pattern and watching the pie move is the loop this screen is
 * for.
 */
export const load = async ({ locals, url }: SelfContainedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	const ledgerId = Number(url.searchParams.get('ledger') || 0) || undefined;
	const months = Number(url.searchParams.get('months') || 0) || 12;
	const from = new Date(Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth() - (months - 1), 1))
		.toISOString()
		.slice(0, 10);
	const filter = { ledgerId, from };

	return {
		currency: getCurrency(ctx.userId),
		ledgers: listLedgers(ctx),
		ledgerId: ledgerId ?? 0,
		months,
		rules: listRules(ctx),
		slices: categorySlices(ctx, filter),
		unsorted: uncategorizedCount(ctx, filter)
	};
};

export const actions = {
	create: async ({ request, locals }: SelfContainedEvent) => {
		const form = await request.formData();
		try {
			createRule(buildCtx(locals.user!.id), {
				kind: form.get('kind'),
				name: form.get('heading'),
				pattern: form.get('pattern'),
				color: form.get('color')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	update: async ({ request, locals }: SelfContainedEvent) => {
		const form = await request.formData();
		try {
			updateRule(buildCtx(locals.user!.id), Number(form.get('id')), {
				name: form.get('heading') ?? undefined,
				pattern: form.get('pattern') ?? undefined,
				color: form.get('color') ?? undefined
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	move: async ({ request, locals }: SelfContainedEvent) => {
		const form = await request.formData();
		try {
			moveRule(buildCtx(locals.user!.id), Number(form.get('id')), Number(form.get('delta')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	delete: async ({ request, locals }: SelfContainedEvent) => {
		const form = await request.formData();
		try {
			deleteRule(buildCtx(locals.user!.id), Number(form.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
