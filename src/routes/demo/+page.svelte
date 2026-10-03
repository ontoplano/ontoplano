<script lang="ts">
	import { enhance } from '$lib/enhance';
	import { resolve } from '$app/paths';
	import { DEMO_ACCOUNTS_PER_ADDRESS } from '$lib/demo-limits';
	import { onMount } from 'svelte';
	import type { ActionData, PageServerData } from './$types';
	import { useT } from '$lib/i18n';
	import PageTitle from '$lib/components/PageTitle.svelte';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	/*
	 * When the press is not answered by the app at all.
	 *
	 * Something in front of it — the proxy refusing a burst, the app
	 * restarting — answers with an HTML page instead, and left alone that
	 * became a 500 reading "JSON Parse error: Unrecognized token '<'". The
	 * account is still worth having, so the room waits and asks again, a few
	 * times, before handing the button back.
	 */
	const RETRY_AFTER_MS = 4000;
	const RETRIES = 5;

	let starter = $state<HTMLFormElement>();
	let started = $state(false);
	let retrying = $state(false);
	let tries = 0;

	onMount(() => {
		// Submitted from here rather than on the server so the screen is painted
		// first: the whole point is that the wait is looked at, not waited out.
		starter?.requestSubmit();
	});
</script>

<PageTitle parts={t('titles.openingTheDemo')} />

<div class="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-6 px-4">
	{#if form?.busy}
		<!--
			Your own limit, not the server's.

			Five copies an hour from one address is generous for somebody opening
			the demo, closing it and opening it again, and useless to a script.
			But it used to be reported as "the demo is full" — which blames the
			server for something waiting will not fix, and is the first thing
			anybody testing their own demo runs into.
		-->
		<div class="w-full border border-gray-200 bg-white p-6 text-center shadow-card">
			<p class="text-sm text-gray-900">{t('demo.thatIsALotOf')}</p>
			<p class="mt-2 text-sm text-gray-600">
				{t('demo.theDemoHandsOutAn', {
					demoAccountsPerAddress: DEMO_ACCOUNTS_PER_ADDRESS,
					minutes: form.minutes,
					minutes2: form.minutes === 1 ? 'minute' : 'minutes'
				})}
			</p>
			<a href={resolve('/demo')} class="btn btn-primary mt-4">{t('demo.tryAgain')}</a>
		</div>
	{:else if form?.full}
		<div class="w-full border border-gray-200 bg-white p-6 text-center shadow-card">
			<p class="text-sm text-gray-900">{t('demo.theDemoIsFullRight')}</p>
			<p class="mt-2 text-sm text-gray-600">
				{t('demo.everyCopyIsInUse')}
			</p>
			<a href={resolve('/demo')} class="btn btn-primary mt-4">{t('demo.tryAgain')}</a>
		</div>
	{:else}
		<div class="w-full border border-gray-200 bg-white p-6 shadow-card">
			<p class="text-sm font-semibold text-gray-900">{t('demo.settingUpACopyFor')}</p>
			<p class="mt-1 text-sm text-gray-600">
				{retrying ? t('demo.noAnswerTryingAgain') : t('demo.nobodyElseCanSeeIt')}
			</p>

			<div class="mt-4 h-1 w-full overflow-hidden bg-gray-200">
				<div class="demo-bar h-full bg-gray-900"></div>
			</div>
		</div>
	{/if}

	<!--
		A real form with a real action, so this works with JavaScript off: the
		script presses it, and without one there is a button to press.
	-->
	<form
		method="post"
		bind:this={starter}
		use:enhance={() => {
			started = true;
			return async ({ result, update }) => {
				if (result.type === 'error' && tries < RETRIES) {
					tries++;
					retrying = true;
					setTimeout(() => starter?.requestSubmit(), RETRY_AFTER_MS);
					return;
				}
				// Out of tries, the button comes back rather than an error page.
				if (result.type === 'error') {
					started = false;
					retrying = false;
					tries = 0;
					return;
				}
				retrying = false;
				await update({ reset: false });
			};
		}}
	>
		<input type="hidden" name="next" value={data.next} />
		<button class="btn btn-primary {started ? 'sr-only' : ''}">{t('demo.openTheDemo')}</button>
	</form>
</div>

<style>
	/*
	 * Indeterminate on purpose: the page cannot know how far along a seed is,
	 * and a bar that pretends to would be a lie somebody could time.
	 */
	.demo-bar {
		width: 40%;
		animation: demo-slide 1.4s ease-in-out infinite;
	}

	@keyframes demo-slide {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(250%);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.demo-bar {
			width: 100%;
			animation: none;
			opacity: 0.35;
		}
	}
</style>
