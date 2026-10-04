import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx } from '$lib/services/ctx';
import { getCurrency } from '$lib/services/settings';
import { formAction } from '$lib/services/scoped-actions';
import {
	createRule,
	deleteRule,
	listMovements,
	listRules,
	moveRule,
	UNCATEGORIZED,
	uncategorizedCount,
	updateRule
} from '$lib/services/statements';

/** The most lines a rule's "which lines" panel lists. */
const LINES_SHOWN = 200;

/**
 * The rules, and what they are currently doing.
 *
 * A rule is only as good as what it catches, so the page shows the count
 * beside each one — every line in every ledger, the same lines the counts
 * are taken over — and, pressed, the lines themselves. Where the money went
 * is Insights' question, with its own window and ledger.
 */
export const load = async ({ locals, url }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);

	/*
	 * What a rule is actually catching.
	 *
	 * A count tells you a pattern matched six things and not which six, which
	 * is the only question worth asking when a rule is wrong. `showing` names
	 * a rule — or the pile nothing claims, which is the other half of the
	 * same question — and the lines come back with the page.
	 */
	const showing = url.searchParams.get('showing') ?? '';
	const rules = listRules(ctx);
	const shown = rules.find((r) => String(r.id) === showing);
	const showingUncategorized = showing === 'none';

	const lines =
		shown || showingUncategorized
			? listMovements(ctx, {
					limit: LINES_SHOWN,
					...(showingUncategorized
						? { category: UNCATEGORIZED }
						: shown!.kind === 'category'
							? { category: shown!.name }
							: { tag: shown!.name })
				})
			: [];

	return {
		showing,
		showingLabel: showingUncategorized ? UNCATEGORIZED : (shown?.name ?? ''),
		lines,
		currency: getCurrency(ctx.userId),
		rules,
		unsorted: uncategorizedCount(ctx)
	};
};

export const actions = {
	create: formAction((ctx, form) => {
		createRule(ctx, {
			kind: form.get('kind'),
			name: form.get('heading'),
			pattern: form.get('pattern'),
			color: form.get('color')
		});
	}),

	update: formAction((ctx, form) => {
		updateRule(ctx, Number(form.get('id')), {
			name: form.get('heading') ?? undefined,
			pattern: form.get('pattern') ?? undefined,
			color: form.get('color') ?? undefined
		});
	}),

	move: formAction((ctx, form) => {
		moveRule(ctx, Number(form.get('id')), Number(form.get('delta')));
	}),

	delete: formAction((ctx, form) => {
		deleteRule(ctx, Number(form.get('id')));
	})
};
