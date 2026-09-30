<script lang="ts">
	import { pillStyle } from '$lib/pill-ink';
	import { DEFAULT_TAG_FILL } from '$lib/colors';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import { longPress } from '$lib/actions/long-press';
	import { useT } from '$lib/i18n';

	/**
	 * A label, wherever one is drawn.
	 *
	 * Every room draws the same word — a task's chips, a note's, an idea's,
	 * the filter strips above all three — and until this existed each of them
	 * drew it from its own markup, which is why a colour chosen on the Tags
	 * screen could show in one place and not the next. The colour comes from
	 * the account's vocabulary, which the shell already loads once per session
	 * (`tagColors` in the root layout), so a room has nothing to plumb and
	 * cannot be the one that forgot.
	 *
	 * A label with no colour is the plain `.chip` it has always been. One with
	 * a colour is a `.pill`, whose ink the browser computes from the fill —
	 * see `.pill` in `layout.css` for why the ink is never picked here.
	 */
	let {
		name,
		/** The colour, when the caller already has it. Otherwise the account's. */
		color = undefined,
		/** Pressed, for the filter strips that use a label as a switch. */
		active = false,
		onclick = undefined,
		title = undefined,
		/**
		 * Take this label off whatever wears it. Given, the pill carries a small
		 * × where there is a pointer, and a held finger does the same on a
		 * phone. Called with the pill, so what confirms it can open beside it.
		 */
		onremove = undefined,
		class: klass = '',
		children = undefined
	}: {
		name: string;
		color?: string | null;
		active?: boolean;
		onclick?: (event: MouseEvent) => void;
		title?: string;
		onremove?: (pill: HTMLElement) => void;
		class?: string;
		children?: import('svelte').Snippet;
	} = $props();

	const t = useT();

	/*
	 * Undefined means "ask the account"; null means "this label has no colour"
	 * — the difference the edit dialog's preview needs when somebody clears
	 * one and the account's copy still says otherwise.
	 */
	const ink = $derived(color === undefined ? (page.data.tagColors?.[name] ?? null) : color);

	/*
	 * Pressed is a ring rather than a tint.
	 *
	 * The filter strips each had their own pressed colour — amber in the
	 * diary, indigo in Ideas, fuchsia in the gallery — which a label with a
	 * colour of its own would have had to fight: a tinted background over a
	 * pill is the pale-tag-on-pale-background bug again. A ring sits outside
	 * the fill and reads the same over both.
	 */
	/*
	 * `tag-chip` is what says a label is one word.
	 *
	 * A pill that breaks across two lines is not a smaller pill, it is a
	 * shape with a word torn in half — and on a phone, where the row has no
	 * room to spare, every label was drawn that way. The rule lives in the
	 * stylesheet beside the chip's own; the strip that holds them is what
	 * wraps.
	 */
	const fill = $derived(ink ?? DEFAULT_TAG_FILL);
	const look = $derived(
		`pill tag-chip ${active ? 'ring-1 ring-gray-900 ring-offset-1' : ''} ${klass}`
	);
</script>

{#if onremove}
	<!--
		Two presses in one pill: the label's own, and the ×. Two buttons side by
		side inside it, since a button cannot hold another.
	-->
	<span
		class="{look} tag-chip-removable inline-flex items-center"
		style={pillStyle(fill)}
		use:longPress={onremove}
	>
		<button
			type="button"
			{onclick}
			{title}
			aria-pressed={onclick ? active : undefined}
			class="tag-chip-face"
			disabled={!onclick}
		>
			#{name}{#if children}{@render children()}{/if}
		</button>
		<button
			type="button"
			class="tag-chip-x"
			onclick={(event) => onremove((event.currentTarget as HTMLElement).parentElement!)}
			title={t('tagChip.untagName', { name })}
			aria-label={t('tagChip.untagName', { name })}
		>
			<Icon name="close" size={10} />
		</button>
	</span>
{:else if onclick}
	<button
		type="button"
		{onclick}
		{title}
		aria-pressed={active}
		class={look}
		style={pillStyle(fill)}
	>
		#{name}{#if children}{@render children()}{/if}
	</button>
{:else}
	<span {title} class="{look} inline-flex items-center gap-1" style={pillStyle(fill)}>
		#{name}{#if children}{@render children()}{/if}
	</span>
{/if}
