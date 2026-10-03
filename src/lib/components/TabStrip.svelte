<script lang="ts" module>
	import type { IconName } from '$lib/components/Icon.svelte';

	/** One place in a strip: a link to a route, or a choice kept in the page. */
	export type StripTab = {
		/** Where it goes. Without it, the tab is a button that calls `onpick`. */
		href?: string;
		label: string;
		icon?: IconName;
		/** A number beside the word — "3", "2/5" — already formatted. */
		count?: string;
	};
</script>

<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { scrollHints } from '$lib/actions/scroll-hints';
	import { useT } from '$lib/i18n';
	import type { Snippet } from 'svelte';

	const t = useT();

	/**
	 * A row of tabs: a room's, or a second level inside one.
	 *
	 * The one drawing of it. A room's strip, Settings → Integrations under it,
	 * and a notebook's Notes / Goals / Ideas were three markups that had
	 * drifted — different paddings, different underlines, one of them cutting
	 * "Ideas 0/" off with nothing to say the row went on.
	 *
	 * The strip scrolls when it does not fit. The tab you are on is scrolled
	 * into view (`scrollHints` does that), the side that continues fades, and
	 * a chevron at that edge moves the row along a page — a hint that is also a
	 * control, rather than one that looks like a button and is not.
	 */
	let {
		tabs,
		current,
		onpick,
		label,
		dataTour,
		nested = false,
		trailing,
		dragType
	}: {
		tabs: StripTab[];
		/** The index of the tab you are on, or -1. */
		current: number;
		/** For tabs without an `href`: the one pressed. */
		onpick?: (index: number) => void;
		/** What the strip is called, for a screen reader. */
		label: string;
		/** What a guided tour calls this strip, where one points at it. */
		dataTour?: string;
		/**
		 * A strip inside a surface rather than on top of one: no track of its
		 * own, a rule under it, and its first tab on the content's left edge.
		 */
		nested?: boolean;
		/** What stands at the far end of the strip — a room's verb. */
		trailing?: Snippet;
		/**
		 * Lets a tab be picked up and dropped somewhere else, carrying its index
		 * under this type. Only for tabs without an `href`: a link already drags
		 * as a link.
		 */
		dragType?: string;
	} = $props();

	let strip = $state<HTMLElement>();

	/** Most of a strip's width, so a press moves on by about a screenful. */
	const PAGE_SHARE = 0.8;

	function turn(direction: 1 | -1) {
		if (!strip) return;
		const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		strip.scrollBy({
			left: direction * strip.clientWidth * PAGE_SHARE,
			behavior: still ? 'auto' : 'smooth'
		});
	}
</script>

<div class="room-tabs {nested ? 'room-tabs-nested' : ''}">
	<!--
		The track and the strip that scrolls inside it are two elements.

		The fade that says "there is more this way" is a mask, and a mask takes
		the background with it — so masking the track itself made its own surface
		dissolve at the end. The track keeps its surface; the row of tabs inside
		it is the thing that fades.
	-->
	<div class="seg seg-track min-w-0">
		<div class="tab-strip-view">
			<nav
				bind:this={strip}
				use:scrollHints
				class="seg-scroll scroll-hints"
				aria-label={label}
				data-tour={dataTour}
			>
				<!-- Resolved by whoever described the tabs: a stream's slug is a
				     route parameter, and the rule cannot see through it. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				{#each tabs as tab, index (tab.href ?? tab.label)}
					{#if tab.href}
						<a href={tab.href} aria-current={index === current ? 'page' : undefined}>
							{#if tab.icon}<Icon name={tab.icon} size={14} />{/if}
							{tab.label}
							{#if tab.count !== undefined}<span class="tab-count tabular">{tab.count}</span>{/if}
						</a>
					{:else}
						<button
							type="button"
							aria-current={index === current ? 'page' : undefined}
							onclick={() => onpick?.(index)}
							draggable={dragType ? 'true' : undefined}
							ondragstart={dragType
								? (event) => {
										event.dataTransfer?.setData(dragType, String(index));
										if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
									}
								: undefined}
						>
							{#if tab.icon}<Icon name={tab.icon} size={14} />{/if}
							{tab.label}
							{#if tab.count !== undefined}<span class="tab-count tabular">{tab.count}</span>{/if}
						</button>
					{/if}
				{/each}
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</nav>
			<!-- Over the faded edge only, so they never cover a readable tab. Out
			     of the tab order: the tabs themselves are reachable by keyboard. -->
			<button
				type="button"
				class="tab-strip-more tab-strip-more-left"
				tabindex="-1"
				onclick={() => turn(-1)}
				title={t('ui.more')}
				aria-hidden="true"
			>
				<Icon name="chevron-left" size={14} />
			</button>
			<button
				type="button"
				class="tab-strip-more tab-strip-more-right"
				tabindex="-1"
				onclick={() => turn(1)}
				title={t('ui.more')}
				aria-hidden="true"
			>
				<Icon name="chevron-right" size={14} />
			</button>
		</div>
		{@render trailing?.()}
	</div>
</div>
