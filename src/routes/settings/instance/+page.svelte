<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();
</script>

<div class="space-y-4">
	{#if form?.message}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{form.message}
		</div>
	{/if}

	{#if form?.success}
		<div class="border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
			Saved. Host and port take effect when the server restarts.
		</div>
	{/if}

	<form
		method="post"
		action="?/save"
		use:enhance
		class="space-y-4 border border-gray-200 bg-white p-6 shadow-card"
	>
		<div>
			<h2 class="text-sm font-semibold text-gray-900">Deployment</h2>
			<p class="mt-1 text-sm text-gray-500">
				Where the server listens. Applies to everyone on this instance, so only its owner can change
				it — and only on a self-hosted install.
			</p>
		</div>
		<div class="flex gap-4">
			<label class="flex-1">
				<span class="eyebrow text-gray-500">Host</span>
				<input
					name="host"
					type="text"
					value={data.config.server.host}
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
			</label>
			<label class="w-28">
				<span class="eyebrow text-gray-500">Port</span>
				<input
					name="port"
					type="number"
					min="1"
					max="65535"
					value={data.config.server.port}
					class="tabular mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
			</label>
		</div>
		<button class="bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
			>Save deployment</button
		>
	</form>

	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<h2 class="text-sm font-semibold text-gray-900">Database</h2>
		<p class="mt-1 text-sm text-gray-500">
			Where the SQLite file lives. Changing it from here would point a running server at a different
			database mid-flight, so it is set in <code>config.toml</code> and shown here only so you know which
			file you are looking at.
		</p>
		<p class="tabular mt-3 border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
			{data.config.database.path}
		</p>
	</section>
</div>
