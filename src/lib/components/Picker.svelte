<script lang="ts" generics="T extends string">
	/**
	 * Choosing one of a few things, as a button that says which.
	 *
	 * A `<select>` in a toolbar looks like a form field that wandered in: it is
	 * as tall as an input, it carries the platform's own chrome, and beside the
	 * app's own buttons it reads as a different app. So the toolbars use this —
	 * the button says what the choice is now, pressing it shows the list, and a
	 * tick marks the one in force.
	 *
	 * Give it a `name` and it is a form field instead: the same list, drawn at
	 * a field's height and full width, posting through a hidden input. That is
	 * for the one part a `<select>` cannot be styled out of — the popup the
	 * platform draws, which on a dark screen arrives white with the operating
	 * system's own blue bar across it and belongs to no app at all.
	 *
	 * Not everything native goes: a date field stays a date field, because a
	 * calendar, a locale and a keyboard are a real control and a hand-built one
	 * is worse than a plain browser's. A list of strings is not that.
	 *
	 * `SortControl` is this plus a direction arrow.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import { afterPress } from '$lib/after-press';
	import { useT } from '$lib/i18n';
	import { untrack } from 'svelte';

	const t = useT();

	let {
		value,
		values,
		options,
		onpick,
		onpickMany,
		label,
		name,
		required = false,
		class: klass = ''
	}: {
		value?: T;
		/**
		 * Several at once, where narrowing by one is not enough.
		 *
		 * A filter that holds one label answers "show me the urgent ones" and
		 * not "show me the urgent ones and the ones about the house", which is
		 * the same question asked of a list long enough to need filtering at
		 * all. Given this, the control toggles rather than chooses: the list
		 * stays open, each row is a pill that is on or off, and `onpickMany`
		 * is handed the whole set.
		 */
		values?: readonly T[];
		/** What can be chosen, in the order they should be offered. */
		options: readonly { value: T; label: string }[];
		onpick?: (next: T) => void;
		onpickMany?: (next: T[]) => void;
		/** What this control is, for whoever is not looking at it. */
		label: string;
		/**
		 * The field this posts as, where it stands in a form.
		 *
		 * Absent, it is a filter: it narrows what is on screen, submits
		 * nothing, and is drawn to match the buttons beside it.
		 */
		name?: string;
		required?: boolean;
		class?: string;
	} = $props();

	/*
	 * A form field carries the choice itself; a filter is told it.
	 *
	 * `untrack` because these two read the prop to seed, once — the same shape
	 * `TagInput` and `MarkdownBox` use, and for the same reason: re-seeding on
	 * every render would undo what somebody has just chosen.
	 */
	let held = $state(untrack(() => value));
	let seededFrom = untrack(() => value);
	$effect(() => {
		const incoming = value;
		if (incoming === seededFrom) return;
		seededFrom = incoming;
		held = incoming;
	});

	const many = $derived(values !== undefined);
	const chosenMany = $derived(new Set<string>(values ?? []));
	const now = $derived(name ? held : value);
	const field = $derived(Boolean(name));

	let open = $state(false);
	let root = $state<HTMLElement>();
	let face = $state<HTMLButtonElement>();
	let list = $state<HTMLElement>();

	/*
	 * The menu is drawn in the top layer, not inside the card it belongs to.
	 *
	 * The playful style clips rounded surfaces so a filled bar flush against a
	 * card's edge does not poke past the curve — and a toolbar lives inside one
	 * of those cards, so a menu opening downwards out of it was cut off at the
	 * card's bottom edge with the rest of the list unreachable. No stacking
	 * order fixes that: `overflow: clip` is not something a z-index argues
	 * with.
	 *
	 * `popover` is the platform's own way out. The element leaves the
	 * document's stacking and paint order entirely, which also means it no
	 * longer sits under the button — so where it goes is arithmetic, done
	 * against the button's own box each time it opens.
	 */
	let where = $state({ left: 0, top: 0, width: 0 });

	function place() {
		const box = face?.getBoundingClientRect();
		if (!box) return;
		where = { left: box.left, top: box.bottom + 4, width: box.width };
	}

	$effect(() => {
		if (!open || !list) return;
		place();
		try {
			list.showPopover?.();
		} catch {
			/* already open, or a browser without popovers: it still draws */
		}

		/*
		 * A popover does not move with the page, because it is not on it. So
		 * the menu follows while it is open, and any scroll counts — a toolbar
		 * inside a panel that scrolls is the common case here, and only the
		 * capture phase hears those.
		 */
		const follow = () => place();
		window.addEventListener('scroll', follow, true);
		window.addEventListener('resize', follow);
		return () => {
			window.removeEventListener('scroll', follow, true);
			window.removeEventListener('resize', follow);
			try {
				list?.hidePopover?.();
			} catch {
				/* already closed */
			}
		};
	});

	/** Which row the keyboard is on while the list is open. */
	let at = $state(-1);

	const chosen = $derived(options.find((one) => one.value === now) ?? options[0]);

	/*
	 * What the button says when several can be on.
	 *
	 * The names, while they fit in a control this size; a count past that,
	 * because three labels spelled out is a button wider than the toolbar it
	 * sits in. The full list is one press away.
	 */
	const HOW_MANY_FIT = 2;
	const saidMany = $derived.by(() => {
		const on = options.filter((one) => chosenMany.has(one.value));
		if (on.length === 0) return options[0]?.label ?? '';
		if (on.length <= HOW_MANY_FIT) return on.map((one) => one.label).join(', ');
		return t('picker.nChosen', { count: on.length });
	});

	function toggle(next: T) {
		// A plain array: this is read once to build the answer and thrown away,
		// so there is nothing here for a reactive Set to be reactive about.
		const on = (values ?? []).filter((one) => one !== next);
		onpickMany?.(on.length === (values ?? []).length ? ([...on, next] as T[]) : (on as T[]));
	}

	/*
	 * One press, one choice.
	 *
	 * Closing the list while the press is still being delivered takes the
	 * element out from under the pointer, and the browser hands the same press
	 * to whatever has moved into its place — the button that opens the list,
	 * which opened it again. Same hazard the tag chips hit; `afterPress` says
	 * what it costs and why the obvious fixes do not work.
	 */
	function take(next: T) {
		held = next;
		onpick?.(next);
		afterPress(() => {
			open = false;
			at = -1;
			face?.focus();
		});
	}

	function show() {
		open = true;
		at = Math.max(
			0,
			options.findIndex((one) => one.value === now)
		);
	}

	/*
	 * The keys a `<select>` answers to, because this stands where one did.
	 *
	 * Up and down walk the list, Home and End reach its ends, Enter and Space
	 * take the row under the cursor, Escape leaves the choice alone. A letter
	 * jumps to the next option starting with it, which is how anybody who has
	 * used a dropdown expects to pick "craft" out of three.
	 */
	function onFaceKey(event: KeyboardEvent) {
		if (!open) {
			if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
				event.preventDefault();
				show();
			}
			return;
		}

		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			at = (at + step + options.length) % options.length;
			return;
		}
		if (event.key === 'Home' || event.key === 'End') {
			event.preventDefault();
			at = event.key === 'Home' ? 0 : options.length - 1;
			return;
		}
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			if (at >= 0) take(options[at].value);
			return;
		}
		if (event.key === 'Tab') {
			open = false;
			return;
		}
		if (event.key.length === 1) {
			const from = at + 1;
			const order = [...options.slice(from), ...options.slice(0, from)];
			const hit = order.find((one) => one.label.toLowerCase().startsWith(event.key.toLowerCase()));
			if (hit) at = options.indexOf(hit);
		}
	}

	/* The row the keyboard is on is kept in view, the way a native list does. */
	$effect(() => {
		if (!open || at < 0 || !list) return;
		list.querySelectorAll('[role="option"]')[at]?.scrollIntoView({ block: 'nearest' });
	});

	/*
	 * Pressing anywhere else closes it. A menu that only closes by choosing
	 * something makes choosing nothing impossible.
	 */
	function elsewhere(event: MouseEvent) {
		if (!open || !root) return;
		if (!root.contains(event.target as Node)) open = false;
	}

	function onKey(event: KeyboardEvent) {
		if (open && event.key === 'Escape') {
			event.preventDefault();
			open = false;
		}
	}
</script>

<svelte:window onclick={elsewhere} onkeydown={onKey} />

<!--
	No width of its own: a flex container is block-level, so as a field it
	already fills the cell `Field` gave it, and a caller that wants a narrow one
	— the goal form's ℤ / ℚ — can say so without fighting a `w-full` here.
-->
<div bind:this={root} data-picker={name} class="relative flex {klass}">
	<!-- What the form posts. The button is what anybody reads. -->
	{#if name}
		<input type="hidden" {name} value={now} {required} />
	{/if}
	<!--
		`flex-1` rather than `w-full` to fill the space the caller gave it: a
		full-width button inside a card is a *row*, and rows are drawn square —
		so `w-full` here left these two controls with square corners in a row of
		rounded ones. See the `w-full` rule in layout.css.
	-->
	<button
		bind:this={face}
		type="button"
		class="{field ? 'select-face' : 'btn btn-sm'} min-w-0 flex-1 justify-between"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label={label}
		onclick={() => (open ? (open = false) : show())}
		onkeydown={onFaceKey}
	>
		<span class="truncate">{many ? saidMany : (chosen?.label ?? '')}</span>
		<Icon name="chevron-down" size={12} />
	</button>

	{#if open}
		<!--
			`max-h` and its own scroll: a label list is as long as somebody's
			vocabulary, and a menu taller than the screen cannot be reached to
			the end of.
		-->
		<ul
			bind:this={list}
			popover="manual"
			style="left:{where.left}px; top:{where.top}px; min-width:{where.width}px"
			class="overlay-face fixed m-0 max-h-64 overflow-y-auto border p-0 shadow-overlay"
			role="listbox"
			aria-multiselectable={many ? true : undefined}
			aria-label={label}
		>
			{#each options as option (option.value)}
				<li role="presentation">
					<button
						type="button"
						tabindex="-1"
						role="option"
						data-value={option.value}
						aria-selected={many ? chosenMany.has(option.value) : option.value === now}
						class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm whitespace-nowrap {(
							many ? chosenMany.has(option.value) : option.value === now
						)
							? 'overlay-face-on'
							: options.indexOf(option) === at
								? 'overlay-face-on'
								: ''}"
						onclick={() => (many ? toggle(option.value) : take(option.value))}
						onmouseenter={() => (at = options.indexOf(option))}
					>
						<!-- The tick keeps its place, so the row does not shift when the
						     chosen one changes. -->
						<span class="w-3 shrink-0">
							{#if many ? chosenMany.has(option.value) : option.value === now}<Icon
									name="check"
									size={12}
								/>{/if}
						</span>
						{option.label}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
