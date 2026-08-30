<script lang="ts">
	import Banner from '$lib/components/Banner.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { dismiss, notices } from '$lib/notify.svelte';

	/**
	 * The app's answers, stacked in the corner.
	 *
	 * Fixed rather than in the page, so it does not matter how far down somebody
	 * had scrolled when they pressed the button. Top left, sliding in from off
	 * the left edge: the motion says "this arrived" rather than "this was
	 * always here", which is the difference between a message being noticed and
	 * being missed.
	 *
	 * Below the header on a wide screen, because the header is fixed too and a
	 * message under it is a message nobody reads. On a phone there is no top
	 * bar, so it sits at the top of the screen.
	 *
	 * The look is `Banner`'s, unchanged — this is where a message appears, not
	 * a second design for what one looks like.
	 */
	let now = $state(Date.now());

	// Only ticking while something is waiting to expire. An interval that runs
	// on every page for the life of the tab is a battery cost for nothing.
	$effect(() => {
		if (!notices.items.some((n) => n.until !== null)) return;
		const tick = setInterval(() => {
			now = Date.now();
			for (const n of notices.items) if (n.until !== null && n.until <= now) dismiss(n.id);
		}, 250);
		return () => clearInterval(tick);
	});
</script>

{#if notices.items.length > 0}
	<div class="notices" aria-live="polite">
		{#each notices.items as notice (notice.id)}
			<div class="notice">
				<Banner kind={notice.kind}>
					<div class="row">
						<span class="text">{notice.message}</span>
						<button
							type="button"
							class="close"
							onclick={() => dismiss(notice.id)}
							aria-label="Dismiss"
						>
							<Icon name="close" size={14} />
						</button>
					</div>
				</Banner>
			</div>
		{/each}
	</div>
{/if}

<style>
	.notices {
		position: fixed;
		top: 0.75rem;
		left: 0.75rem;
		z-index: 60;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: min(26rem, calc(100vw - 1.5rem));
		pointer-events: none;
	}

	/* Clear of the header, which is fixed and would otherwise sit on top. */
	@media (width >= 64rem) {
		.notices {
			top: 4.75rem;
			left: 1.25rem;
		}
	}

	.notice {
		pointer-events: auto;
		box-shadow: var(--shadow-overlay, 0 10px 30px rgb(0 0 0 / 0.18));
		animation: arrive 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.row {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		width: 100%;
	}

	.text {
		min-width: 0;
		flex: 1;
	}

	.close {
		flex: none;
		margin: -0.15rem -0.35rem 0 0;
		padding: 0.15rem;
		color: var(--color-gray-500);
		transition: color 120ms;
	}

	.close:hover {
		color: var(--color-gray-900);
	}

	@keyframes arrive {
		from {
			transform: translateX(calc(-100% - 1.5rem));
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	/* Somebody who has asked for less motion still gets the message; it simply
	   appears where it is going to be. */
	@media (prefers-reduced-motion: reduce) {
		.notice {
			animation: none;
		}
	}
</style>
