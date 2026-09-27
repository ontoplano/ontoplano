<script lang="ts">
	/**
	 * A number somebody nudges: minus, the number, plus.
	 *
	 * Each press used to be a form post whose answer had to come back before
	 * the next press counted, so going from 2 to 12 was ten round trips and a
	 * wait on each. The screen answers the press now, from its own state, and
	 * the server is told once the pressing stops — one write of where the
	 * number ended up. Its answer replaces what is shown only when it
	 * disagrees, which is the case where the server is right.
	 *
	 * The number itself is a field: ten more is typing 12, not ten presses.
	 *
	 * The field sent is the absolute value, never a delta, so a write that
	 * repeats or lands late cannot count twice.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import { enhance } from '$lib/enhance';
	import { beforeNavigate } from '$app/navigation';
	import type { Snippet } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';

	/**
	 * How long the pressing has to stop before the number is sent. Short
	 * enough that leaving the screen right after rarely finds it unsent — and
	 * leaving sends it anyway — long enough that a run of presses is one write.
	 */
	const SYNC_AFTER_MS = 500;

	let {
		value,
		action,
		name,
		fields = {},
		min = 0,
		max,
		step = 1,
		whole = true,
		label,
		lessLabel,
		moreLabel,
		vertical = false,
		valueClass,
		suffix,
		class: extra = ''
	}: {
		/** What the server last said the number is. */
		value: number;
		/** The form action the number is sent to. */
		action: string;
		/** The field the number is sent as. */
		name: string;
		/** Anything else the action needs to know, sent as hidden fields. */
		fields?: Record<string, string | number>;
		min?: number;
		max?: number;
		/** What one press of minus or plus moves it by. */
		step?: number;
		/** Whether it only ever holds whole numbers. */
		whole?: boolean;
		/** What the field is, for a screen reader. */
		label: string;
		lessLabel: string;
		moreLabel: string;
		/** Plus over the number over minus, for a narrow rail down a row's edge. */
		vertical?: boolean;
		/** Classes for the number, given the number being shown. */
		valueClass?: (shown: number) => string;
		/** Drawn right after the number — "/4" beside a count of what is kept. */
		suffix?: Snippet;
		class?: string;
	} = $props();

	/** The number as pressed or typed, while the server has not agreed to it yet. */
	let pending = $state<number | null>(null);
	/** What is in the field while somebody is typing, which may not be a number yet. */
	let typing = $state<string | null>(null);

	const shown = $derived(pending ?? value);

	let form = $state<HTMLFormElement>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let inFlight = false;
	let sendAgain = false;

	function clamp(to: number): number {
		let next = whole ? Math.round(to) : to;
		if (next < min) next = min;
		if (max !== undefined && next > max) next = max;
		return next;
	}

	function set(to: number) {
		pending = clamp(to);
		clearTimeout(timer);
		timer = setTimeout(send, SYNC_AFTER_MS);
	}

	function send() {
		clearTimeout(timer);
		timer = undefined;
		if (pending === null) return;
		if (inFlight) {
			sendAgain = true;
			return;
		}
		if (pending === value) {
			pending = null;
			return;
		}
		form?.requestSubmit();
	}

	const sync: SubmitFunction = () => {
		inFlight = true;
		const sent = pending;
		return async ({ result, update }) => {
			await update({ reset: false });
			inFlight = false;
			if (result.type === 'failure' || result.type === 'error') {
				// Refused: what the server holds is the number, and it is shown.
				pending = null;
				sendAgain = false;
				return;
			}
			if (sendAgain) {
				sendAgain = false;
				send();
			} else if (timer === undefined && pending === sent) {
				pending = null;
			}
		};
	};

	// Leaving with a number still unsent sends it on the way out.
	beforeNavigate(send);

	function typed(raw: string) {
		typing = raw;
		const parsed = Number(raw.replace(',', '.'));
		if (raw.trim() !== '' && Number.isFinite(parsed)) set(parsed);
	}
</script>

<form
	bind:this={form}
	method="post"
	{action}
	use:enhance={sync}
	class="counter {vertical ? 'counter-vertical' : ''} {extra}"
>
	{#each Object.entries(fields) as [key, field] (key)}
		<input type="hidden" name={key} value={field} />
	{/each}
	<input type="hidden" {name} value={shown} />
	<button
		type="button"
		class="icon-btn counter-step"
		style:order={vertical ? 3 : 1}
		disabled={shown <= min}
		title={lessLabel}
		aria-label={lessLabel}
		onclick={() => set(shown - step)}
	>
		<Icon name="minus" size={14} />
	</button>
	<span class="counter-value" style:order={2}>
		<input
			type="text"
			inputmode={whole ? 'numeric' : 'decimal'}
			class="tabular {valueClass?.(shown) ?? ''}"
			style:width="calc({Math.max(String(typing ?? shown).length, 1)}ch + 0.5rem + 2px)"
			value={typing ?? shown}
			aria-label={label}
			oninput={(event) => typed(event.currentTarget.value)}
			onfocus={(event) => event.currentTarget.select()}
			onblur={() => {
				typing = null;
				send();
			}}
			onkeydown={(event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					send();
				} else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
					event.preventDefault();
					typing = null;
					set(shown + (event.key === 'ArrowUp' ? step : -step));
				}
			}}
		/>{@render suffix?.()}
	</span>
	<button
		type="button"
		class="icon-btn counter-step"
		style:order={vertical ? 1 : 3}
		disabled={max !== undefined && shown >= max}
		title={moreLabel}
		aria-label={moreLabel}
		onclick={() => set(shown + step)}
	>
		<Icon name="plus" size={14} />
	</button>
</form>

<style>
	.counter {
		display: inline-flex;
		align-items: center;
		gap: 0.125rem;
	}

	.counter-vertical {
		flex-direction: column;
		gap: 0;
	}

	.counter-vertical .counter-step {
		height: 1.25rem;
		width: 2.25rem;
	}

	.counter-step:disabled {
		opacity: 0.25;
	}

	.counter-value {
		display: inline-flex;
		align-items: baseline;
		justify-content: center;
		font-size: 0.875rem;
		white-space: nowrap;
	}

	/*
	 * A number that reads as text until it is touched: the field's border
	 * shows on hover and focus, so a row of counts is not a row of boxes.
	 */
	.counter-value input {
		min-width: calc(1ch + 0.5rem + 2px);
		padding: 0.125rem 0.25rem;
		text-align: center;
		background: transparent;
		border: 1px solid transparent;
		color: inherit;
		font: inherit;
	}

	/*
	 * Down a row's edge the buttons are the thumb's targets, and a field as
	 * tall as them would make every row a third taller on a phone.
	 */
	.counter.counter-vertical .counter-value input {
		min-height: 0;
	}

	.counter-value input:hover {
		border-color: var(--color-gray-300);
	}

	.counter-value input:focus {
		outline: none;
		border-color: var(--color-gray-900);
		background: var(--color-white);
	}
</style>
