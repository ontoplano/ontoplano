<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageServerData, ActionData } from './$types';
	import Banner from '$lib/components/Banner.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

	let template = $state('remote');

	/**
	 * The browser knows where it is; asking would be asking a question the
	 * machine can already answer. The field stays visible and editable, because
	 * a wrong guess is worse than no guess.
	 */
	let timezone = $state(
		typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'
	);
</script>

<div class="mx-auto w-full max-w-2xl space-y-6 px-4 py-10">
	<div>
		<h1 class="text-lg font-bold text-gray-900">Welcome to ontoplano</h1>
		<p class="mt-1 text-sm text-gray-500">
			Two questions and a week to start from. All of it is editable later.
		</p>
	</div>

	{#if form?.message}
		<Banner kind="error" message={form.message} />
	{/if}

	<form method="post" use:enhance class="space-y-6">
		<section class="border border-gray-200 bg-white p-6 shadow-card">
			<FormGrid>
				<Field label="Your timezone" span={6} hint="Used for what counts as today.">
					<input autocomplete="off" name="timezone" bind:value={timezone} required class="input" />
				</Field>
				<Field label="Your week starts on" span={6}>
					<select name="firstDay" class="select">
						{#each DAYS as day, i (day)}
							<option value={i} selected={data.week.firstDay === i}>{day}</option>
						{/each}
					</select>
				</Field>
			</FormGrid>
		</section>

		<section class="border border-gray-200 bg-white p-6 shadow-card">
			<h2 class="text-sm font-semibold text-gray-900">Start from</h2>
			<p class="mt-1 text-sm text-gray-500">
				A week you can drag around beats an empty grid. Nothing here is permanent.
			</p>

			<div class="mt-4 grid gap-3 sm:grid-cols-3">
				{#each data.templates as t (t.key)}
					<label
						class="lift cursor-pointer border p-4 {template === t.key
							? 'border-gray-900 bg-gray-50 shadow-raised'
							: 'border-gray-200 bg-white hover:bg-gray-50'}"
					>
						<input
							type="radio"
							name="template"
							value={t.key}
							checked={template === t.key}
							onchange={() => (template = t.key)}
							class="sr-only"
						/>
						<span class="block text-sm font-semibold text-gray-900">{t.label}</span>
						<span class="mt-1 block text-xs text-gray-500">{t.description}</span>
						<span class="tabular mt-2 block text-xs text-gray-500">
							{t.blocks === 0 ? 'No blocks' : `${t.blocks} blocks`}
						</span>
					</label>
				{/each}
			</div>
		</section>

		<!--
			A way past it. Everything on this page is a default that can be changed
			later, so somebody who does not want to answer two questions on their
			first minute should not have to.
		-->
		<div class="flex flex-wrap items-center justify-end gap-3">
			<button type="submit" name="skip" value="1" class="btn">
				Skip — I'll set this up later
			</button>
			<button class="btn btn-primary">Start planning</button>
		</div>
	</form>
</div>
