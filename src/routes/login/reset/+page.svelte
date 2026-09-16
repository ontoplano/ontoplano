<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { PageServerData, ActionData } from './$types';
	import Banner from '$lib/components/Banner.svelte';
	import { autofocus } from '$lib/actions/autofocus.js';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();
</script>

<div class="solo-screen bg-gray-100">
	<div class="solo-card sm:max-w-sm">
		<h1 class="mb-6 text-xl font-bold tracking-tight text-gray-900">
			{t('login.reset.chooseANewPassword')}
		</h1>

		{#if form?.message}
			<div class="mb-4"><Banner kind="error" message={form.message} /></div>
		{/if}

		{#if data.invalid}
			<p class="text-sm text-gray-600">
				{t('login.reset.thisLinkHasNoToken')}
				<a href={resolve('/login')} class="underline">{t('login.reset.signInPage')}</a>.
			</p>
		{:else}
			<form method="post" action="?/reset" use:enhance>
				<input type="hidden" name="token" value={data.token} />
				<label class="mb-3 block">
					<span class="eyebrow text-gray-600">{t('login.reset.newPassword')}</span>
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
					<span class="eyebrow text-gray-600">{t('login.reset.confirm')}</span>
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
					{t('login.reset.setPassword')}
				</button>
			</form>
		{/if}
	</div>
</div>
