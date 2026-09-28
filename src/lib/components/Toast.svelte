<script lang="ts" module>
	import type { IconName } from '$lib/components/Icon.svelte';

	export type ToastAction = { label: string; icon?: IconName; run: () => void };
</script>

<script lang="ts">
	/**
	 * One message the app says in passing, drawn the one way.
	 *
	 * There were three of these — a banner in one corner for success and
	 * errors, a receipt with an Edit button in the other, and an undo line
	 * beside it with a count — and each timed out, stacked and looked slightly
	 * differently. `Toasts` renders every kind through this.
	 *
	 * A toast that offers something to press holds the same window an undo
	 * does, and shows it running down: the count and a line draining under the
	 * face. One with nothing to press just leaves.
	 */
	import Banner from '$lib/components/Banner.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { useT } from '$lib/i18n';

	let {
		kind = 'success',
		message,
		now,
		until = null,
		window: total = 0,
		action,
		ondismiss
	}: {
		kind?: 'success' | 'error' | 'info';
		message: string;
		/** The clock the layer ticks, so every toast counts off the same second. */
		now: number;
		/** When it goes, or null for one that stays until closed. */
		until?: number | null;
		/** How long it was given, in milliseconds — what the line drains over. */
		window?: number;
		action?: ToastAction;
		/** A close button, for the ones that are not simply waited out. */
		ondismiss?: () => void;
	} = $props();

	const t = useT();

	const counting = $derived(!!action && until !== null);
	const left = $derived(until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000)));
</script>

<div class="toast">
	<Banner {kind}>
		<div class="row">
			<span class="text">{message}</span>
			{#if counting}
				<span class="tabular shrink-0 text-xs text-gray-600">{left}s</span>
			{/if}
			{#if action}
				<button type="button" class="act" onclick={action.run}>
					{#if action.icon}<Icon name={action.icon} size={14} />{/if}
					{action.label}
				</button>
			{/if}
			{#if ondismiss}
				<button type="button" class="close" onclick={ondismiss} aria-label={t('ui.dismiss')}>
					<Icon name="close" size={14} />
				</button>
			{/if}
		</div>
	</Banner>
	{#if counting && total > 0}
		<span class="clock" style="animation-duration: {total}ms" aria-hidden="true"></span>
	{/if}
</div>

<style>
	.toast {
		position: relative;
		pointer-events: auto;
		box-shadow: var(--shadow-overlay, 0 10px 30px rgb(0 0 0 / 0.18));
		animation: arrive 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	/* A banner on a phone page runs to the screen's edges; a toast floats, so
	   it keeps its own. */
	.toast :global(.banner.banner) {
		margin-inline: 0;
		border-inline-end-width: 1px;
		border-radius: var(--radius-sm, 0);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
	}

	.text {
		min-width: 0;
		flex: 1;
	}

	.act {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 0.25rem;
		font-weight: 500;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.close {
		flex: none;
		padding: 0.15rem;
		color: var(--color-gray-500);
		transition: color 120ms;
	}

	.close:hover {
		color: var(--color-gray-900);
	}

	/* The window running out, as a line along the bottom edge. */
	.clock {
		position: absolute;
		right: 0;
		bottom: 0;
		left: 0;
		height: 2px;
		background-color: var(--color-gray-500);
		transform-origin: left;
		animation-name: drain;
		animation-timing-function: linear;
		animation-fill-mode: forwards;
	}

	@keyframes drain {
		from {
			transform: scaleX(1);
		}
		to {
			transform: scaleX(0);
		}
	}

	@keyframes arrive {
		from {
			transform: translateY(0.75rem);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	/* The count still says how long is left; nothing moves. */
	@media (prefers-reduced-motion: reduce) {
		.toast {
			animation: none;
		}
		.clock {
			display: none;
		}
	}
</style>
