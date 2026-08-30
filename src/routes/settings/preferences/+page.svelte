<script lang="ts">
	import { enhance } from '$app/forms';
	import Banner from '$lib/components/Banner.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import type { PageServerData, ActionData } from './$types';
	import { THEMES } from '$lib/theme.js';
	import type { DashboardCardId } from '$lib/dashboard.js';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	// Local copy so a card can be toggled and reordered before saving.
	let layout: DashboardCardId[] = $state([...data.layout]);
	$effect(() => {
		layout = [...data.layout];
	});

	function isOn(id: DashboardCardId): boolean {
		return layout.includes(id);
	}

	function toggle(id: DashboardCardId) {
		layout = isOn(id) ? layout.filter((x) => x !== id) : [...layout, id];
	}

	function shift(id: DashboardCardId, by: number) {
		const at = layout.indexOf(id);
		const to = at + by;
		if (at === -1 || to < 0 || to >= layout.length) return;
		const next = [...layout];
		[next[at], next[to]] = [next[to], next[at]];
		layout = next;
	}

	const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

	/** 24-hour, like every other time in the app; 24 is the end of the day. */
	function hourLabel(h: number): string {
		return `${String(h).padStart(2, '0')}:00`;
	}

	// Removing a quote is destructive, so it takes two clicks like every other
	// delete in the app.
	let confirmRemove = $state<number | null>(null);

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		if (e.key === 'Escape') confirmRemove = null;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	{#if form?.message}
		<Banner kind="error" message={form.message} />
	{/if}

	{#if form?.success && form.action === 'setLayout'}
		<Banner kind="success" message="Dashboard layout saved." />
	{/if}

	{#if form?.success && form.action === 'setSections'}
		<Banner kind="success" message="Sections saved." />
	{/if}

	<form
		method="post"
		action="?/saveWeek"
		use:enhance
		class="space-y-4 border border-gray-200 bg-white p-6 shadow-card"
	>
		<div>
			<h2 class="text-sm font-semibold text-gray-900">Week and timezone</h2>
		</div>
		<div class="flex gap-4">
			<label class="flex-1">
				<span class="eyebrow text-gray-600">First day of week</span>
				<select
					name="firstDay"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				>
					{#each dayNames as day, i (i)}
						<option value={i} selected={data.week.firstDay === i}>{day}</option>
					{/each}
				</select>
			</label>
			<label class="flex-1">
				<span class="eyebrow text-gray-600">Generate tasks on</span>
				<select
					name="generateDay"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				>
					{#each dayNames as day, i (i)}
						<option value={i} selected={data.week.generateDay === i}>{day}</option>
					{/each}
				</select>
			</label>
		</div>
		<label class="block max-w-xs">
			<span class="eyebrow text-gray-600">Timezone</span>
			<input autocomplete="off" name="timezone" value={data.timezone} class="input mt-1" />
		</label>
		<button class="btn btn-primary">Save</button>
	</form>

	<!-- One currency per account: a shopping list in three is a spreadsheet. -->
	<form
		method="post"
		action="?/saveCurrency"
		use:enhance
		class="space-y-4 border border-gray-200 bg-white p-6 shadow-card"
	>
		<div>
			<h2 class="text-sm font-semibold text-gray-900">Money</h2>
			<p class="mt-1 text-sm text-gray-500">What prices on the shopping list are in.</p>
		</div>
		<label class="block max-w-[10rem]">
			<span class="eyebrow text-gray-600">Currency</span>
			<select name="currency" class="select mt-1">
				{#each data.currencies as code (code)}
					<option value={code} selected={data.currency === code}>{code}</option>
				{/each}
			</select>
		</label>
		<button class="btn btn-primary">Save</button>
	</form>

	<!--
		The hours the planner draws.

		Six to midnight is a reasonable default and a poor law: a baker's day
		starts at four and a night shift ends after it.
	-->
	<form
		method="post"
		action="?/saveGridHours"
		use:enhance
		class="space-y-4 border border-gray-200 bg-white p-6 shadow-card"
	>
		<div>
			<h2 class="text-sm font-semibold text-gray-900">Planner hours</h2>
			<p class="mt-1 text-sm text-gray-500">
				The stretch of the day the day and week grids show. Anything outside it is still there — it
				just is not drawn.
			</p>
		</div>
		<div class="flex gap-4">
			<label class="flex-1 sm:max-w-[10rem]">
				<span class="eyebrow text-gray-600">Day starts at</span>
				<select name="start" class="select mt-1">
					{#each Array.from({ length: 24 }, (_, h) => h) as h (h)}
						<option value={h} selected={data.gridHours.start === h}>{hourLabel(h)}</option>
					{/each}
				</select>
			</label>
			<label class="flex-1 sm:max-w-[10rem]">
				<span class="eyebrow text-gray-600">Day ends at</span>
				<select name="end" class="select mt-1">
					{#each Array.from({ length: 24 }, (_, h) => h + 1) as h (h)}
						<option value={h} selected={data.gridHours.end === h}>{hourLabel(h)}</option>
					{/each}
				</select>
			</label>
		</div>
		<button class="btn btn-primary">Save</button>
	</form>

	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<div class="mb-4">
			<h2 class="text-sm font-semibold text-gray-900">Sections</h2>
			<p class="mt-1 text-sm text-gray-500">
				Which parts of the app appear in the menus. A section you turn off is only put away — its
				pages still open from a link and everything in it is kept.
			</p>
		</div>

		<form method="post" action="?/setSections" use:enhance class="space-y-2">
			<div class="grid gap-2 sm:grid-cols-2">
				{#each data.sections as section (section.id)}
					<label
						class="flex cursor-pointer items-center gap-3 border border-gray-200 px-3 py-2 text-sm text-gray-900"
					>
						<input
							type="checkbox"
							name="section"
							value={section.id}
							checked={!data.hiddenSections.includes(section.id)}
							class="accent-gray-900"
						/>
						{section.label}
					</label>
				{/each}
			</div>
			<p class="text-xs text-gray-500">Home and the planner are always on.</p>
			<button class="btn btn-primary">Save sections</button>
		</form>
	</section>

	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<div class="mb-4">
			<h2 class="text-sm font-semibold text-gray-900">Dashboard</h2>
			<p class="mt-1 text-sm text-gray-500">Which cards appear, and in what order.</p>
		</div>

		<form method="post" action="?/setLayout" use:enhance class="space-y-2">
			{#each layout as id (id)}
				{@const card = data.cards.find((c) => c.id === id)}
				{#if card}
					<div class="flex items-center gap-3 border border-gray-200 px-3 py-2">
						<input type="hidden" name="card" value={id} />
						<div class="flex flex-col">
							<button
								type="button"
								onclick={() => shift(id, -1)}
								class="text-xs leading-none text-gray-500 hover:text-gray-900"
								aria-label="Move {card.label} up">&uarr;</button
							>
							<button
								type="button"
								onclick={() => shift(id, 1)}
								class="text-xs leading-none text-gray-500 hover:text-gray-900"
								aria-label="Move {card.label} down">&darr;</button
							>
						</div>
						<div class="min-w-0 flex-1">
							<span class="text-sm font-medium text-gray-900">{card.label}</span>
							<p class="text-xs text-gray-500">{card.description}</p>
						</div>
						<button type="button" onclick={() => toggle(id)} class="btn btn-sm">Hide</button>
					</div>
				{/if}
			{/each}

			{#each data.cards.filter((c) => !isOn(c.id)) as card (card.id)}
				<div
					class="flex items-center gap-3 border border-dashed border-gray-300 px-3 py-2 opacity-60"
				>
					<div class="min-w-0 flex-1">
						<span class="text-sm font-medium text-gray-900">{card.label}</span>
						<p class="text-xs text-gray-500">{card.description}</p>
					</div>
					<button type="button" onclick={() => toggle(card.id)} class="btn btn-sm">Show</button>
				</div>
			{/each}

			<div class="flex gap-2 pt-1">
				<button class="btn btn-primary">Save layout</button>
				<button formaction="?/resetLayout" class="btn">Reset to defaults</button>
			</div>
		</form>
	</section>

	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<div class="mb-4">
			<h2 class="text-sm font-semibold text-gray-900">Quotes</h2>
			<p class="mt-1 text-sm text-gray-500">One is shown per day on the dashboard.</p>
		</div>

		{#if data.quotes.length > 0}
			<div class="mb-3 divide-y divide-gray-200 border border-gray-200">
				{#each data.quotes as quote (quote.id)}
					<div class="flex items-start gap-3 px-3 py-2">
						<div class="min-w-0 flex-1">
							<p class="text-sm text-gray-900 italic">&ldquo;{quote.text}&rdquo;</p>
							{#if quote.author}
								<p class="text-xs text-gray-500">&mdash; {quote.author}</p>
							{/if}
						</div>
						{#if confirmRemove === quote.id}
							<form
								method="post"
								action="?/deleteQuote"
								use:enhance={() =>
									async ({ update }) => {
										confirmRemove = null;
										await update();
									}}
								class="flex items-center gap-2"
							>
								<input type="hidden" name="id" value={quote.id} />
								<button class="btn btn-danger btn-sm" use:armed>Confirm?</button>
								<button
									type="button"
									onclick={() => (confirmRemove = null)}
									class="text-xs text-gray-500 hover:text-gray-900">Cancel</button
								>
							</form>
						{:else}
							<button
								type="button"
								onclick={() => (confirmRemove = quote.id)}
								class="text-xs text-gray-500 hover:text-red-600"
								><Icon name="trash" /> Remove</button
							>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<EmptyState icon="note" title="No quotes yet" compact />
		{/if}

		<form
			method="post"
			action="?/addQuote"
			use:enhance={() =>
				async ({ update }) =>
					update({ reset: true })}
			class="flex flex-wrap items-end gap-2"
		>
			<label class="min-w-64 flex-1">
				<span class="eyebrow text-gray-600">Quote</span>
				<input
					name="text"
					required
					autocomplete="off"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
			</label>
			<label class="w-44">
				<span class="eyebrow text-gray-600">Author</span>
				<input
					name="author"
					autocomplete="off"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
			</label>
			<button class="btn btn-primary"><Icon name="plus" /> Add</button>
		</form>

		<!-- One at a time is fine for one; nobody types a collection in that way. -->
		<details class="mt-4 border-t border-gray-200 pt-4">
			<summary class="cursor-pointer list-none text-sm text-gray-600 hover:text-gray-900">
				<span class="text-xs text-gray-500">▸</span> Paste a list
			</summary>

			<form
				method="post"
				action="?/importQuotes"
				use:enhance={() =>
					async ({ update }) =>
						update({ reset: true })}
				class="mt-3 space-y-2"
			>
				<label class="block">
					<span class="eyebrow text-gray-600">One per line</span>
					<textarea
						name="quotes"
						rows="6"
						class="textarea mt-1"
						placeholder={'Plans are worthless, but planning is everything. — Eisenhower\nWhat gets measured gets managed -- Drucker\nA quote with nobody to attribute it to'}
					></textarea>
				</label>
				<p class="text-xs text-gray-500">
					Not CSV: half of all quotes have a comma in them. The author is whatever follows the last
					dash on the line, and duplicates are skipped.
				</p>
				<button class="btn btn-primary"><Icon name="plus" /> Import</button>
			</form>
		</details>
	</section>

	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<div class="mb-4">
			<h2 class="text-sm font-semibold text-gray-900">Style</h2>
			<p class="mt-1 text-sm text-gray-500">The shape of things, apart from light and dark.</p>
		</div>

		<form
			method="post"
			action="?/setStyle"
			use:enhance={({ formData }) => {
				// <html> is outside the component tree, so `update()` will not touch it.
				const chosen = formData.get('style')?.toString();
				if (chosen) document.documentElement.dataset.style = chosen;
				return async ({ update }) => update({ reset: false });
			}}
			class="grid gap-3 sm:grid-cols-2"
		>
			{#each data.styles as option (option.key)}
				<button
					type="submit"
					name="style"
					value={option.key}
					class="border p-4 text-left {data.style === option.key
						? 'border-gray-900 bg-gray-50'
						: 'border-gray-300 bg-white hover:bg-gray-50'}"
				>
					<span class="block text-sm font-semibold text-gray-900">{option.label}</span>
					<span class="mt-1 block text-xs text-gray-500">{option.hint}</span>
				</button>
			{/each}
		</form>
	</section>

	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<div class="mb-4">
			<h2 class="text-sm font-semibold text-gray-900">Appearance</h2>
			<p class="mt-1 text-sm text-gray-500">
				&ldquo;System&rdquo; uses whatever your device is set to.
			</p>
		</div>

		<form
			method="post"
			action="?/setTheme"
			use:enhance={({ formData }) => {
				// <html> is outside the component tree, so `update()` will not touch it.
				const chosen = formData.get('theme')?.toString();
				if (chosen) document.documentElement.dataset.theme = chosen;
				return async ({ update }) => update({ reset: false });
			}}
			class="flex gap-2"
		>
			{#each THEMES as option (option)}
				<button
					type="submit"
					name="theme"
					value={option}
					class="border px-4 py-2 text-sm capitalize shadow-sm {data.theme === option
						? 'border-gray-900 bg-gray-900 font-semibold text-white'
						: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
				>
					{option}
				</button>
			{/each}
		</form>
	</section>

	{#if data.errorReports !== 'off'}
		<section class="border border-gray-200 bg-white p-5 shadow-card">
			<h2 class="text-sm font-semibold text-gray-900">Error reports</h2>
			<p class="mt-1 text-sm text-gray-500">
				When a page breaks, send the technical details to this server's log. Only what broke — never
				what you wrote.
			</p>
			<form method="post" action="?/setErrorReports" use:enhance class="mt-3 flex gap-2">
				{#each [['yes', 'Send'], ['no', 'Never']] as [value, label] (value)}
					<button
						type="submit"
						name="decision"
						{value}
						class="border px-4 py-2 text-sm shadow-sm {data.errorReports === value
							? 'border-gray-900 bg-gray-900 font-semibold text-white'
							: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
					>
						{label}
					</button>
				{/each}
			</form>
		</section>
	{/if}
</div>
