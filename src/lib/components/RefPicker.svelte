<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';
	/**
	 * Find the task, note, goal or idea a reference should point at, by what it says.
	 *
	 * `TASK:#4` wants a number, and nobody remembers the number of the task
	 * about the plumber. Typing the prefix opens this over the writing: type
	 * any part of the title, press Enter, and the number goes in where the
	 * cursor was. Escape leaves the prefix as typed.
	 */
	import Modal from '$lib/components/Modal.svelte';
	import { matchScore } from '$lib/destinations';
	import { autofocus } from '$lib/actions/autofocus';
	import { useT } from '$lib/i18n';
	import type { RefKind } from '$lib/markdown';
	import type { PlainKey } from '$lib/i18n/keys';

	/** How many matches are listed; typing narrows the rest. */
	const SHOWN = 50;

	let {
		open = $bindable(false),
		kind,
		choices,
		onpick
	}: {
		open?: boolean;
		kind: RefKind;
		choices: { seq: number; title: string; done?: boolean }[];
		onpick: (seq: number) => void;
	} = $props();

	const t = useT();

	const TITLE: Record<RefKind, PlainKey> = {
		task: 'refPicker.pointAtATask',
		note: 'refPicker.pointAtANote',
		goal: 'refPicker.pointAtAGoal',
		idea: 'refPicker.pointAtAnIdea'
	};

	let looking = $state('');
	let at = $state(0);

	const found = $derived.by(() => {
		const wanted = looking.trim();
		const byNumber = /^\d+$/.test(wanted) ? Number(wanted) : null;
		return choices
			.map((one) => ({
				one,
				score: byNumber !== null && one.seq === byNumber ? Infinity : matchScore(one.title, wanted)
			}))
			.filter((row) => wanted === '' || row.score !== null)
			.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.one.seq - a.one.seq)
			.slice(0, SHOWN)
			.map((row) => row.one);
	});

	$effect(() => {
		if (open) {
			looking = '';
			at = 0;
		}
	});

	function pick(seq: number) {
		open = false;
		onpick(seq);
	}

	function keys(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			at = Math.max(0, Math.min(found.length - 1, at + step));
		} else if (event.key === 'Enter' && found[at]) {
			event.preventDefault();
			pick(found[at].seq);
		}
	}
</script>

<Modal bind:open title={t(TITLE[kind])} size="sm">
	<label class="block">
		<span class="sr-only">{t('refPicker.search')}</span>
		<input
			type="search"
			class="input w-full"
			bind:value={looking}
			oninput={() => (at = 0)}
			onkeydown={keys}
			placeholder={t('refPicker.search')}
			autocomplete="off"
			use:autofocus
		/>
	</label>
	{#if found.length === 0}
		<EmptyState compact filtered title={t('refPicker.nothingMatches')} />
	{:else}
		<ul class="mt-3 max-h-80 divide-y divide-gray-200 overflow-y-auto">
			{#each found as one, i (one.seq)}
				<li>
					<button
						type="button"
						class="flex w-full items-baseline gap-3 px-2 py-2 text-left text-sm hover:bg-gray-50 {i ===
						at
							? 'bg-gray-100'
							: ''} {one.done ? 'text-gray-500 line-through' : 'text-gray-900'}"
						onclick={() => pick(one.seq)}
						onmouseenter={() => (at = i)}
					>
						<span class="tabular w-10 shrink-0 text-xs text-gray-500">#{one.seq}</span>
						<span class="min-w-0 flex-1 truncate">{one.title}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</Modal>
