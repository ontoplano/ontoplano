<script lang="ts">
	import Kbd from '$lib/components/Kbd.svelte';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import ReportDialog from '$lib/components/ReportDialog.svelte';
	import { GLOBAL_SHORTCUTS, PAGE_SHORTCUTS, getDisplayShortcuts } from '$lib/shortcuts';
	import { hasTutorial } from '$lib/tutorials';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * Where help lives: a button in the header, and the answers under it.
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
		/** Opens the tour for the screen being looked at. */
		onstart
	}: {
		onstart?: () => void;
	} = $props();

	let show = $state(false);
	/**
	 * Folded until it is asked for, on a phone and on a desktop alike.
	 *
	 * Four buttons in the corner is a bar across the bottom right of every
	 * screen, over whatever is under it — and a desktop used to get it open
	 * always, which is help nobody asked for taking up the same room whether
	 * it is wanted or not. Folded it is one square wearing the question mark,
	 * the glyph that already means "help is here", and pressing it opens the
	 * row. Pressing it again closes it, so it is the same control both ways
	 * rather than an expand with no collapse.
	 */
	let open = $state(false);
	/** Whether the form for telling the operator something is up. */
	let reporting = $state(false);

	let currentPath = $derived(page.url.pathname);
	let pageDisplay = $derived(getDisplayShortcuts(currentPath));
	let pageLabel = $derived(PAGE_SHORTCUTS[currentPath]?.label);
	const pageName = $derived(pageLabel ? t(pageLabel) : null);

	/**
	 * Whether this screen has a tour written for it yet.
	 *
	 * When it does not, the button says so rather than pretending: disabled, the
	 * question mark in the header drawn with a dashed edge, and the reason under
	 * the pointer. Shape rather than colour, so it reads for everybody. The alternative is a button that opens
	 * nothing, which reads as a broken app rather than as a gap in the writing —
	 * and this is the gap somebody has to notice before it can be filled.
	 */
	let toured = $derived(hasTutorial(currentPath));

	function handleKeydown(e: KeyboardEvent) {
		if (e.ctrlKey || e.metaKey || e.altKey) return;
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
	In the header, beside the other things the bar does.

	It was a square fixed to the bottom right of the screen, and it sat over the
	right edge of every room's surface — over row actions and values. Up here it
	covers nothing, and it is the header's own button size. What it opens drops
	down under it, over the page rather than inside the bar, so opening it
	moves nothing.
-->
<div class="relative flex items-center" data-tour="help-dock">
	<!--
		The fold. It carries the question mark because that is the glyph anybody
		looks for, and pressing it again closes the row — one control, both ways.
	-->
	<button
		onclick={() => (open = !open)}
		class="dock-toggle flex h-8 w-8 items-center justify-center border border-chrome-line bg-chrome-raised text-chrome-muted shadow-sm transition hover:text-chrome-ink hover:brightness-125 {toured
			? ''
			: 'dock-untoured'}"
		aria-expanded={open}
		title={open ? t('helpDock.hideHelp') : 'Help'}
		aria-label={open ? t('helpDock.hideHelp') : 'Help'}
		data-tour="tutorial"
	>
		<!-- A question mark folded, a close mark open. -->
		<Icon name={open ? 'close' : 'help'} size={16} />
	</button>

	<!--
		One group rather than separate buttons: they are answers to the same
		question and a row of loose squares reads as unrelated features.
	-->
	<div
		class="dock absolute top-full right-0 mt-2 flex border border-gray-300 bg-white shadow-overlay {open
			? ''
			: 'hidden'}"
	>
		<a
			href="https://docs.ontoplano.com"
			target="_blank"
			rel="noreferrer"
			class="dock-btn dock-more {open ? 'is-open' : ''}"
			title={t('helpDock.theDocumentation')}
			aria-label={t('helpDock.theDocumentation')}
		>
			<Icon name="book" size={16} />
		</a>

		<!--
			`aria-disabled` rather than `disabled`: a disabled button does not
			receive the pointer in every browser, and the tooltip is the entire
			point of drawing this one at all.
		-->
		<button
			onclick={() => {
				if (!toured) return;
				open = false;
				onstart?.();
			}}
			aria-disabled={!toured}
			class="dock-btn dock-more {open ? 'is-open' : ''} {toured ? '' : 'missing'}"
			title={toured ? t('helpDock.showMeAroundThisScreen') : t('helpDock.noTutorialForThisScreen')}
			aria-label={toured
				? t('helpDock.showMeAroundThisScreen')
				: t('helpDock.noTutorialForThisScreen')}
		>
			<Icon name="help" size={16} />
		</button>

		<button
			onclick={() => (show = !show)}
			class="dock-btn dock-more kbd-hint {open ? 'is-open' : ''}"
			title={t('helpDock.keyboardShortcuts2')}
			aria-label={t('helpDock.keyboardShortcuts')}
		>
			<Icon name="keyboard" size={16} />
		</button>

		<!-- Something here is wrong. Beside the answers, because it is what you
		     reach for when none of them helped. -->
		<button
			onclick={() => {
				open = false;
				reporting = true;
			}}
			class="dock-btn dock-more {open ? 'is-open' : ''}"
			title={t('helpDock.reportAProblemOrSuggest')}
			aria-label={t('helpDock.reportAProblemOrSuggest')}
		>
			<Icon name="bug" size={16} />
		</button>
	</div>

	{#if show}
		<div
			class="rise absolute top-full right-0 z-10 mt-2 w-72 border border-gray-200 bg-white p-4 shadow-overlay"
			style="border-radius: var(--radius-md, 0); margin-top: {open ? '3rem' : '0.5rem'}"
		>
			<div class="mb-3 flex items-center justify-between">
				<h3 class="text-sm font-bold text-gray-900">{t('helpDock.keyboardShortcuts')}</h3>
				<button onclick={() => (show = false)} class="text-xs text-gray-500 hover:text-gray-600">
					{t('helpDock.close')}
				</button>
			</div>

			{#if pageDisplay.length > 0}
				<div class="mb-3">
					<h4 class="mb-1 text-xs font-medium text-gray-500">{pageName}</h4>
					<div class="space-y-0.5">
						{#each pageDisplay as s (s.displayKey + s.description)}
							<div class="flex items-center justify-between text-xs">
								<Kbd keys={s.displayKey} />
								<span class="text-gray-600">{t(s.description)}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<div>
				<h4 class="mb-1 text-xs font-medium text-gray-500">{t('helpDock.global')}</h4>
				<div class="space-y-0.5">
					{#each GLOBAL_SHORTCUTS as s (s.key)}
						<div class="flex items-center justify-between text-xs">
							<Kbd keys={s.key === 'Escape' ? 'Esc' : s.key} />
							<span class="text-gray-600">{t(s.description)}</span>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>

<ReportDialog open={reporting} onclose={() => (reporting = false)} />

<style>
	.dock {
		border-radius: var(--radius, 0);
		overflow: hidden;
	}

	/* One divider between neighbours, drawn by the later buttons so a hidden
	   keyboard button cannot leave a rule with nothing after it. */
	.dock-btn + .dock-btn {
		border-left: 1px solid var(--color-gray-200);
	}

	/* The header's own control size, the same square as the menu beside it. */
	.dock-btn {
		display: flex;
		height: 2rem;
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
	 * Said by shape, not by colour: the question mark in the header takes a
	 * dashed edge, and the tour button inside is plainly unavailable, with the
	 * reason under the pointer. Red was the only cue before, and a red-green
	 * colourblind eye reads a small red glyph as any other.
	 */
	.dock-untoured {
		border-style: dashed;
	}

	.dock-btn.missing {
		cursor: not-allowed;
		opacity: 0.45;
	}

	.dock-btn.missing:hover {
		background: transparent;
		color: var(--color-gray-500);
	}
</style>
