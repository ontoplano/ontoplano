<script lang="ts">
	import { untrack } from 'svelte';

	import { useT } from '$lib/i18n';
	import type { PlainKey } from '$lib/i18n/keys';
	import { groupsOf } from '$lib/scope-groups';

	/**
	 * Permissions, with a tick box beside each one.
	 *
	 * Two screens ask this question and they used to ask it differently: the
	 * key form in Integrations had the boxes, and the consent screen an
	 * assistant sends somebody to had a read-only list — so the one place a
	 * stranger's software is handed the account was the one place nobody could
	 * say no to a line of it. Same question, same control.
	 *
	 * What differs between them is a prop: the key form shows the scope name in
	 * monospace, because whoever is making a key by hand is reading a reference
	 * as they go. Nobody connecting an assistant needs to know the string
	 * `bills:write`.
	 */
	type Choice = { key: string; says: PlainKey | null; caution: PlainKey | null };

	let {
		scopes,
		checked = [],
		showKeys = false,
		name = 'scopes'
	}: {
		scopes: Choice[];
		/** Ticked to begin with. The rest start empty. */
		checked?: string[];
		/** Draw `bills:write` beside the sentence, for the key form. */
		showKeys?: boolean;
		/** The field name they post under. */
		name?: string;
	} = $props();

	const t = useT();

	/*
	 * Read once, deliberately: the list a form offers does not change while
	 * somebody is filling it in, and re-deriving this would throw away every
	 * tick they had made.
	 */
	let ticked = $state<Record<string, boolean>>(
		untrack(() => Object.fromEntries(scopes.map((one) => [one.key, checked.includes(one.key)])))
	);

	/**
	 * Tick exactly these and untick the rest.
	 *
	 * Set rather than add, so pressing a preset twice is the same as pressing
	 * it once and the button always leaves the form in the state its label
	 * claims. Exported because the presets belong to the page — "an AI
	 * assistant" means nothing on the consent screen, where an assistant is who
	 * is asking.
	 */
	export function tick(keys: string[]) {
		for (const one of scopes) ticked[one.key] = keys.includes(one.key);
	}

	/** What is ticked now, for a parent that needs to know before the post. */
	export function ticks(): string[] {
		return scopes.filter((one) => ticked[one.key]).map((one) => one.key);
	}

	const groups = $derived(groupsOf(scopes));

	/**
	 * A write grant whose reading half is not ticked.
	 *
	 * Most write tools take an id, and ids come from the read tool next to
	 * them: `habits:write` alone can tick a habit by name and nothing else, and
	 * `tasks:write` alone cannot find the todo it is meant to finish. The pair
	 * is not forced — a token that may add to the shopping list without reading
	 * the list is a real thing to want — but a grant that will not work is
	 * worth one sentence before it is made.
	 */
	const halfGranted = (key: string) =>
		key.endsWith(':write') && ticked[key] && !ticked[key.replace(':write', ':read')];
</script>

<div class="space-y-3">
	{#each groups as group (group.key)}
		{@const all = group.choices.every((one) => ticked[one.key])}
		{@const some = group.choices.some((one) => ticked[one.key])}
		<div>
			<!--
				The heading is the tick box for its whole area.

				Somebody who does not want an assistant anywhere near the money
				presses once, here, rather than finding four lines among thirty.
			-->
			<label class="eyebrow flex items-center gap-2 text-gray-600">
				<input
					type="checkbox"
					checked={all}
					indeterminate={some && !all}
					onchange={(event) => {
						const on = event.currentTarget.checked;
						for (const one of group.choices) ticked[one.key] = on;
					}}
				/>
				{t(group.says)}
			</label>
			<div class="mt-1 space-y-1 pl-6">
				{#each group.choices as one (one.key)}
					<label class="flex items-start gap-2 text-sm text-gray-700">
						<input
							type="checkbox"
							{name}
							value={one.key}
							class="mt-1"
							bind:checked={ticked[one.key]}
						/>
						<span>
							{#if showKeys}
								<code class="font-mono text-xs text-gray-900">{one.key}</code>
								<span class="text-gray-500">— {one.says ? t(one.says) : one.key}</span>
							{:else}
								{one.says ? t(one.says) : one.key}
							{/if}
							{#if halfGranted(one.key)}
								<span
									class="mt-1 mb-0.5 block border-l-2 border-blue-600 pl-2 text-xs font-medium text-blue-700"
								>
									{#if showKeys}
										{t('settings.integrations.connections.without')}
										<code class="font-mono">{one.key.replace(':write', ':read')}</code>
										{t('settings.integrations.connections.itCanWriteButNot')}
									{:else}
										{t('scopeGroups.withoutTheLineAbove')}
									{/if}
								</span>
							{/if}
							{#if one.caution && ticked[one.key]}
								<!-- Only once the tick is in: a warning about a grant nobody
								     is granting is noise. -->
								<span
									class="mt-1 mb-0.5 block border-l-2 border-amber-600 pl-2 text-xs font-medium text-amber-700"
								>
									{#if showKeys}<code class="font-mono">{one.key}</code> —
									{/if}{t(one.caution)}
								</span>
							{/if}
						</span>
					</label>
				{/each}
			</div>
		</div>
	{/each}
</div>
