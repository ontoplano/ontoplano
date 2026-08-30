<script lang="ts">
	import Field from '$lib/components/Field.svelte';
	import MoreOptions from '$lib/components/MoreOptions.svelte';

	/**
	 * What a shopping item is made of. See IdeaFields for why this is a
	 * component.
	 */
	let {
		label = $bindable(''),
		notes = $bindable(''),
		price = $bindable(''),
		type = $bindable('replenish'),
		shoppingCategoryId = $bindable<number | null | undefined>(undefined),
		categories = [],
		compact = false
	}: {
		label?: string;
		notes?: string;
		price?: string;
		type?: string;
		shoppingCategoryId?: number | null | undefined;
		categories?: { id: number; name: string }[];
		compact?: boolean;
	} = $props();

	const filled = $derived((notes ? 1 : 0) + (price ? 1 : 0) + (type !== 'replenish' ? 1 : 0));
</script>

<Field label="Item" span={compact ? 12 : 8} required>
	<input name="label" type="text" autocomplete="off" required bind:value={label} class="input" />
</Field>

{#snippet rest()}
	<Field label="List" span={compact ? 12 : 4}>
		<select name="type" required bind:value={type} class="select">
			<option value="replenish">Inventory</option>
			<option value="someday">Wishlist</option>
		</select>
	</Field>

	{#if type === 'replenish'}
		<Field label="Category" span={12}>
			<select name="shoppingCategoryId" bind:value={shoppingCategoryId} class="select">
				{#each categories as category (category.id)}
					<option value={category.id}>{category.name}</option>
				{/each}
			</select>
		</Field>
	{/if}

	<Field label="Notes" span={8}>
		<input name="notes" type="text" autocomplete="off" bind:value={notes} class="input" />
	</Field>

	<!-- What it costs, roughly. Prices move and shops disagree, which is why
	     the total says "about" and never claims a receipt. -->
	<Field label="Price" span={4} hint="What it usually costs.">
		<input
			name="price"
			type="text"
			inputmode="decimal"
			autocomplete="off"
			bind:value={price}
			placeholder="1.60"
			class="input tabular"
		/>
	</Field>
{/snippet}

{#if compact}
	<MoreOptions label="List, category, notes, price" count={filled}>{@render rest()}</MoreOptions>
{:else}
	{@render rest()}
{/if}
