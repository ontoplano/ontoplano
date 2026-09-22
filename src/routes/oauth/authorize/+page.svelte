<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { useT } from '$lib/i18n';
	import type { PageServerData } from './$types';

	const t = useT();

	let { data }: { data: PageServerData } = $props();
</script>

<div class="mx-auto w-full max-w-lg px-4 py-10">
	<Card title={t('oauth.somethingWantsToConnect')}>
		<!--
			Who is asking, in their own words and marked as theirs.

			The name arrived with the registration, so it is the client's claim
			about itself rather than anything this instance knows. It is quoted
			for that reason: an assistant calling itself "Ontoplano Support"
			should read as a name somebody typed, not as a heading we wrote.
		-->
		<p class="text-sm text-gray-600">
			{t('oauth.wantsToConnectTo', { client: data.ask.clientName })}
		</p>
		{#if data.ask.clientUri}
			<p class="mt-1 font-mono text-xs break-all text-gray-500">{data.ask.clientUri}</p>
		{/if}

		<h2 class="eyebrow mt-5 text-gray-600">{t('oauth.itWouldBeAbleTo')}</h2>
		<ul class="mt-2 space-y-1">
			{#each data.granted as one (one.scope)}
				<li class="flex items-start gap-2 text-sm text-gray-700">
					<span class="mt-0.5 text-gray-400"><Icon name="check" size={14} /></span>
					<span>{one.says}</span>
				</li>
			{/each}
		</ul>

		<!-- The action keeps the question it is answering; see the load. -->
		{@const query = data.search ? `&${data.search}` : ''}
		<form method="post" class="mt-5">
			<!--
				The one grant it is not given. Off, with the caution beside it, the
				same way the key form and the chat tab ask — a wrong write is data
				that is wrong and a wrong delete is data that is gone.
			-->
			<label
				class="flex items-start gap-2 border border-red-200 bg-red-50 px-3 py-2 text-sm text-gray-700"
			>
				<input type="checkbox" name="mayDelete" value="on" class="mt-0.5" />
				<span>
					<strong class="font-semibold text-red-600">{t('oauth.andLetItDeleteThings')}</strong>
					<span class="mt-0.5 block text-xs leading-relaxed text-gray-500">
						{t('oauth.whatItDeletesIsGone')}
					</span>
				</span>
			</label>

			<div class="mt-4 flex items-center gap-2">
				<button class="btn btn-primary" formaction="?/allow{query}">{t('oauth.connectIt')}</button>
				<button class="btn" formaction="?/deny{query}">{t('ui.cancel')}</button>
			</div>
		</form>

		<p class="mt-4 text-xs text-gray-500">{t('oauth.youCanTakeThisBack')}</p>
	</Card>
</div>
