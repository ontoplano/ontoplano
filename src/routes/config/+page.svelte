<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
	const featureLabels: Record<string, string> = {
		'feature.threeWins': 'Three Wins',
		'feature.dashboardShopping': 'Dashboard: Shopping',
		'feature.dashboardHabits': 'Dashboard: Habits'
	};
</script>

<div class="space-y-4">
	<h1 class="text-lg font-bold text-gray-900">Configuration</h1>

	{#if form?.message}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{form.message}
		</div>
	{/if}

	{#if form?.success && form.action === 'save'}
		<div class="border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
			Config saved. Some changes (host, port) require a restart.
		</div>
	{:else if form?.success && form.action === 'toggleFeature'}
		<div class="border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
			Feature setting updated.
		</div>
	{/if}

	<form
		method="post"
		action="?/save"
		use:enhance
		class="space-y-6 border border-gray-200 bg-white p-6 shadow-sm"
	>
		<fieldset class="space-y-3">
			<legend class="text-sm font-semibold text-gray-900">Server</legend>
			<div class="flex gap-4">
				<label class="flex-1">
					<span class="text-sm font-medium text-gray-700">Host</span>
					<input
						name="host"
						type="text"
						value={data.config.server.host}
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
				<label class="w-28">
					<span class="text-sm font-medium text-gray-700">Port</span>
					<input
						name="port"
						type="number"
						min="1"
						max="65535"
						value={data.config.server.port}
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
			</div>
		</fieldset>

		<fieldset class="space-y-3">
			<legend class="text-sm font-semibold text-gray-900">Week</legend>
			<div class="flex gap-4">
				<label class="flex-1">
					<span class="text-sm font-medium text-gray-700">First day of week</span>
					<select
						name="firstDay"
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					>
						{#each dayNames as day, i (i)}
							<option value={i} selected={data.config.week.firstDay === i}>{day}</option>
						{/each}
					</select>
				</label>
				<label class="flex-1">
					<span class="text-sm font-medium text-gray-700">Generate tasks on</span>
					<select
						name="generateDay"
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					>
						{#each dayNames as day, i (i)}
							<option value={i} selected={data.config.week.generateDay === i}>{day}</option>
						{/each}
					</select>
				</label>
			</div>
		</fieldset>

		<button
			type="submit"
			class="bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
		>
			Save
		</button>
	</form>

	<section class="border border-gray-200 bg-white p-6 shadow-sm">
		<div class="mb-4">
			<h2 class="text-sm font-semibold text-gray-900">Features</h2>
			<p class="mt-1 text-sm text-gray-500">Enable or hide optional UI features for your account.</p>
		</div>

		<div class="divide-y divide-gray-200">
			{#each Object.entries(featureLabels) as [key, label] (key)}
				<form
					method="post"
					action="?/toggleFeature"
					use:enhance
					class="flex items-center justify-between gap-4 px-4 py-3"
				>
					<input type="hidden" name="key" value={key} />
					<h3 class="text-sm font-medium text-gray-900">{label}</h3>
					<button
						type="submit"
						class="border px-3 py-1.5 text-sm shadow-sm transition {data.features[key]
							? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
							: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
					>
						{data.features[key] ? 'On' : 'Off'}
					</button>
				</form>
			{/each}
		</div>
	</section>
</div>
