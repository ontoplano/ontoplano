<script lang="ts">
	/**
	 * One ledger, as a tile you can read at a glance.
	 *
	 * A ledger is not a card with verbs on it the way a habit or a bill is —
	 * in Finance it is a switcher, and what you do to one you do from the page
	 * it switches to. So the shared thing is the tile: what it is called over
	 * what it holds, and the balance at the end of the line.
	 *
	 * Written inside the Finance room, which is why a ledger filed under a
	 * subject was a name and a number in a different arrangement. Pressing it
	 * either switches the room to it or goes there — `onpick` decides which,
	 * and a notebook is not a place somebody reads a statement.
	 */
	import { LEDGER_KIND_LABELS, type LedgerKind } from '$lib/services/ledgers';
	import { formatMoney, type Currency } from '$lib/money';
	import { useT } from '$lib/i18n';

	const t = useT();

	type Shown = {
		id: number;
		name: string;
		kind: string;
		count: number;
		balanceCents: number;
	};

	let {
		ledger,
		currency,
		/** Whether this is the one the page is showing. */
		current = false,
		/** Press to switch to it. Absent where the tile is a link instead. */
		onpick,
		/** Where it lives, for a screen that cannot show a statement. */
		href
	}: {
		ledger: Shown;
		currency: Currency;
		current?: boolean;
		onpick?: (id: number) => void;
		href?: string;
	} = $props();

	const shell = $derived(
		`flex min-w-36 shrink-0 flex-col items-start gap-0.5 rounded border px-3 py-2 text-left transition-colors ${
			current ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-400'
		}`
	);
</script>

{#snippet body()}
	<span class="w-full truncate text-sm font-medium text-gray-900">{ledger.name}</span>
	<span class="flex w-full items-baseline gap-2">
		<span class="text-xs text-gray-500">{t(LEDGER_KIND_LABELS[ledger.kind as LedgerKind])}</span>
		<span class="text-xs text-gray-500 tabular-nums">{ledger.count}</span>
		<span
			class="ml-auto text-xs tabular-nums {ledger.balanceCents < 0
				? 'text-red-600'
				: 'text-blue-700'}"
		>
			{formatMoney(ledger.balanceCents, currency)}
		</span>
	</span>
{/snippet}

{#if href}
	<!-- Already resolved by the caller, which is the one that knows the route. -->
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a {href} class={shell}>{@render body()}</a>
{:else}
	<button class={shell} onclick={() => onpick?.(ledger.id)}>{@render body()}</button>
{/if}
