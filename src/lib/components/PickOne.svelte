<script lang="ts">
	/**
	 * A picker you can type at.
	 *
	 * A `<select>` with forty activities in it is a list you scroll past, and
	 * the app's own rule is to prefer the platform's control — but no platform
	 * control does the thing being asked for here: show everything, and narrow
	 * it loosely as somebody types, so `lr` finds "learn russian". A
	 * `<datalist>` is the near miss: it substring-matches, and several browsers
	 * show nothing at all until a character has been typed, which is exactly
	 * the behaviour this is supposed to replace.
	 *
	 * So it is a combobox, built to behave like one: the whole list is there
	 * the moment it opens, arrows and Enter work, Escape closes it, and the
	 * value leaves in a hidden input so the form posts what it always posted.
	 *
	 * ## Where the list is drawn
	 *
	 * Absolutely, over the field, so the form underneath does not move — a list
	 * in flow would push everything below it down, which is the app shifting
	 * what somebody was about to press.
	 *
	 * Not `fixed`, which was the first attempt and drew nothing: `Modal.svelte`
	 * animates its panel with a `transform`, and a transformed ancestor becomes
	 * the containing block for fixed descendants — so viewport coordinates put
	 * the list somewhere outside the dialog, present in the DOM and invisible
	 * on the screen. Absolute is measured from the field itself and cannot go
	 * wrong that way.
	 *
	 * It opens upwards instead when there is more room above, so a field near
	 * the bottom of a dialog still shows its options.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import { fuzzyRank, markHits } from '$lib/fuzzy';
	import { useT } from '$lib/i18n';

	const t = useT();

	export type Option = { value: string; label: string };

	let {
		name,
		value = $bindable(''),
		options = [],
		required = false,
		placeholder = '',
		id,
		ariaLabel
	}: {
		name: string;
		value?: string;
		options?: Option[];
		required?: boolean;
		placeholder?: string;
		id?: string;
		ariaLabel?: string;
	} = $props();

	let open = $state(false);
	let query = $state('');
	let active = $state(0);
	let field = $state<HTMLInputElement>();
	let above = $state(false);

	const chosen = $derived(options.find((o) => o.value === value) ?? null);
	const shown = $derived(fuzzyRank(options, query, (o) => o.label));

	/** Room for about six rows; past that the list scrolls rather than the page. */
	const LIST_MAX_HEIGHT = 240;

	/** Downwards unless there is more room the other way. */
	function place() {
		if (!field) return;
		const box = field.getBoundingClientRect();
		const room = window.innerHeight - box.bottom;
		above = room < LIST_MAX_HEIGHT && box.top > room;
	}

	function show() {
		if (open) return;
		query = '';
		active = 0;
		open = true;
		place();
	}

	function hide() {
		open = false;
		query = '';
	}

	function choose(option: Option) {
		value = option.value;
		hide();
		field?.focus();
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (open) {
				event.preventDefault();
				event.stopPropagation();
				hide();
			}
			return;
		}
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (!open) return show();
			if (shown.length === 0) return;
			const step = event.key === 'ArrowDown' ? 1 : -1;
			active = (active + step + shown.length) % shown.length;
			return;
		}
		if (event.key === 'Enter') {
			// Only when the list is open: otherwise this is the form's Enter, and
			// swallowing it would make a picker the thing that stops you saving.
			if (!open) return;
			event.preventDefault();
			const pick = shown[active];
			if (pick) choose(pick.item);
			return;
		}
		if (event.key === 'Tab') hide();
	}

	/*
	 * Which way it opens is re-decided while it is open: the dialog behind it
	 * scrolls, and a field that started with room below can end up without it.
	 * Capture, because the scroller is an ancestor and scroll does not bubble.
	 */
	$effect(() => {
		if (!open) return;
		const again = () => place();
		window.addEventListener('scroll', again, true);
		window.addEventListener('resize', again);
		return () => {
			window.removeEventListener('scroll', again, true);
			window.removeEventListener('resize', again);
		};
	});

	/** What the closed field shows: what was chosen, or nothing yet. */
	const shownText = $derived(open ? query : (chosen?.label ?? ''));
	const listId = $derived(`${name}-list`);
</script>

<!-- What the form posts, unchanged: every route behind this still reads `name`. -->
<input type="hidden" {name} {value} {required} />

<div class="relative z-20">
	<input
		bind:this={field}
		{id}
		type="text"
		role="combobox"
		aria-expanded={open}
		aria-controls={listId}
		aria-autocomplete="list"
		aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
		aria-label={ariaLabel}
		autocomplete="off"
		class="input pr-8"
		{placeholder}
		value={shownText}
		oninput={(e) => {
			if (!open) show();
			query = e.currentTarget.value;
			active = 0;
		}}
		onfocus={show}
		onpointerdown={show}
		onblur={() => {
			// After the click on a row has had its chance to land.
			setTimeout(hide, 120);
		}}
		{onkeydown}
	/>
	<span
		class="pointer-events-none absolute inset-y-0 right-2 flex items-center text-gray-500"
		aria-hidden="true"
	>
		<Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} />
	</span>

	{#if open}
		<ul
			id={listId}
			role="listbox"
			class="absolute right-0 left-0 z-30 overflow-y-auto border border-gray-200 bg-white py-1 shadow-overlay"
			class:bottom-full={above}
			class:top-full={!above}
			style:max-height="{LIST_MAX_HEIGHT}px"
		>
			{#each shown as row, i (row.item.value)}
				<li>
					<button
						type="button"
						id="{listId}-{i}"
						role="option"
						aria-selected={row.item.value === value}
						class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm {i === active
							? 'bg-gray-100'
							: 'hover:bg-gray-50'}"
						onmouseenter={() => (active = i)}
						onmousedown={(e) => e.preventDefault()}
						onclick={() => choose(row.item)}
					>
						<span class="min-w-0 flex-1 truncate text-gray-900">
							<!-- The letters that matched are marked: a list that narrows and
							     does not say why reads as a list that has gone wrong. -->
							{#each markHits(row.item.label, row.hits) as part, p (p)}
								{#if part.hit}<strong class="font-semibold">{part.text}</strong
									>{:else}{part.text}{/if}
							{/each}
						</span>
						{#if row.item.value === value}
							<Icon name="check" size={14} class="shrink-0 text-gray-500" />
						{/if}
					</button>
				</li>
			{:else}
				<li class="px-3 py-2 text-sm text-gray-500">{t('pickOne.nothingMatches')}</li>
			{/each}
		</ul>
	{/if}
</div>
