<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
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
		if (ledger) params.set('ledger', String(ledger));
		if (months !== 12) params.set('months', String(months));
		// The path is resolved; the rule cannot see through the appended query.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(`${resolve('/finance/rules')}?${new URLSearchParams(params)}`, { noScroll: true });
	}

	const WINDOWS = [3, 6, 12, 24];
</script>

<div class="space-y-5">
	<!-- What the rules add up to, and what is still unsorted. -->
	<section class="rounded border border-gray-200 p-4">
		<div class="mb-3 flex flex-wrap items-center gap-2">
			<h2 class="text-sm font-semibold text-gray-900">Where it went</h2>
			<select
				class="input input-sm"
				value={data.ledgerId}
				onchange={(e) => filter({ ledger: Number((e.currentTarget as HTMLSelectElement).value) })}
			>
				<option value={0}>Every ledger</option>
				{#each data.ledgers as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
			</select>
			<select
				class="input input-sm"
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
					{data.unsorted} line{data.unsorted === 1 ? '' : 's'} no category claims →
				</a>
			{:else}
				<span class="ml-auto text-xs text-gray-500">Every outgoing line has a category.</span>
			{/if}
		</div>
		<CategoryDonut slices={data.slices} {currency} />
	</section>

	<FormError message={form?.message} />

	<!-- The rules. Categories partition; tags overlap. -->
	<div class="grid gap-4 lg:grid-cols-2">
		{#each [{ kind: 'category' as const, title: 'Categories', rules: categories, blurb: 'A line belongs to the first category that matches, so the order below decides ties and the totals always add up.', placeholder: 'Groceries', pattern: 'mercado|hortifruti' }, { kind: 'tag' as const, title: 'Tags', rules: tags, blurb: 'Every tag that matches applies, so tags overlap freely — a lens rather than a sum.', placeholder: 'healthy', pattern: 'gym|salad' }] as group (group.kind)}
			<section class="rounded border border-gray-200 p-4">
				<h2 class="text-sm font-semibold text-gray-900">{group.title}</h2>
				<p class="mt-1 mb-3 text-xs text-gray-500">{group.blurb}</p>

				<ul class="divide-y divide-gray-100">
					{#each group.rules as rule, index (rule.id)}
						<li class="py-2">
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
									<span class="shrink-0 text-xs text-gray-400 tabular-nums" title="lines it claims">
										{rule.matches}
									</span>
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
						<li class="py-2 text-sm text-gray-500">None yet.</li>
					{/if}
				</ul>

				<form method="post" action="?/create" class="mt-3 grid gap-2" use:enhance>
					<input type="hidden" name="kind" value={group.kind} />
					<div class="flex items-center gap-2">
						<OneLine name="heading" placeholder={group.placeholder} class="input flex-1" required />
						<button class="btn btn-sm" type="submit">Add</button>
					</div>
					<OneLine
						name="pattern"
						placeholder={group.pattern}
						class="input w-full font-mono text-xs"
						required
					/>
				</form>
			</section>
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
			href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Cheatsheet"
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
