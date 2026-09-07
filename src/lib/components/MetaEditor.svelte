<script lang="ts">
	/**
	 * Key/value editor for slot metadata.
	 *
	 * Emits parallel `metaKey` / `metaValue` fields, plus a hidden `metaPresent`
	 * marker so the server can tell "the form submitted no pairs" (clear it)
	 * apart from "this request never carried metadata" (leave it alone — drag
	 * and resize post to the same action).
	 *
	 * Ontoplano stores these without interpreting them; plugins read them from
	 * the schedule API. The suggestions are only suggestions — any valid key is
	 * accepted — but a key a plugin has declared says so, because a bare list of
	 * names like `hard_alarm` gives no clue what sets it off or what reads it.
	 */
	import { mergeSuggestions, type MetaKeySuggestion } from '$lib/meta-keys';
	import OneLine from '$lib/components/OneLine.svelte';

	let {
		initial = {},
		plugins = []
	}: {
		initial?: Record<string, string>;
		/** Manifests, so a declared key can name the plugin that reads it. */
		plugins?: { name: string; metaKeys: { key: string; description: string; example: string }[] }[];
	} = $props();

	const suggestions: MetaKeySuggestion[] = $derived(mergeSuggestions(plugins));

	type Pair = { key: string; value: string };

	// Re-seed whenever the form switches to a different slot. Seeding `$state`
	// straight from a prop would capture only the first value, so editing a
	// second slot would show the first one's options.
	let pairs = $state<Pair[]>([]);
	let expanded = $state(false);
	let seededFrom = $state<string | null>(null);

	$effect(() => {
		const signature = JSON.stringify(initial ?? {});
		if (signature === seededFrom) return;
		seededFrom = signature;
		pairs = Object.entries(initial ?? {}).map(([key, value]) => ({ key, value }));
		expanded = pairs.length > 0;
	});

	function addPair(key = '', value = '') {
		pairs = [...pairs, { key, value }];
		expanded = true;
	}

	function removePair(index: number) {
		pairs = pairs.filter((_, i) => i !== index);
	}

	const usedKeys = $derived(new Set(pairs.map((p) => p.key)));
</script>

<div class="border border-gray-200 bg-gray-50 p-3">
	<input type="hidden" name="metaPresent" value="1" />

	<div class="flex items-center justify-between">
		<button
			type="button"
			onclick={() => (expanded = !expanded)}
			class="text-sm font-medium text-gray-700 hover:text-gray-900"
		>
			{expanded ? '−' : '+'} Options
			{#if pairs.length > 0}
				<span class="text-gray-500">({pairs.length})</span>
			{/if}
		</button>
		{#if expanded}
			<span class="text-xs text-gray-500">Read by plugins — e.g. alarms</span>
		{/if}
	</div>

	{#if expanded}
		<div class="mt-3 space-y-2">
			{#each pairs as pair, i (i)}
				<div class="flex items-center gap-2">
					<input
						name="metaKey"
						type="text"
						bind:value={pair.key}
						list="meta-key-suggestions"
						placeholder="key"
						autocomplete="off"
						class="w-44 border border-gray-300 px-2 py-1.5 font-mono text-xs shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
					<OneLine
						name="metaValue"
						placeholder="value"
						bind:value={pair.value}
						class="flex-1 border border-gray-300 px-2 py-1.5 text-xs shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
					<button
						type="button"
						onclick={() => removePair(i)}
						aria-label="Remove option"
						class="border border-red-200 px-2 py-1.5 text-xs text-red-600 shadow-sm hover:bg-red-50"
					>
						×
					</button>
				</div>
			{/each}

			<datalist id="meta-key-suggestions">
				{#each suggestions as s (s.key)}
					<option value={s.key}
						>{s.usedBy ? `${s.description} — ${s.usedBy}` : s.description}</option
					>
				{/each}
			</datalist>

			<div class="flex flex-wrap items-center gap-2 pt-1">
				<button
					type="button"
					onclick={() => addPair()}
					class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm hover:bg-gray-50"
				>
					+ Add option
				</button>
				{#each suggestions as s (s.key)}
					{#if !usedKeys.has(s.key)}
						<button
							type="button"
							onclick={() => addPair(s.key, s.example)}
							title={s.usedBy ? `${s.description} (used by ${s.usedBy})` : s.description}
							class="flex items-center gap-1 border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 shadow-sm hover:bg-gray-50 hover:text-gray-900"
						>
							<span class="font-mono">{s.key}</span>
							{#if s.usedBy}
								<span class="text-[10px] text-gray-500">· {s.usedBy}</span>
							{/if}
						</button>
					{/if}
				{/each}
			</div>
		</div>
	{/if}
</div>
