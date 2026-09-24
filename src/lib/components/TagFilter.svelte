<script lang="ts">
	/**
	 * Narrowing a list by its labels: the ones to keep, the ones to drop, and
	 * whether the kept ones must all be there or any one will do.
	 *
	 * Folded, it is one button in the filter row that says what it is doing —
	 * `+2 −1 ∩` — because a filter somebody cannot see is one they forget is
	 * on. The button is a fixed width, so the count changing never moves the
	 * controls beside it. Opened, it is a panel in the top layer under the
	 * button, the way `Picker`'s list is, so nothing on the page moves either.
	 *
	 * Each list is a box of chips with the account's vocabulary offered as you
	 * type — the same fuzzy `TagInput` uses. "Untagged" is offered in both:
	 * kept, it means carrying no label; dropped, carrying at least one. What any
	 * of it means is `$lib/tag-filter`, which the service and the MCP listings
	 * read too.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import { afterPress } from '$lib/after-press';
	import { suggestTags } from '$lib/tag-typing';
	import {
		NO_TAG_FILTER,
		UNTAGGED,
		isTagFiltering,
		type TagFilter,
		type TagMode
	} from '$lib/tag-filter';
	import { matchScore } from '$lib/destinations';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		/** The words that can be picked: the labels on what is being filtered. */
		tags,
		value,
		onchange,
		/** Distinguishes this one's ids from another on the same page. */
		name = 'tag-filter',
		class: klass = ''
	}: {
		tags: readonly string[];
		value: TagFilter;
		onchange: (next: TagFilter) => void;
		name?: string;
		class?: string;
	} = $props();

	type Side = 'include' | 'exclude';
	const SIDES: readonly Side[] = ['include', 'exclude'];

	let open = $state(false);
	let root = $state<HTMLElement>();
	let face = $state<HTMLButtonElement>();
	let panel = $state<HTMLElement>();
	const boxes: Record<Side, HTMLInputElement | undefined> = $state({
		include: undefined,
		exclude: undefined
	});

	/** What is being typed into each side's box. */
	let drafts = $state<Record<Side, string>>({ include: '', exclude: '' });
	/** Which side's suggestions are showing, and which row the keyboard is on. */
	let typing = $state<Side | null>(null);
	let at = $state(0);
	/*
	 * Whether the list under the box is out. Not on focus alone: opening the
	 * panel focuses the Show box, and a list dropped over the Hide box before
	 * anybody asked for it covers the other half of the control. A press on
	 * the box, a letter or an arrow brings it.
	 */
	let listing = $state(false);

	const on = $derived(isTagFiltering(value));
	const untaggedWord = $derived(t('tagFilter.untagged'));

	/** How an entry is said: a label's name, or the word for carrying none. */
	const said = (entry: string) => (entry === UNTAGGED ? untaggedWord : `#${entry}`);

	/*
	 * What could go on a side next. Anything already on either side is left
	 * out: a label kept and dropped at once asks for nothing.
	 */
	function offered(side: Side): string[] {
		const taken = [...value.include, ...value.exclude];
		const draft = drafts[side];
		const words = suggestTags(tags, draft, taken);
		const wanted = draft.trim().replace(/^#+/, '').toLowerCase();
		const untagged =
			!taken.includes(UNTAGGED) && (wanted === '' || matchScore(untaggedWord, wanted) !== null);
		return untagged ? [UNTAGGED, ...words] : words;
	}

	const suggestions = $derived(typing && listing ? offered(typing) : []);

	function change(next: Partial<TagFilter>) {
		onchange({ ...value, ...next });
	}

	function add(side: Side, entry: string) {
		if (value[side].includes(entry)) return;
		const other: Side = side === 'include' ? 'exclude' : 'include';
		change({ [side]: [...value[side], entry], [other]: value[other].filter((e) => e !== entry) });
		drafts[side] = '';
		listing = false;
		at = 0;
	}

	function drop(side: Side, entry: string) {
		// See `$lib/after-press`: removing the chip under a press hands the
		// rest of the press to whatever moves into its place.
		afterPress(() => {
			change({ [side]: value[side].filter((e) => e !== entry) });
			boxes[side]?.focus();
		});
	}

	function setMode(mode: TagMode) {
		if (mode !== value.mode) change({ mode });
	}

	function onBoxKey(side: Side, event: KeyboardEvent) {
		const list = offered(side);
		// Arrows walk the list; Tab leaves the box, as it does from any field.
		const walk = event.key === 'ArrowDown' || event.key === 'ArrowUp';
		if (walk) {
			if (list.length === 0) return;
			event.preventDefault();
			if (!listing) {
				listing = true;
				at = 0;
				return;
			}
			const step = event.key === 'ArrowUp' ? -1 : 1;
			at = (at + step + list.length) % list.length;
		} else if (event.key === 'Enter') {
			event.preventDefault();
			if (list.length > 0 && (listing || drafts[side] !== ''))
				add(side, list[Math.min(at, list.length - 1)]);
		} else if (event.key === 'Escape' && (drafts[side] !== '' || listing)) {
			// A word half typed goes first, then the list under it; only then
			// does Escape reach the window and fold the panel. Stopped here so
			// the shell does not take it as "leave the field" in the meantime.
			event.preventDefault();
			event.stopPropagation();
			if (drafts[side] !== '') drafts[side] = '';
			else listing = false;
		} else if (event.key === 'Backspace' && drafts[side] === '' && value[side].length > 0) {
			event.preventDefault();
			change({ [side]: value[side].slice(0, -1) });
		}
	}

	/*
	 * The panel is drawn in the top layer and placed by arithmetic, the way
	 * `Picker` places its list — see there for why. Kept inside the screen on
	 * a phone, where the button can sit near the right edge.
	 */
	const GAP = 4;
	/** Long enough for a press on a suggestion to land before its list goes. */
	const BLUR_GRACE = 150;
	const EDGE = 8;
	let where = $state({ left: 0, top: 0 });

	function place() {
		const box = face?.getBoundingClientRect();
		if (!box) return;
		const width = panel?.offsetWidth ?? 0;
		const left = Math.max(EDGE, Math.min(box.left, window.innerWidth - width - EDGE));
		where = { left, top: box.bottom + GAP };
	}

	$effect(() => {
		if (!open || !panel) return;
		try {
			panel.showPopover?.();
		} catch {
			/* already open, or a browser without popovers: it still draws */
		}
		place();
		boxes.include?.focus();

		const follow = () => place();
		window.addEventListener('scroll', follow, true);
		window.addEventListener('resize', follow);
		return () => {
			window.removeEventListener('scroll', follow, true);
			window.removeEventListener('resize', follow);
			try {
				panel?.hidePopover?.();
			} catch {
				/* already closed */
			}
		};
	});

	function close(refocus = true) {
		open = false;
		typing = null;
		listing = false;
		if (refocus) face?.focus();
	}

	function elsewhere(event: MouseEvent) {
		if (open && root && !root.contains(event.target as Node)) close(false);
	}

	function onKey(event: KeyboardEvent) {
		if (open && event.key === 'Escape') {
			// Kept from the phone's filter sheet, which would close on it too.
			event.preventDefault();
			close();
		}
	}

	/** The whole filter in words, for the button's name and tooltip. */
	const sentence = $derived.by(() => {
		if (!on) return t('tagFilter.filterByTag');
		const parts: string[] = [];
		if (value.include.length > 0)
			parts.push(
				t(value.mode === 'all' ? 'tagFilter.withAll' : 'tagFilter.withAny', {
					tags: value.include.map(said).join(', ')
				})
			);
		if (value.exclude.length > 0)
			parts.push(t('tagFilter.without', { tags: value.exclude.map(said).join(', ') }));
		return parts.join('; ');
	});
</script>

<svelte:window onclick={elsewhere} onkeydown={onKey} />

<div bind:this={root} class="relative flex {klass}" data-tag-filter={name}>
	<!--
		One width whatever it says, so "+2 −1" arriving does not push the Clear
		button along. The numbers sit in slots wide enough for two digits.
	-->
	<button
		bind:this={face}
		type="button"
		class="btn btn-sm w-full min-w-0 justify-between sm:w-36"
		aria-expanded={open}
		aria-controls="{name}-panel"
		aria-label={sentence}
		title={sentence}
		onclick={() => (open ? close() : (open = true))}
	>
		<span class="flex min-w-0 items-center gap-1.5">
			<Icon name="tag" size={14} />
			{#if on}
				<span class="tabular inline-flex items-center gap-2" data-testid="tag-filter-counts">
					<span class="min-w-[2.5ch]">+{value.include.length}</span>
					<span class="min-w-[2.5ch]">−{value.exclude.length}</span>
				</span>
				<span class="w-3.5 shrink-0" aria-hidden="true">
					{#if value.include.length > 1}
						<Icon name={value.mode === 'all' ? 'intersect' : 'union'} size={14} />
					{/if}
				</span>
			{:else}
				<span class="truncate">{t('tagFilter.tags')}</span>
			{/if}
		</span>
		<Icon name="chevron-down" size={12} />
	</button>

	{#if open}
		<!--
			`overflow-visible` because a popover is a scroll container by default.

			The browser's own rules give `[popover]` `overflow: auto`, and the
			suggestion list under each box is positioned against the box rather
			than laid out in flow — so the panel clipped it at its own bottom
			edge and scrolled the rest out of reach. Four labels of a longer list
			showed and the Hide side went under them. No stacking order argues
			with that; the panel has to stop clipping.
		-->
		<div
			bind:this={panel}
			id="{name}-panel"
			popover="manual"
			role="group"
			aria-label={t('tagFilter.filterByTag')}
			style="left:{where.left}px; top:{where.top}px"
			class="overlay-face fixed m-0 w-[min(22rem,calc(100vw-1rem))] space-y-3 overflow-visible border p-3 shadow-overlay"
		>
			{#each SIDES as side (side)}
				<div class="space-y-1.5" data-side={side}>
					<div class="flex min-h-7 items-center justify-between gap-2">
						<span class="eyebrow shrink-0" id="{name}-{side}-label">
							{t(side === 'include' ? 'tagFilter.keep' : 'tagFilter.hide')}
						</span>
						{#if side === 'include'}
							<!-- Both states drawn at once, so pressing one moves nothing. -->
							<div
								class="inline-flex shrink-0"
								role="group"
								aria-label={t('tagFilter.howTheyCombine')}
							>
								{#each [{ mode: 'any' as const, icon: 'union' as const, word: t('tagFilter.any'), hint: t('tagFilter.anyHint') }, { mode: 'all' as const, icon: 'intersect' as const, word: t('tagFilter.all'), hint: t('tagFilter.allHint') }] as choice (choice.mode)}
									<button
										type="button"
										class="btn btn-sm gap-1"
										aria-pressed={value.mode === choice.mode}
										title={choice.hint}
										aria-label={choice.hint}
										onclick={() => setMode(choice.mode)}
									>
										<Icon name={choice.icon} size={14} />
										{choice.word}
									</button>
								{/each}
							</div>
						{/if}
					</div>

					<div class="relative">
						<div
							class="input flex min-h-9 flex-wrap items-center gap-1.5 py-1"
							role="presentation"
							onclick={() => boxes[side]?.focus()}
						>
							{#each value[side] as entry (entry)}
								{#if entry === UNTAGGED}
									<span class="chip inline-flex items-center gap-1 italic">
										{#if side === 'exclude'}<Icon name="minus" size={10} />{/if}
										{untaggedWord}
										<button
											type="button"
											class="opacity-60 transition hover:opacity-100"
											aria-label={t('tags.removeTag', { tag: untaggedWord })}
											title={t('tags.removeTag', { tag: untaggedWord })}
											onclick={() => drop(side, entry)}
										>
											<Icon name="close" size={12} />
										</button>
									</span>
								{:else}
									<TagChip name={entry} class={side === 'exclude' ? 'line-through' : ''}>
										<button
											type="button"
											class="no-underline opacity-60 transition hover:opacity-100"
											aria-label={t('tags.removeTag', { tag: said(entry) })}
											title={t('tags.removeTag', { tag: said(entry) })}
											onclick={() => drop(side, entry)}
										>
											<Icon name="close" size={12} />
										</button>
									</TagChip>
								{/if}
							{/each}
							<input
								bind:this={boxes[side]}
								bind:value={drafts[side]}
								type="text"
								class="min-w-24 flex-1 border-0 bg-transparent p-0 text-sm focus:ring-0 focus:outline-none"
								autocomplete="off"
								role="combobox"
								aria-labelledby="{name}-{side}-label"
								aria-expanded={typing === side && suggestions.length > 0}
								aria-controls="{name}-{side}-options"
								placeholder={t(side === 'include' ? 'tagFilter.addToKeep' : 'tagFilter.addToHide')}
								onfocus={() => {
									typing = side;
									listing = false;
									at = 0;
								}}
								onpointerdown={() => (listing = true)}
								onblur={() =>
									setTimeout(() => {
										if (typing === side && document.activeElement !== boxes[side]) typing = null;
									}, BLUR_GRACE)}
								oninput={() => {
									listing = true;
									at = 0;
								}}
								onkeydown={(event) => onBoxKey(side, event)}
							/>
						</div>

						{#if typing === side && suggestions.length > 0}
							<ul
								id="{name}-{side}-options"
								role="listbox"
								class="overlay-face absolute z-20 mt-1 max-h-48 w-full overflow-y-auto border shadow-overlay"
							>
								{#each suggestions as entry, i (entry)}
									<li role="presentation">
										<button
											type="button"
											role="option"
											tabindex="-1"
											aria-selected={i === at}
											class="block w-full px-3 py-1.5 text-left text-sm {i === at
												? 'overlay-face-on'
												: ''} {entry === UNTAGGED ? 'italic' : ''}"
											onmousedown={(event) => {
												event.preventDefault();
												add(side, entry);
											}}
											onmouseenter={() => (at = i)}
										>
											{entry === UNTAGGED ? untaggedWord : entry}
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</div>
			{/each}

			<div class="flex justify-end">
				<button
					type="button"
					class="btn btn-sm btn-quiet {on ? '' : 'invisible'}"
					inert={!on}
					onclick={() => onchange({ ...NO_TAG_FILTER })}
				>
					{t('tagFilter.clear')}
				</button>
			</div>
		</div>
	{/if}
</div>
