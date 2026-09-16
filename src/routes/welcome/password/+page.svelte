<script lang="ts">
	import { enhance } from '$app/forms';
	import Banner from '$lib/components/Banner.svelte';
	import { MIN_PASSWORD_LENGTH, PASSWORD_RULE } from '$lib/passwords';
	import type { ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>{t('welcome.password.chooseAPasswordOntoplano')}</title>
</svelte:head>

<div class="solo-screen bg-gray-100">
	<div class="solo-card sm:max-w-md">
		<h1 class="mb-2 text-xl font-bold tracking-tight text-gray-900">
			{t('welcome.password.chooseYourPassword')}
		</h1>
		<p class="mb-6 text-sm text-gray-700">{t('welcome.password.yourAccountIsReady')}</p>

		{#if form?.message}
			<div class="mb-4"><Banner kind="error" message={form.message} /></div>
		{/if}

		<form method="post" use:enhance>
			<label class="mb-4 block">
				<span class="text-sm font-medium text-gray-700">{t('welcome.password.password')}</span>
				<input
					name="password"
					type="password"
					required
					minlength={MIN_PASSWORD_LENGTH}
					autocomplete="new-password"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
				<span class="mt-1 block text-xs text-gray-500">{PASSWORD_RULE}</span>
			</label>

			<label class="mb-6 block">
				<span class="text-sm font-medium text-gray-700"
					>{t('welcome.password.confirmPassword')}</span
				>
				<input
					name="confirm"
					type="password"
					required
					minlength={MIN_PASSWORD_LENGTH}
					autocomplete="new-password"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
			</label>

			<button class="btn btn-primary w-full">{t('welcome.password.continue')}</button>
		</form>
	</div>
</div>
