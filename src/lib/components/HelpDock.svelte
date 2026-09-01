<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import { GLOBAL_SHORTCUTS, PAGE_SHORTCUTS, getDisplayShortcuts } from '$lib/shortcuts';
	import { hasTutorial } from '$lib/tutorials';

	/**
	 * Where help lives: one corner, three answers.
	 *
	 * There used to be a single `?` here and it opened a list of keys, which is
	 * the narrowest of the three things somebody means by "?". Now the keyboard
	 * wears a keyboard, the question mark is the guided tour of whatever is on
	 * screen, and the book leaves for the documentation.
	 *
	 * The keys are hidden where there is no keyboard to press them with; the
	 * other two are on every screen, because a tour is the thing a phone needs
	 * most and the docs are the thing that answers what the tour did not.
	 */
	let {
		/** The demo's strip sits on the phone's bottom bar; this clears it. */
		demo = false,
		/** Opens the tour for the screen being looked at. */
		onstart
	}: {
		demo?: boolean;
		onstart?: () => void;
	} = $props();

	let show = $state(false);

	let currentPath = $derived(page.url.pathname);
	let pageDisplay = $derived(getDisplayShortcuts(currentPath));
	let pageLabel = $derived(PAGE_SHORTCUTS[currentPath]?.label);

	/**
	 * Whether this screen has a tour written for it yet.
	 *
	 * When it does not, the button says so rather than pretending: red, disabled,
	 * and the reason under the pointer. The alternative is a button that opens
	 * nothing, which reads as a broken app rather than as a gap in the writing —
	 * and this is the gap somebody has to notice before it can be filled.
	 */
	let toured = $derived(hasTutorial(currentPath));

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		if (e.key === '?') {
			e.preventDefault();
			show = !show;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!--
	Clear of the phone's navigation bar, and of the demo's strip above it.

	The keys are `kbd-hint`, so a real phone never sees that one — but a narrow
	window on a laptop has a fine pointer *and* the bottom bar, and there the
	dock sat on top of the last item in it.
-->
<div
	class="fixed right-4 z-50 flex flex-col items-end lg:bottom-4"
	style="bottom: calc(var(--mobile-nav-height) + var(--safe-bottom) + {demo ? '2.5rem' : '1rem'})"
	data-tour="help-dock"
>
	{#if show}
		<div
			class="rise mb-2 w-72 border border-gray-200 bg-white p-4 shadow-overlay"
			style="border-radius: var(--radius-md, 0)"
		>
			<div class="mb-3 flex items-center justify-between">
				<h3 class="text-sm font-bold text-gray-900">Keyboard shortcuts</h3>
				<button onclick={() => (show = false)} class="text-xs text-gray-500 hover:text-gray-600">
					close
				</button>
			</div>

			{#if pageDisplay.length > 0}
				<div class="mb-3">
					<h4 class="mb-1 text-xs font-medium text-gray-500">{pageLabel}</h4>
					<div class="space-y-0.5">
						{#each pageDisplay as s (s.displayKey + s.description)}
							<div class="flex items-center justify-between text-xs">
								<kbd class="border border-gray-300 bg-gray-50 px-1 font-mono text-gray-700"
									>{s.displayKey}</kbd
								>
								<span class="text-gray-600">{s.description}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<div>
				<h4 class="mb-1 text-xs font-medium text-gray-500">Global</h4>
				<div class="space-y-0.5">
					{#each GLOBAL_SHORTCUTS as s (s.key)}
						<div class="flex items-center justify-between text-xs">
							<kbd class="border border-gray-300 bg-gray-50 px-1 font-mono text-gray-700"
								>{s.key === 'Escape' ? 'Esc' : s.key}</kbd
							>
							<span class="text-gray-600">{s.description}</span>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!--
		One group rather than three floating buttons: they are three answers to
		the same question and a row of separate circles reads as three unrelated
		features.
	-->
	<div class="dock flex border border-gray-300 bg-white shadow-sm">
		<a
			href="https://docs.ontoplano.com"
			target="_blank"
			rel="noreferrer"
			class="dock-btn"
			title="The documentation"
			aria-label="The documentation"
		>
			<Icon name="book" size={15} />
		</a>

		<!--
			`aria-disabled` rather than `disabled`: a disabled button does not
			receive the pointer in every browser, and the tooltip is the entire
			point of drawing this one at all.
		-->
		<button
			onclick={() => toured && onstart?.()}
			aria-disabled={!toured}
			class="dock-btn {toured ? '' : 'missing'}"
			title={toured ? 'Show me around this screen' : 'No tutorial for this screen yet'}
			aria-label={toured ? 'Show me around this screen' : 'No tutorial for this screen yet'}
			data-tour="tutorial"
		>
			<Icon name="help" size={15} />
		</button>

		<button
			onclick={() => (show = !show)}
			class="dock-btn kbd-hint"
			title="Keyboard shortcuts (?)"
			aria-label="Keyboard shortcuts"
		>
			<Icon name="keyboard" size={15} />
		</button>
	</div>
</div>

<style>
	.dock {
		border-radius: var(--radius, 0);
		overflow: hidden;
	}

	/* One divider between neighbours, drawn by the second and third buttons so
	   a hidden keyboard button cannot leave a rule with nothing after it. */
	.dock-btn + .dock-btn {
		border-left: 1px solid var(--color-gray-200);
	}

	.dock-btn {
		display: flex;
		height: 1.875rem;
		width: 2rem;
		align-items: center;
		justify-content: center;
		color: var(--color-gray-500);
		transition:
			background 120ms ease,
			color 120ms ease;
	}

	.dock-btn:hover {
		background: var(--hover-wash);
		color: var(--color-gray-900);
	}

	/*
	 * A screen nobody has written a tour for.
	 *
	 * Red, and it says why under the pointer — the colour is the thing that
	 * makes it noticeable and the words are the thing that makes it useful,
	 * because a colour on its own is not something everybody can read.
	 */
	.dock-btn.missing {
		color: var(--color-red-600);
		cursor: not-allowed;
	}

	.dock-btn.missing:hover {
		background: transparent;
		color: var(--color-red-600);
	}

	/*
	 * A thumb needs 44px, and the rule that gives it to every button in the app
	 * cannot reach the anchor in the middle of this row — which left the docs
	 * button half the height of its neighbours on a phone. Stated for all three.
	 */
	@media (pointer: coarse) {
		.dock-btn {
			height: 2.75rem;
			width: 2.75rem;
		}
	}
</style>
