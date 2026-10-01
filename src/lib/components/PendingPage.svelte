<script lang="ts">
	/**
	 * The screen somebody asked for, before its contents have arrived.
	 *
	 * A press on a tab or a room used to leave the old screen standing until
	 * the new one's data had loaded — a second, on a phone, of the app looking
	 * as though it had not heard. This is drawn over the old screen as soon as
	 * the navigation starts: the place's name where there is one, and the shape
	 * of a list, with the loading word for a screen reader.
	 *
	 * Drawn over rather than instead of, and only after a beat (the delay is in
	 * the CSS, `.pending-page`): a navigation quicker than the eye never shows
	 * it, and nothing under it is moved or hidden, so a navigation that is
	 * abandoned leaves the screen exactly as it was. The shell gives up on it
	 * with the progress bar, so it cannot outstay a navigation that never ends.
	 */
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { title = '', icon }: { title?: string; icon?: IconName } = $props();

	/** The shape of a list: one entry per row, each a little shorter than the last. */
	const ROWS = [70, 61, 52, 64, 46];
</script>

<div class="pending-page" role="status" aria-label={t('home.loading')}>
	{#if title}
		<div class="mb-4 flex items-center gap-2 text-gray-900">
			{#if icon}<Icon name={icon} size={20} />{/if}
			<span class="text-lg font-semibold">{title}</span>
		</div>
	{/if}
	<div class="border border-gray-200 bg-white shadow-card">
		{#each ROWS as width, i (i)}
			<div class="flex items-center gap-4 border-b border-gray-200 px-4 py-3 last:border-b-0">
				<span class="pending-bone size-7 shrink-0"></span>
				<span class="flex min-w-0 flex-1 flex-col gap-2">
					<span class="pending-bone h-3" style="width: {width}%"></span>
					<span class="pending-bone h-2 w-1/4"></span>
				</span>
			</div>
		{/each}
	</div>
	<p class="mt-3 text-sm text-gray-500">{t('home.loading')}</p>
</div>
