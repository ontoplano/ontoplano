<script lang="ts">
	/**
	 * What a key may work on: the whole account, or one thing in it.
	 *
	 * Scopes say what a key may *do* — read your notes, write your tasks — and
	 * for the account as a whole. The thing people actually want to hand an
	 * assistant is narrower than any scope can put: work on this project with
	 * me. So this is the other half of the question, and it is asked in the same
	 * form and before the boxes, because the answer changes which boxes mean
	 * anything.
	 *
	 * Two controls, not a wizard: a choice of what it is tied to, and then which
	 * one. The second only appears once the first is answered, so the form is
	 * one line until somebody asks for more — and it is a plain `<select>`,
	 * which is the control the platform draws, knows how to search, and opens as
	 * a sheet on a phone without any of this having to know that.
	 *
	 * It posts two fields — `confinedKind` and `confinedId` — and nothing else.
	 * The kind is checked against the table in `mcp/confinement.ts` on the way
	 * in: a name that came off a form never becomes a reach.
	 */
	import Field from './Field.svelte';

	type Choice = {
		kind: string;
		noun: string;
		label: string;
		things: { id: number; label: string }[];
	};

	let {
		choices,
		/** The chosen kind, or '' for the whole account. Bindable so the form
		 *  around this can dim the permissions that stop meaning anything. */
		kind = $bindable(''),
		id = $bindable('')
	}: { choices: Choice[]; kind?: string; id?: string } = $props();

	const chosen = $derived(choices.find((c) => c.kind === kind) ?? null);

	// A kind with nothing to point at is not a choice, and a kind that has just
	// been unpicked must not leave last time's id posted behind it.
	$effect(() => {
		if (!chosen) id = '';
		else if (!chosen.things.some((t) => String(t.id) === id)) id = String(chosen.things[0].id);
	});
</script>

{#if choices.length}
	<div class="grid grid-cols-12 gap-3">
		<Field label="What it may work on" span={6}>
			<select name="confinedKind" bind:value={kind} class="input">
				<option value="">Everything in this account</option>
				{#each choices as choice (choice.kind)}
					<option value={choice.kind}>Just one {choice.noun}</option>
				{/each}
			</select>
		</Field>

		{#if chosen}
			<Field label="Which {chosen.noun}" span={6}>
				<select name="confinedId" bind:value={id} class="input">
					{#each chosen.things as thing (thing.id)}
						<option value={String(thing.id)}>{thing.label}</option>
					{/each}
				</select>
			</Field>

			<p class="col-span-12 -mt-1 mb-1 text-xs leading-relaxed text-gray-500">
				It reaches {chosen.label}.
			</p>
		{/if}
	</div>
{/if}
