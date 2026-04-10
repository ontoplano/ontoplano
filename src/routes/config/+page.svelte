<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
</script>

<div class="space-y-4">
	<h1 class="text-lg font-bold text-gray-900">Configuration</h1>

	{#if form?.message}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{form.message}
		</div>
	{/if}

	{#if form?.success}
		<div class="border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
			Config saved. Some changes (host, port) require a restart.
		</div>
	{/if}

	<form
		method="post"
		action="?/save"
		use:enhance
		class="space-y-6 border border-gray-200 bg-white p-6 shadow-sm"
		style="border-left: 4px solid rgba(59, 130, 246, 0.5)"
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
</div>
