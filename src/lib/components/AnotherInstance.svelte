<script lang="ts">
	import { askAgainOnThisPhone, inPhoneApp } from '$lib/instance-choice';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * The way out of the wrong instance, on every signed-out screen.
	 *
	 * A signed-out screen is where somebody lands when the app sends them to an
	 * instance, and without this it is a dead end: the account they want is on
	 * a different ontoplano, or they chose a hosted one by mistake, and there is
	 * no address bar in an app to type another into. Only inside the app, where
	 * the copy on the phone is one navigation away; a browser already has a way
	 * to leave a page. Decided after mounting, because the server cannot see it.
	 */
	let { class: extra = '' }: { class?: string } = $props();

	let shown = $state(false);
	$effect(() => {
		shown = inPhoneApp();
	});
</script>

{#if shown}
	<p class="text-center text-sm {extra}">
		<!-- Another origin entirely — the copy of the app on the phone — which
		     is not a route this app can resolve. -->
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href={askAgainOnThisPhone()} class="font-medium text-gray-900 underline">
			{t('login.useADifferentOntoplano')}
		</a>
	</p>
{/if}
