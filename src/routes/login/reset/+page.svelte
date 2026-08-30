<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { PageServerData, ActionData } from './$types';
	import Banner from '$lib/components/Banner.svelte';
	import { autofocus } from '$lib/actions/autofocus.js';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-100">
	<div class="w-full max-w-sm border border-gray-200 bg-white p-8 shadow-card">
		<h1 class="mb-6 text-xl font-bold tracking-tight text-gray-900">Choose a new password</h1>

		{#if form?.message}
			<div class="mb-4"><Banner kind="error" message={form.message} /></div>
		{/if}

		{#if data.invalid}
			<p class="text-sm text-gray-600">
				This link has no token in it. Reset links work once — request a fresh one from the
				<a href={resolve('/login')} class="underline">sign-in page</a>.
			</p>
		{:else}
			<form method="post" action="?/reset" use:enhance>
				<input type="hidden" name="token" value={data.token} />
				<label class="mb-3 block">
					<span class="eyebrow text-gray-600">New password</span>
					<input
						name="password"
						type="password"
						required
						minlength="8"
						autocomplete="new-password"
						use:autofocus
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
				<label class="mb-4 block">
					<span class="eyebrow text-gray-600">Confirm</span>
					<input
						name="confirm"
						type="password"
						required
						minlength="8"
						autocomplete="new-password"
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
				<button
					type="submit"
					class="w-full bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
				>
					Set password
				</button>
			</form>
		{/if}
	</div>
</div>
