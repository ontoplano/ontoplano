<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Card from '$lib/components/Card.svelte';
	import CategoryDonut from '$lib/components/CategoryDonut.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { armed } from '$lib/actions/armed';
	import { type Currency } from '$lib/money';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const currency = $derived(data.currency as Currency);
	type Rule = PageServerData['rules'][number];

	const categories = $derived(data.rules.filter((r) => r.kind === 'category'));
	const tags = $derived(data.rules.filter((r) => r.kind === 'tag'));

	/** The rule whose row is open for editing. One at a time. */
	let editingId: number | null = $state(null);
	let deleting: Rule | null = $state(null);

	function filter(changes: { ledger?: number; months?: number }) {
		const params: [string, string][] = [];
		const ledger = changes.ledger ?? data.ledgerId;
		const months = changes.months ?? data.months;
		if (ledger) params.push(['ledger', String(ledger)]);
		if (months !== 12) params.push(['months', String(months)]);
		// The path is resolved; the rule cannot see through the appended query.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(`${resolve('/finance/rules')}?${new URLSearchParams(params)}`, { noScroll: true });
	}

	const WINDOWS = [3, 6, 12, 24];
</script>

<div class="space-y-5">
	<!-- What the rules add up to, and what is still unsorted. -->
	<Card title="Where it went" accent="var(--section-accent)">
		<div class="mb-3 flex flex-wrap items-center gap-2">
			<select
				class="input input-sm w-auto"
				value={data.ledgerId}
				onchange={(e) => filter({ ledger: Number((e.currentTarget as HTMLSelectElement).value) })}
			>
				<option value={0}>Every ledger</option>
				{#each data.ledgers as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
			</select>
			<select
				class="input input-sm w-auto"
				value={data.months}
				onchange={(e) => filter({ months: Number((e.currentTarget as HTMLSelectElement).value) })}
			>
				{#each WINDOWS as w (w)}<option value={w}>last {w} months</option>{/each}
			</select>
			{#if data.unsorted > 0}
				<a
					href={resolve('/finance/ledgers')}
					class="ml-auto rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800"
				>
					{data.unsorted} uncategorized →
				</a>
			{:else}
				<span class="ml-auto text-xs text-gray-500">Every outgoing line has a category.</span>
			{/if}
		</div>
		<CategoryDonut slices={data.slices} {currency} />
	</Card>

	<FormError message={form?.message} />

	<!-- The rules. Categories partition; tags overlap. -->
	<div class="grid gap-4 lg:grid-cols-2">
		{#each [{ kind: 'category' as const, title: 'Categories', rules: categories, blurb: 'A line belongs to the first category that matches, so the order below decides ties and the totals always add up.', placeholder: 'Groceries', pattern: 'mercado|hortifruti' }, { kind: 'tag' as const, title: 'Tags', rules: tags, blurb: 'Every tag that matches applies, so tags overlap freely — a lens rather than a sum.', placeholder: 'healthy', pattern: 'gym|salad' }] as group (group.kind)}
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
											aria-label="Colour for {rule.name}"
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
										<button class="btn btn-primary btn-sm" type="submit">Save</button>
										<button class="btn btn-sm" type="button" onclick={() => (editingId = null)}>
											Cancel
										</button>
									</div>
								</form>
							{:else}
								<div class="flex items-center gap-2">
									<span
										class="inline-block h-3 w-3 shrink-0 rounded-sm"
										style="background-color: {rule.color}"
									></span>
									<span class="shrink-0 text-sm font-medium text-gray-900">{rule.name}</span>
									<code class="min-w-0 flex-1 truncate text-xs text-gray-500" title={rule.pattern}>
										/{rule.pattern}/i
									</code>
									{#if rule.problem}
										<span class="shrink-0 text-xs font-medium text-red-700" title={rule.problem}>
											not running
										</span>
									{:else}
										<span
											class="shrink-0 text-xs text-gray-400 tabular-nums"
											title="lines it claims"
										>
											{rule.matches}
										</span>
									{/if}
									<form method="post" action="?/move" use:enhance>
										<input type="hidden" name="id" value={rule.id} />
										<input type="hidden" name="delta" value="-1" />
										<button
											class="icon-btn"
											aria-label="Move {rule.name} up"
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
											aria-label="Move {rule.name} down"
											disabled={index === group.rules.length - 1}
										>
											<Icon name="chevron-down" />
										</button>
									</form>
									<button
										class="icon-btn"
										aria-label="Edit {rule.name}"
										onclick={() => (editingId = rule.id)}
									>
										<Icon name="edit" />
									</button>
									<button
										class="icon-btn"
										aria-label="Delete {rule.name}"
										onclick={() => (deleting = rule)}
									>
										<Icon name="trash" />
									</button>
								</div>
							{/if}
						</li>
					{/each}
					{#if group.rules.length === 0}
						<li class="px-4 py-6 text-center text-sm text-gray-500">None yet.</li>
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
						<button class="btn btn-sm" type="submit">Add</button>
					</div>
				</form>
			</Card>
		{/each}
	</div>

	<!--
		Which regular expressions these are, said plainly. "Regex" is several
		languages and the differences bite exactly where somebody reaches for
		a `\d` or a lookbehind.
	-->
	<p class="text-xs text-gray-500">
		Patterns are <strong>JavaScript regular expressions</strong> (ECMAScript), matched
		case-insensitively and unanchored — <code>mercado</code> finds it anywhere in the line.
		<code>|</code> is or, <code>^</code> and <code>$</code> anchor, <code>\d</code> is a digit, and
		a literal <code>*</code> or <code>.</code> needs a backslash.
		<a
			href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions/Cheatsheet"
			target="_blank"
			rel="noreferrer"
			class="underline">The full syntax →</a
		>
	</p>
</div>

<Modal
	open={deleting !== null}
	title="Delete this rule?"
	onclose={() => (deleting = null)}
	size="sm"
>
	{#if deleting}
		<p class="text-sm text-gray-600">
			<strong>{deleting.name}</strong> stops claiming the {deleting.matches} line{deleting.matches ===
			1
				? ''
				: 's'} it matches. The lines themselves stay; they are the bank's.
		</p>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (deleting = null)}>Keep it</button>
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
			<button class="btn btn-danger" type="submit" use:armed>Delete</button>
		</form>
	{/snippet}
</Modal>
