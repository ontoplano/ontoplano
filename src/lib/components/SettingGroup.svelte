<script lang="ts">
	/**
	 * One subject on a settings screen: a heading band and the settings under it.
	 *
	 * Settings are forms rather than lists, and every screen had drawn its own:
	 * a card per sentence on Account, white boxes with a bold heading on
	 * Preferences, a grey fenced box with its own Save on the next. The screens
	 * sit inside one `RoomSurface` now, and each subject is one of these — the
	 * band a `Card` header wears, then `SettingRow`s with a rule between them.
	 * Two in a row meet at a rule, not at a gap of page.
	 *
	 * `actions` is the corner for a verb about the whole group — Save for a
	 * group whose fields are submitted together, "Sign out everywhere" over the
	 * list of sessions. A verb about one setting belongs on that setting's row.
	 */
	import type { Snippet } from 'svelte';

	let {
		title,
		description = '',
		id = '',
		dataTour = '',
		actions,
		children
	}: {
		title: string;
		description?: string;
		id?: string;
		dataTour?: string;
		actions?: Snippet;
		children: Snippet;
	} = $props();
</script>

<section class="setting-section" id={id || undefined} data-tour={dataTour || undefined}>
	<header
		class="section-tint card-header flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-gray-200"
	>
		<div class="min-w-0 flex-[1_1_12rem]">
			<h2 class="eyebrow flex min-h-4 items-center text-gray-600">{title}</h2>
			{#if description}
				<p class="mt-1.5 max-w-2xl text-sm whitespace-pre-line text-gray-500">{description}</p>
			{/if}
		</div>
		{#if actions}
			<div class="ml-auto flex flex-wrap items-center gap-2">{@render actions()}</div>
		{/if}
	</header>
	<div class="divide-y divide-gray-200">
		{@render children()}
	</div>
</section>

<style>
	/*
	 * Square, whatever the style: a band inside a surface is part of it, and a
	 * rounded one leaves a notch of the surface showing at each end. The
	 * playful style's blanket radius sits outside the layer, hence important.
	 */
	.setting-section,
	.setting-section > header {
		border-radius: 0 !important;
	}

	/* Two subjects in one surface meet at a rule. */
	:global(.setting-section + .setting-section),
	:global(.setting-section + form > .setting-section:first-child),
	:global(form + .setting-section),
	:global(form + form > .setting-section:first-child) {
		border-top: 1px solid var(--color-gray-200);
	}
</style>
