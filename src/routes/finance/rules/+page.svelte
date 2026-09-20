<script lang="ts">
	import Picker from '$lib/components/Picker.svelte';
	import { enhance } from '$app/forms';
	import Swatch from '$lib/components/Swatch.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Card from '$lib/components/Card.svelte';
	import CategoryDonut from '$lib/components/CategoryDonut.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { armed } from '$lib/actions/armed';
	import { formatMoney, type Currency } from '$lib/money';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const currency = $derived(data.currency as Currency);
	type Rule = PageServerData['rules'][number];

	const categories = $derived(data.rules.filter((r) => r.kind === 'category'));
	const tags = $derived(data.rules.filter((r) => r.kind === 'tag'));

	/** The rule whose row is open for editing. One at a time. */
	let editingId: number | null = $state(null);
	let deleting: Rule | null = $state(null);

	function filter(changes: { ledger?: number; months?: number; showing?: string }) {
		const params: [string, string][] = [];
		const ledger = changes.ledger ?? data.ledgerId;
		const months = changes.months ?? data.months;
		const showing = changes.showing ?? data.showing;
		if (ledger) params.push(['ledger', String(ledger)]);
		if (months !== 12) params.push(['months', String(months)]);
		if (showing) params.push(['showing', showing]);
		// The path is resolved; the rule cannot see through the appended query.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(`${resolve('/finance/rules')}?${new URLSearchParams(params)}`, { noScroll: true });
	}

	const WINDOWS = [3, 6, 12, 24];
</script>

<div class="space-y-5">
	<!-- What the rules add up to, and what is still unsorted. -->
	<Card title={t('finance.rules.whereItWent')} accent="var(--section-accent)">
		<div class="mb-3 flex flex-wrap items-center gap-2">
			<Picker
				value={String(data.ledgerId)}
				options={[
					{ value: '0', label: t('finance.rules.everyLedger') },
					...data.ledgers.map((l) => ({ value: String(l.id), label: l.name }))
				]}
				onpick={(next) => filter({ ledger: Number(next) })}
				label={t('finance.rules.everyLedger')}
			/>
			<Picker
				value={String(data.months)}
				options={WINDOWS.map((w) => ({
					value: String(w),
					label: t('finance.rules.lastMonths', { w })
				}))}
				onpick={(next) => filter({ months: Number(next) })}
				label={t('finance.rules.lastMonths', { w: data.months })}
			/>
			{#if data.unsorted > 0}
				<a
					href={resolve('/finance/ledgers')}
					class="ml-auto rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800"
					>{t('finance.rules.uncategorized', { unsorted: data.unsorted })}</a
				>
			{:else}
				<span class="ml-auto text-xs text-gray-500">{t('finance.rules.everyOutgoingLineHasA')}</span
				>
			{/if}
		</div>
		<CategoryDonut slices={data.slices} {currency} />
	</Card>

	<FormError message={form?.message} />

	<!-- The rules. Categories partition; tags overlap. -->
	<div class="grid gap-4 lg:grid-cols-2">
		{#each [{ kind: 'category' as const, title: t('finance.rules.categories'), rules: categories, blurb: t('finance.rules.aLineBelongsToThe'), placeholder: 'Groceries', pattern: 'mercado|hortifruti' }, { kind: 'tag' as const, title: t('finance.rules.tags'), rules: tags, blurb: t('finance.rules.everyTagThatMatchesApplies'), placeholder: 'healthy', pattern: 'gym|salad' }] as group (group.kind)}
			<!--
				A card, like every other list in the app.

				These two were a bordered box with a heading loose inside it and
				rows with nothing under them, so the page read as text floating on
				the background while the rest of the app reads as things sitting on
				surfaces. Same component the notebooks list uses: a header band in
				the section's colour, full-width rows against it, and the form to
				add one on a strip of its own at the foot.
			-->
			<Card title={group.title} description={group.blurb} accent="var(--section-accent)" flush>
				<ul class="divide-y divide-gray-200">
					{#each group.rules as rule, index (rule.id)}
						<li class="px-4 py-2.5">
							{#if editingId === rule.id}
								<form
									method="post"
									action="?/update"
									class="grid gap-2"
									use:enhance={() =>
										({ result, update }) => {
											if (result.type === 'success') editingId = null;
											return update();
										}}
								>
									<input type="hidden" name="id" value={rule.id} />
									<div class="flex items-center gap-2">
										<input
											type="color"
											name="color"
											value={rule.color}
											class="h-8 w-10 shrink-0 cursor-pointer border border-gray-200"
											aria-label={t('finance.rules.colourFor', { name: rule.name })}
										/>
										<OneLine name="heading" value={rule.name} class="input flex-1" required />
									</div>
									<OneLine
										name="pattern"
										value={rule.pattern}
										class="input w-full font-mono text-xs"
										required
									/>
									<div class="flex gap-2">
										<button class="btn btn-primary btn-sm" type="submit">{t('ui.save')}</button>
										<button class="btn btn-sm" type="button" onclick={() => (editingId = null)}>
											{t('ui.cancel')}
										</button>
									</div>
								</form>
							{:else}
								<div class="flex items-center gap-2">
									<Swatch color={rule.color} shape="dot" />
									<span class="shrink-0 text-sm font-medium text-gray-900">{rule.name}</span>
									<code class="min-w-0 flex-1 truncate text-xs text-gray-500" title={rule.pattern}>
										/{rule.pattern}/i
									</code>
									{#if rule.problem}
										<span class="shrink-0 text-xs font-medium text-red-700" title={rule.problem}>
											{t('finance.rules.notRunning')}
										</span>
									{:else}
										<!--
											The count is the way in.

											"Six lines" is not an answer to "is this pattern right" —
											which six is. Pressing it puts them below the rules, and
											pressing it again puts them away.
										-->
										<button
											class="shrink-0 rounded px-1.5 text-xs tabular-nums transition {data.showing ===
											String(rule.id)
												? 'on-fill'
												: 'text-gray-400 hover:text-gray-700'}"
											title={t('finance.rules.whichLinesThisClaims')}
											aria-pressed={data.showing === String(rule.id)}
											onclick={() =>
												filter({
													showing: data.showing === String(rule.id) ? '' : String(rule.id)
												})}
										>
											{rule.matches}
										</button>
									{/if}
									<form method="post" action="?/move" use:enhance>
										<input type="hidden" name="id" value={rule.id} />
										<input type="hidden" name="delta" value="-1" />
										<button
											class="icon-btn"
											aria-label={t('finance.rules.moveUp', { name: rule.name })}
											disabled={index === 0}
										>
											<Icon name="chevron-up" />
										</button>
									</form>
									<form method="post" action="?/move" use:enhance>
										<input type="hidden" name="id" value={rule.id} />
										<input type="hidden" name="delta" value="1" />
										<button
											class="icon-btn"
											aria-label={t('finance.rules.moveDown', { name: rule.name })}
											disabled={index === group.rules.length - 1}
										>
											<Icon name="chevron-down" />
										</button>
									</form>
									<button
										class="icon-btn"
										aria-label={t('finance.rules.edit', { name: rule.name })}
										onclick={() => (editingId = rule.id)}
									>
										<Icon name="edit" />
									</button>
									<button
										class="icon-btn"
										aria-label={t('finance.rules.delete', { name: rule.name })}
										onclick={() => (deleting = rule)}
									>
										<Icon name="trash" />
									</button>
								</div>
							{/if}
						</li>
					{/each}
					{#if group.rules.length === 0}
						<li class="px-4 py-6 text-center text-sm text-gray-500">
							{t('finance.rules.noneYet')}
						</li>
					{/if}
				</ul>

				<!-- Both fields, then the button: it used to sit between them, so the
				     only submit on the form came before one of the things it needs. -->
				<form
					method="post"
					action="?/create"
					class="grid gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3"
					use:enhance
				>
					<input type="hidden" name="kind" value={group.kind} />
					<OneLine name="heading" placeholder={group.placeholder} class="input w-full" required />
					<div class="flex items-center gap-2">
						<OneLine
							name="pattern"
							placeholder={group.pattern}
							class="input flex-1 font-mono text-xs"
							required
						/>
						<button class="btn btn-sm" type="submit">{t('ui.add')}</button>
					</div>
				</form>
			</Card>
		{/each}
	</div>

	<!--
		The lines behind a number.

		Under the two columns rather than inside one of them: it is the answer
		to a question asked in either, and a panel that appears inside a card
		would push the other column's rows around.
	-->
	{#if data.showing}
		<Card title={data.showingLabel} accent="var(--section-accent)" flush>
			{#snippet actions()}
				<button class="btn btn-sm" onclick={() => filter({ showing: '' })}>{t('ui.close')}</button>
			{/snippet}
			{#if data.lines.length === 0}
				<p class="px-4 py-6 text-center text-sm text-gray-500">{t('finance.rules.nothingHere')}</p>
			{:else}
				<ul class="divide-y divide-gray-200">
					{#each data.lines as line (line.id)}
						<li
							class="flex items-baseline gap-3 px-4 py-2"
							style={line.categoryColor ? `background-color: ${line.categoryColor}2b` : ''}
						>
							<span class="tabular shrink-0 text-xs text-gray-500">{line.occurredOn}</span>
							<span class="min-w-0 flex-1 truncate text-sm text-gray-900">{line.description}</span>
							{#if line.ledgerName}
								<span class="shrink-0 text-xs text-gray-500">{line.ledgerName}</span>
							{/if}
							<span
								class="shrink-0 text-sm tabular-nums {line.amountCents < 0
									? 'text-gray-900'
									: 'text-blue-700'}"
							>
								{formatMoney(line.amountCents, currency)}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</Card>
	{/if}

	<!--
		Which regular expressions these are, said plainly. "Regex" is several
		languages and the differences bite exactly where somebody reaches for
		a `\d` or a lookbehind.
	-->
	<p class="text-xs text-gray-500">
		{t('finance.rules.patternsAre')}
		<strong>{t('finance.rules.javascriptRegularExpressions')}</strong>
		{t('finance.rules.ecmascriptMatchedCaseInsensitivelyAndUna')}
		<code>{t('finance.rules.mercado')}</code>
		{t('finance.rules.findsItAnywhereInThe')}
		<code>|</code>
		{t('finance.rules.isOr')} <code>^</code>
		{t('finance.rules.and')} <code>$</code>
		{t('finance.rules.anchor')} <code>\d</code>
		{t('finance.rules.isADigitAndA')} <code>*</code>
		{t('finance.rules.or')} <code>.</code>
		{t('finance.rules.needsABackslash')}
		<a
			href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions/Cheatsheet"
			target="_blank"
			rel="noreferrer"
			class="underline">{t('finance.rules.theFullSyntax')}</a
		>
	</p>
</div>

<Modal
	open={deleting !== null}
	title={t('finance.rules.deleteThisRule')}
	onclose={() => (deleting = null)}
	size="sm"
>
	{#if deleting}
		<p class="text-sm text-gray-600">
			<strong>{deleting.name}</strong>{t('finance.rules.stopsClaimingTheLineIt', {
				matches: deleting.matches,
				s: deleting.matches === 1 ? '' : 's'
			})}
		</p>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (deleting = null)}
			>{t('finance.rules.keepIt')}</button
		>
		<form
			method="post"
			action="?/delete"
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') deleting = null;
					return update();
				}}
		>
			<input type="hidden" name="id" value={deleting?.id} />
			<button class="btn btn-danger" type="submit" use:armed>{t('ui.delete')}</button>
		</form>
	{/snippet}
</Modal>
