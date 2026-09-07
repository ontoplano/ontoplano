<script lang="ts">
	import { enhance } from '$app/forms';
	import { armed } from '$lib/actions/armed';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	type Node = PageServerData['tree'][number];

	/** Which location is open. `null` is everything; `0` is the unfiled pile. */
	let selected = $state<number | null>(null);
	let addingLocation = $state(false);
	let editingLocation = $state<{ id: number; name: string; parentId: number | null } | null>(null);
	let confirmingDelete = $state<number | null>(null);
	let addingThing = $state(false);
	/** The thing whose own fields are being written. */
	let fielding = $state<{ id: number; name: string; fields: [string, string][] } | null>(null);
	let moving = $state<{ id: number; name: string; locationId: number | null } | null>(null);

	/** Every location as a flat list of "Living room › White chest" strings. */
	const paths = $derived.by(() => {
		// Plain Map and Set on purpose: these are built inside a derivation, read
		// once and thrown away. Nothing mutates them after the fact, which is
		// the whole of what the reactive versions are for.
		const byId = new Map(data.locations.map((l) => [l.id, l]));
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const out = new Map<number, string>();
		for (const location of data.locations) {
			const chain: string[] = [];
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const seen = new Set<number>();
			let cur: number | null = location.id;
			while (cur != null && !seen.has(cur)) {
				seen.add(cur);
				const node = byId.get(cur);
				if (!node) break;
				chain.unshift(node.name);
				cur = node.parentId;
			}
			out.set(location.id, chain.join(' › '));
		}
		return out;
	});

	/** A location and everything under it, so opening a room shows its drawers. */
	function subtreeOf(id: number): Set<number> {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const kids = new Map<number, number[]>();
		for (const l of data.locations) {
			if (l.parentId == null) continue;
			kids.set(l.parentId, [...(kids.get(l.parentId) ?? []), l.id]);
		}
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const out = new Set<number>();
		const walk = (at: number) => {
			if (out.has(at)) return;
			out.add(at);
			for (const kid of kids.get(at) ?? []) walk(kid);
		};
		walk(id);
		return out;
	}

	/*
	 * What is on the right.
	 *
	 * Only things you have: the to-buy half is the other tab, and a list that
	 * mixed "in the drawer" with "get some" would be neither. `bought` is what
	 * "I have it" is stored as.
	 */
	const owned = $derived(data.items.filter((i) => i.bought && !i.snoozed));
	const shown = $derived.by(() => {
		if (selected === null) return owned;
		if (selected === 0) return owned.filter((i) => i.locationId == null);
		const under = subtreeOf(selected);
		return owned.filter((i) => i.locationId != null && under.has(i.locationId));
	});
	const unfiled = $derived(owned.filter((i) => i.locationId == null).length);

	function fieldsOf(raw: string): [string, string][] {
		try {
			return Object.entries(JSON.parse(raw || '{}') as Record<string, string>);
		} catch {
			return [];
		}
	}

	function openFields(item: { id: number; name: string; attributes: string }) {
		fielding = { id: item.id, name: item.name, fields: [...fieldsOf(item.attributes), ['', '']] };
	}
</script>

<FormError message={form?.message} />

<div class="grid gap-4 lg:grid-cols-[minmax(14rem,20rem)_1fr]">
	<!-- The tree. A house, as deep as it goes. -->
	<section class="border border-gray-200 bg-white shadow-card">
		<header
			class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3"
		>
			<h2 class="eyebrow text-gray-600">Where things live</h2>
			<button onclick={() => (addingLocation = true)} class="btn btn-primary btn-sm">
				<Icon name="plus" /> New location
			</button>
		</header>

		{#if data.tree.length === 0}
			<p class="px-4 py-3 text-sm text-gray-500">
				Nowhere yet. A location is a room, a cupboard, a drawer — and one can sit inside another.
			</p>
		{:else}
			<ul class="divide-y divide-gray-200">
				<li>
					<button
						onclick={() => (selected = null)}
						class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm {selected === null
							? 'bg-gray-100 font-medium text-gray-900'
							: 'text-gray-700 hover:bg-gray-50'}"
					>
						Everything
						<span class="tabular ml-auto text-xs text-gray-500">{owned.length}</span>
					</button>
				</li>
				{#each data.tree as root (root.id)}
					{@render branch(root, 0)}
				{/each}
				{#if unfiled > 0}
					<li>
						<button
							onclick={() => (selected = 0)}
							class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm {selected === 0
								? 'bg-gray-100 font-medium text-gray-900'
								: 'text-gray-500 hover:bg-gray-50'}"
						>
							Not filed anywhere
							<span class="tabular ml-auto text-xs text-gray-500">{unfiled}</span>
						</button>
					</li>
				{/if}
			</ul>
		{/if}
	</section>

	<!-- What is in it. -->
	<section class="border border-gray-200 bg-white shadow-card">
		<header
			class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3"
		>
			<h2 class="eyebrow text-gray-600">
				{selected === null
					? 'Everything you have'
					: selected === 0
						? 'Not filed anywhere'
						: (paths.get(selected) ?? 'Here')}
			</h2>
			<button onclick={() => (addingThing = true)} class="btn btn-sm">
				<Icon name="plus" /> Add a thing
			</button>
		</header>

		{#if shown.length === 0}
			<EmptyState
				icon="shopping"
				title="Nothing here"
				description="Anything you tick as bought can be given an address — or add something you already own."
			>
				{#snippet action()}
					<button onclick={() => (addingThing = true)} class="btn btn-primary">
						<Icon name="plus" /> Add a thing
					</button>
				{/snippet}
			</EmptyState>
		{:else}
			<ul class="divide-y divide-gray-200">
				{#each shown as item (item.id)}
					{@const fields = fieldsOf(item.attributes)}
					<li class="list-row">
						<div class="list-row-main min-w-0">
							<span class="block text-sm text-gray-900">{item.name}</span>
							<span class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
								<span class="text-gray-500">
									{item.locationId == null
										? 'no address yet'
										: (paths.get(item.locationId) ?? 'somewhere')}
								</span>
								{#each fields as [key, value] (key)}
									<span class="chip">{key}: {value}</span>
								{/each}
							</span>
						</div>
						<div class="list-row-actions">
							<button
								onclick={() =>
									(moving = { id: item.id, name: item.name, locationId: item.locationId })}
								class="icon-btn"
								title="Say where it lives"
								aria-label="Say where {item.name} lives"><Icon name="shopping" /></button
							>
							<button
								onclick={() => openFields(item)}
								class="icon-btn"
								title="Its own fields"
								aria-label="Fields for {item.name}"><Icon name="edit" /></button
							>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<!--
	One branch of the tree, and its own.

	Indented rather than collapsible: a house is three or four deep, and a
	disclosure per drawer would be more clicking than reading.
-->
{#snippet branch(node: Node, depth: number)}
	<li>
		<div
			class="flex items-center gap-1 {selected === node.id ? 'bg-gray-100' : 'hover:bg-gray-50'}"
		>
			<button
				onclick={() => (selected = node.id)}
				class="flex min-w-0 flex-1 items-center gap-2 py-2 pr-2 text-left text-sm {selected ===
				node.id
					? 'font-medium text-gray-900'
					: 'text-gray-700'}"
				style="padding-left: {1 + depth * 0.9}rem"
			>
				<span class="truncate">{node.name}</span>
				<span class="tabular ml-auto shrink-0 text-xs text-gray-500">{node.itemCount}</span>
			</button>
			<div class="flex shrink-0 items-center gap-1 pr-2">
				<button
					onclick={() =>
						(editingLocation = { id: node.id, name: node.name, parentId: node.parentId })}
					class="icon-btn"
					title="Rename or move"
					aria-label="Rename or move {node.name}"><Icon name="edit" /></button
				>
				<button
					onclick={() => (confirmingDelete = node.id)}
					class="icon-btn icon-btn-danger"
					title="Remove"
					aria-label="Remove {node.name}"><Icon name="trash" /></button
				>
			</div>
		</div>
		{#if node.children.length > 0}
			<ul>
				{#each node.children as child (child.id)}
					{@render branch(child, depth + 1)}
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}

<!-- A location, new or being changed. -->
<Modal
	open={addingLocation || editingLocation !== null}
	onclose={() => {
		addingLocation = false;
		editingLocation = null;
	}}
	error={form?.message}
	title={editingLocation ? 'Rename or move' : 'New location'}
	description="A room, a cupboard, a drawer. One can sit inside another."
	size="sm"
>
	<form
		id="location-form"
		method="post"
		action={editingLocation ? '?/updateLocation' : '?/createLocation'}
		use:enhance={() =>
			async ({ update, result }) => {
				await update({ reset: false });
				if (result.type === 'success') {
					addingLocation = false;
					editingLocation = null;
				}
			}}
	>
		{#if editingLocation}
			<input type="hidden" name="id" value={editingLocation.id} />
		{/if}
		<FormGrid>
			<Field label="Name" span={12} required>
				<input
					name="heading"
					required
					autocomplete="off"
					value={editingLocation?.name ?? ''}
					placeholder="White chest"
					class="input"
				/>
			</Field>
			<Field label="Inside" span={12} hint="Leave empty for a room or a building.">
				<select name="parentId" class="select">
					<option value="">— nothing, it is top level —</option>
					{#each data.locations as location (location.id)}
						{#if location.id !== editingLocation?.id}
							<option value={location.id} selected={editingLocation?.parentId === location.id}>
								{paths.get(location.id)}
							</option>
						{/if}
					{/each}
				</select>
			</Field>
		</FormGrid>
	</form>

	{#snippet footer()}
		<button
			type="button"
			class="btn"
			onclick={() => {
				addingLocation = false;
				editingLocation = null;
			}}>Cancel</button
		>
		<button type="submit" form="location-form" class="btn btn-primary">
			{editingLocation ? 'Save' : 'Add'}
		</button>
	{/snippet}
</Modal>

<!--
	Removing one, in its own dialog.

	Nothing is destroyed: what was inside rises to where it was and the things
	keep existing without an address. The sentence says so, because a delete
	that reads as destructive gets avoided even when it is not.
-->
<Modal
	open={confirmingDelete !== null}
	onclose={() => (confirmingDelete = null)}
	title="Remove this location?"
	description="Whatever is inside it moves up a level, and the things filed here keep existing — they just lose their address."
	size="sm"
>
	<p class="text-sm text-gray-500">
		Nothing is thrown away. This only takes the shelf out of the tree.
	</p>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (confirmingDelete = null)}>Cancel</button>
		<form
			method="post"
			action="?/deleteLocation"
			use:enhance={() =>
				async ({ update }) => {
					await update({ reset: false });
					confirmingDelete = null;
				}}
		>
			<input type="hidden" name="id" value={confirmingDelete} />
			<button class="btn btn-danger" use:armed>Yes, remove it</button>
		</form>
	{/snippet}
</Modal>

<!-- Where a thing lives. -->
<Modal
	open={moving !== null}
	onclose={() => (moving = null)}
	error={form?.message}
	title="Where does it live?"
	description={moving?.name ?? ''}
	size="sm"
>
	{#if moving}
		<form
			id="put-form"
			method="post"
			action="?/putItem"
			use:enhance={() =>
				async ({ update, result }) => {
					await update({ reset: false });
					if (result.type === 'success') moving = null;
				}}
		>
			<input type="hidden" name="id" value={moving.id} />
			<FormGrid>
				<Field label="Location" span={12}>
					<select name="locationId" class="select">
						<option value="">— nowhere in particular —</option>
						{#each data.locations as location (location.id)}
							<option value={location.id} selected={moving.locationId === location.id}>
								{paths.get(location.id)}
							</option>
						{/each}
					</select>
				</Field>
			</FormGrid>
		</form>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (moving = null)}>Cancel</button>
		<button type="submit" form="put-form" class="btn btn-primary">Save</button>
	{/snippet}
</Modal>

<!--
	A thing's own fields.

	Not every thing shares a shape — a tape has a length, a cable has a plug —
	so these are this thing's, written as pairs rather than chosen from a
	scheme nobody would finish designing.
-->
<Modal
	open={fielding !== null}
	onclose={() => (fielding = null)}
	error={form?.message}
	title="Its own fields"
	description={fielding?.name ?? ''}
	size="sm"
>
	{#if fielding}
		<form
			id="fields-form"
			method="post"
			action="?/setFields"
			use:enhance={() =>
				async ({ update, result }) => {
					await update({ reset: false });
					if (result.type === 'success') fielding = null;
				}}
		>
			<input type="hidden" name="id" value={fielding.id} />
			<div class="space-y-2">
				{#each fielding.fields as pair, i (i)}
					<div class="flex items-center gap-2">
						<input
							name="fieldName"
							autocomplete="off"
							value={pair[0]}
							placeholder="length"
							class="input min-w-0 flex-1"
						/>
						<input
							name="fieldValue"
							autocomplete="off"
							value={pair[1]}
							placeholder="5m"
							class="input min-w-0 flex-1"
						/>
					</div>
				{/each}
			</div>
			<button
				type="button"
				onclick={() => fielding && (fielding.fields = [...fielding.fields, ['', '']])}
				class="btn btn-sm mt-2">+ Another</button
			>
			<p class="mt-2 text-xs text-gray-500">Clearing a name removes that field.</p>
		</form>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (fielding = null)}>Cancel</button>
		<button type="submit" form="fields-form" class="btn btn-primary">Save</button>
	{/snippet}
</Modal>

<!-- Something you already own that was never on a list. -->
<Modal
	bind:open={addingThing}
	error={form?.message}
	title="Add a thing"
	description="Something you already have. It goes straight into the inventory, not onto the shopping list."
	size="sm"
>
	<form
		id="thing-form"
		method="post"
		action="?/createThing"
		use:enhance={() =>
			async ({ update, result }) => {
				await update({ reset: result.type === 'success' });
				if (result.type === 'success') addingThing = false;
			}}
	>
		<FormGrid>
			<Field label="What it is" span={12} required>
				<input
					name="heading"
					required
					autocomplete="off"
					placeholder="Measuring tape"
					class="input"
				/>
			</Field>
			<Field label="Location" span={12}>
				<select name="locationId" class="select">
					<option value="">— nowhere in particular —</option>
					{#each data.locations as location (location.id)}
						<option
							value={location.id}
							selected={selected !== null && selected !== 0 && selected === location.id}
						>
							{paths.get(location.id)}
						</option>
					{/each}
				</select>
			</Field>
			<Field label="Notes" span={12}>
				<textarea name="notes" rows="2" class="textarea"></textarea>
			</Field>
		</FormGrid>
	</form>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (addingThing = false)}>Cancel</button>
		<button type="submit" form="thing-form" class="btn btn-primary">Add</button>
	{/snippet}
</Modal>
