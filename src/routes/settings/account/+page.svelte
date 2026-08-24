<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let confirming = $state(false);
</script>

<div class="space-y-4">
	{#if form?.message}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{form.message}</div>
	{/if}

	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<h2 class="text-sm font-semibold text-gray-900">Signed in as</h2>
		<p class="mt-1 text-sm text-gray-500">{data.name} &middot; {data.email}</p>
	</section>

	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<h2 class="text-sm font-semibold text-gray-900">Export your data</h2>
		<p class="mt-1 text-sm text-gray-500">
			Everything this account owns, as JSON: plans, tasks, diary, habits, goals, shopping, ideas and
			settings. The raw rows, so it is complete rather than pretty.
		</p>
		<a
			href={resolve('/settings/account/export')}
			download
			class="mt-4 inline-block border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
		>
			Download export
		</a>
	</section>

	<section class="border border-red-200 bg-white p-6 shadow-card">
		<h2 class="text-sm font-semibold text-gray-900">Delete your account</h2>
		<p class="mt-1 text-sm text-gray-500">
			This removes every row belonging to you and cannot be undone. Download an export first if you
			might want the data back.
		</p>

		{#if !confirming}
			<button
				onclick={() => (confirming = true)}
				class="mt-4 border border-red-200 bg-white px-4 py-2 text-sm text-red-600 hover:bg-red-50"
			>
				Delete account
			</button>
		{:else}
			<form method="post" action="?/delete" use:enhance class="mt-4 space-y-3">
				<label class="block max-w-sm">
					<span class="eyebrow text-gray-500">Type {data.email} to confirm</span>
					<input
						name="email"
						autocomplete="off"
						required
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
				<div class="flex gap-2">
					<button
						class="border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 hover:bg-red-100"
					>
						Delete permanently
					</button>
					<button
						type="button"
						onclick={() => (confirming = false)}
						class="border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
					>
						Cancel
					</button>
				</div>
			</form>
		{/if}
	</section>
</div>
