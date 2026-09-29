<script lang="ts">
	/**
	 * One album as a card: its cover, its name, how much is in it.
	 *
	 * Every card has the same two caption lines — the pictures, and the albums
	 * inside when there are any — so a wall of them lines up whatever each one
	 * holds. Its verbs sit on the caption, faint until the card is under the
	 * pointer, rather than over the picture.
	 */
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import { listCursor } from '$lib/actions/list-cursor';
	import type { Snippet } from 'svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		href,
		name,
		coverId = null,
		/** Drawn where there is no cover. */
		icon = 'image',
		/** The pictures it holds, its branch's included. */
		count,
		/** The albums directly inside it. */
		inside = 0,
		/** What the caption's first line says instead of the name. */
		title,
		/** Where j/k is standing. */
		cursor = false,
		actions
	}: {
		href: string;
		name: string;
		coverId?: number | null;
		icon?: IconName;
		count: number;
		inside?: number;
		title?: string;
		cursor?: boolean;
		actions?: Snippet;
	} = $props();

	const said = $derived(
		[
			t('gallery.picturesCount', { count }),
			inside > 0 ? t('gallery.albumsInside', { count: inside }) : ''
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<li data-row class="album-card" use:listCursor={cursor}>
	<!--
		The picture and the caption are two links to one place, so the verbs can
		sit beside the name in the caption's own row rather than over the
		picture. The picture's link is the pointer's; keyboards and screen
		readers meet the caption's once.
	-->
	<!-- Built by the caller with resolve(). -->
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a {href} class="album-cover" tabindex="-1" aria-hidden="true">
		{#if coverId}
			<img src="/media/{coverId}" alt="" loading="lazy" />
		{:else}
			<Icon name={icon} size={36} />
		{/if}
	</a>
	<div class="album-caption" class:has-actions={!!actions}>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a {href} class="block" title={name}>
			<span class="album-name block truncate text-sm font-medium text-gray-900"
				>{title ?? name}</span
			>
			<span class="album-count block truncate text-xs text-gray-500 tabular-nums">
				{said}
			</span>
		</a>
		{#if actions}
			<span class="row-actions album-actions">{@render actions()}</span>
		{/if}
	</div>
</li>

<style>
	.album-card {
		position: relative;
		overflow: hidden;
		border: 1px solid var(--color-gray-200);
		background-color: var(--color-white);
	}

	.album-cover {
		display: flex;
		aspect-ratio: 1;
		align-items: center;
		justify-content: center;
		background-color: var(--color-gray-50);
		color: var(--color-gray-300);
	}

	.album-cover img {
		height: 100%;
		width: 100%;
		object-fit: cover;
	}

	.album-caption {
		position: relative;
		padding: 0.5rem 0.75rem;
	}

	/*
	 * The verbs beside the name, centred on its line; the count line under
	 * them has the card's whole width. Where the verbs are finger-sized they
	 * reach the second line, so it stops short of them too.
	 */
	.album-actions {
		position: absolute;
		top: calc(0.5rem + 0.625rem - var(--row-action-size) / 2);
		right: 0.375rem;
		display: flex;
		gap: 0.125rem;
	}

	.has-actions .album-name {
		padding-right: calc(2 * var(--row-action-size));
	}

	@media (pointer: coarse) {
		.has-actions .album-count {
			padding-right: calc(2 * var(--row-action-size));
		}
	}
</style>
