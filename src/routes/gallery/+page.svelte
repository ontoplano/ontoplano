<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import Modal from '$lib/components/Modal.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import { armed } from '$lib/actions/armed';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showNew = $state(false);
	/*
	 * Which branches are open.
	 *
	 * An import of `birds/Falconiformes/…` makes albums that belong to each
	 * other, and listing every one of them side by side loses exactly the
	 * arrangement somebody made in their own folders. Roots are on the
	 * screen; a chevron opens what is under them, the way inventory's
	 * locations work.
	 */
	const opened = new SvelteSet<number>();
	const toggle = (id: number) => {
		if (opened.has(id)) opened.delete(id);
		else opened.add(id);
	};
	/** The name as it reads under its parent: the last part of the path. */
	const leafName = (name: string) => name.split(' — ').at(-1) ?? name;
	let folderForm: HTMLFormElement | undefined = $state();
	let planForm: HTMLFormElement | undefined = $state();
	let importing = $state(false);
	/** The files the picker handed over, kept until the person says go. */
	let chosen: File[] = $state([]);
	const plan = $derived(form && 'plan' in form && form.success ? form.plan : null);

	const asKB = (bytes: number) => `${Math.ceil(bytes / 1024)}KB`;

	/**
	 * Choosing the folder is the submit.
	 *
	 * `webkitdirectory` is how a browser offers a whole tree, and it hands
	 * each file's path inside it — which is what lets the subfolders become
	 * albums rather than one flat pile. The attribute is set from script
	 * because Svelte will not write a non-standard boolean attribute, and the
	 * property is the part browsers actually read.
	 */
	function directory(node: HTMLInputElement) {
		node.webkitdirectory = true;
	}

	/*
	 * Choosing the folder asks what would happen; a second press does it.
	 *
	 * Only names and sizes are sent for the asking, so looking at a folder of
	 * two hundred photographs costs one small request rather than the whole
	 * folder going up twice.
	 */
	function folderChosen(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		if (!input.files?.length) return;
		chosen = [...input.files];
		const listing = planForm?.querySelector('input[name="files"]') as HTMLInputElement | null;
		if (!listing) return;
		listing.value = JSON.stringify(
			chosen.map((file) => ({ path: file.webkitRelativePath || file.name, bytes: file.size }))
		);
		planForm?.requestSubmit();
	}

	/** Go: the files themselves, and only the ones that would be taken. */
	function sendFolder() {
		const form = folderForm;
		if (!form || chosen.length === 0) return;
		importing = true;

		const data = new DataTransfer();
		form.querySelectorAll('input[name="path"]').forEach((el) => el.remove());
		const taking = new Set(plan?.files.filter((f) => f.ok).map((f) => f.path) ?? []);
		for (const file of chosen) {
			const path = file.webkitRelativePath || file.name;
			if (!taking.has(path)) continue;
			data.items.add(file);
			// The paths ride alongside the files, in the same order, because a
			// File loses `webkitRelativePath` on the way.
			const carrier = document.createElement('input');
			carrier.type = 'hidden';
			carrier.name = 'path';
			carrier.value = path;
			form.append(carrier);
		}
		const picker = form.querySelector('input[name="file"]') as HTMLInputElement | null;
		if (picker) picker.files = data.files;
		form.requestSubmit();
	}
	let renaming: (typeof data.albums)[number] | null = $state(null);
	let confirmingDelete: (typeof data.albums)[number] | null = $state(null);
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-bold text-gray-900">Gallery</h1>
		<span class="flex items-center gap-2">
			<!-- A folder of pictures, with its subfolders as albums. -->
			<!-- Ask first: what is in this folder, and what would be refused. -->
			<form method="post" action="?/planFolder" bind:this={planForm} use:enhance>
				<input type="hidden" name="files" />
				<label class="btn btn-sm cursor-pointer">
					<Icon name="download" /> Import a folder
					<input
						type="file"
						accept="image/png,image/jpeg,image/gif,image/webp"
						multiple
						use:directory
						class="hidden"
						onchange={folderChosen}
					/>
				</label>
			</form>

			<!-- And then, on the second press, the files themselves. -->
			<form
				method="post"
				action="?/importFolder"
				enctype="multipart/form-data"
				bind:this={folderForm}
				class="hidden"
				use:enhance={() =>
					({ update }) => {
						importing = false;
						chosen = [];
						return update({ reset: false });
					}}
			>
				<input type="file" name="file" multiple />
			</form>
			<button class="btn btn-primary btn-sm" onclick={() => (showNew = true)}>
				<Icon name="plus" /> New album
			</button>
		</span>
	</div>

	<!--
		What would happen, before it happens.

		The refused ones are named, with their size against the instance's
		ceiling — a number somebody can act on (compress it, or raise the
		limit in config.toml) rather than a count of files that vanished.
	-->
	{#if plan}
		<div class="rounded border border-gray-200">
			<div class="flex flex-wrap items-baseline gap-2 border-b border-gray-200 px-4 py-3">
				<span class="text-sm font-medium text-gray-900">
					{plan.willImport} picture{plan.willImport === 1 ? '' : 's'} into {plan.albums.length}
					album{plan.albums.length === 1 ? '' : 's'}
				</span>
				{#if plan.willRefuse > 0}
					<span class="text-sm text-red-700">
						{plan.willRefuse} refused
					</span>
				{/if}
				<span class="ml-auto flex items-center gap-2">
					<button class="btn btn-sm" type="button" onclick={() => (chosen = [])}>Cancel</button>
					<button
						class="btn btn-primary btn-sm"
						type="button"
						disabled={plan.willImport === 0 || importing}
						onclick={sendFolder}
					>
						{importing ? 'Importing…' : `Import ${plan.willImport}`}
					</button>
				</span>
			</div>

			<ul class="max-h-72 divide-y divide-gray-100 overflow-y-auto text-sm">
				{#each plan.files as file (file.path)}
					<li class="flex items-baseline gap-2 px-4 py-1.5">
						<span class="min-w-0 flex-1 truncate {file.ok ? 'text-gray-900' : 'text-gray-500'}">
							{file.path}
						</span>
						<span class="shrink-0 text-xs text-gray-500">{file.album}</span>
						<span
							class="shrink-0 text-xs tabular-nums {file.ok ? 'text-gray-400' : 'text-red-700'}"
							title={file.refusedBecause ?? `Pictures here are at most ${plan.maxKilobytes}KB.`}
						>
							{asKB(file.bytes)}
						</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if form && 'pictures' in form && form.success}
		<p class="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
			{form.pictures} picture{form.pictures === 1 ? '' : 's'} into {form.albums} album{form.albums ===
			1
				? ''
				: 's'}{form.skipped ? `, ${form.skipped} refused` : ''}.
		</p>
	{/if}

	{#if data.albums.length === 0}
		<EmptyState
			icon="image"
			title="No albums yet"
			description="An album is where pictures live. Make one, and putting the same picture in a second album never copies it — a picture lives once, however many albums hold it."
		/>
	{:else}
		{#snippet albumCard(node: PageServerData['tree'][number])}
			<li class="group relative">
				<a
					href="{resolve('/gallery')}/{node.id}"
					class="block overflow-hidden rounded-lg border border-gray-200"
				>
					<span class="block aspect-square bg-gray-50">
						{#if node.coverId}
							<img
								src="/media/{node.coverId}"
								alt=""
								loading="lazy"
								class="h-full w-full object-cover"
							/>
						{:else}
							<span class="flex h-full w-full items-center justify-center text-gray-300">
								<Icon name="image" size={40} />
							</span>
						{/if}
					</span>
					<span class="flex items-baseline justify-between gap-2 px-2.5 py-2">
						<span class="truncate text-sm font-medium text-gray-900">{leafName(node.name)}</span>
						<span class="shrink-0 text-xs text-gray-500 tabular-nums">
							{node.totalCount ?? node.count}
						</span>
					</span>
				</a>
				<span class="absolute top-1.5 right-1.5 flex gap-1">
					<button
						class="icon-btn bg-white/80"
						aria-label="Rename {node.name}"
						onclick={() => (renaming = node)}
					>
						<Icon name="edit" />
					</button>
					<button
						class="icon-btn bg-white/80"
						aria-label="Delete {node.name}"
						onclick={() => (confirmingDelete = node)}
					>
						<Icon name="trash" />
					</button>
				</span>
				{#if node.children.length > 0}
					<button
						class="mt-1 flex w-full items-center gap-1 px-1 text-xs text-gray-500 hover:text-gray-700"
						aria-expanded={opened.has(node.id)}
						onclick={() => toggle(node.id)}
					>
						<Icon name={opened.has(node.id) ? 'chevron-down' : 'chevron-right'} size={14} />
						{node.children.length}
						{node.children.length === 1 ? 'album' : 'albums'} inside
					</button>
				{/if}
			</li>
		{/snippet}

		{#snippet branch(nodes: PageServerData['tree'])}
			<ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
				{#each nodes as node (node.id)}
					{@render albumCard(node)}
					{#if opened.has(node.id) && node.children.length > 0}
						<li class="col-span-full border-l-2 border-gray-200 pl-3">
							{@render branch(node.children)}
						</li>
					{/if}
				{/each}
			</ul>
		{/snippet}

		{@render branch(data.tree)}
	{/if}
</div>

<Modal bind:open={showNew} error={form?.message} title="New album" size="sm">
	<form
		id="album-form"
		method="post"
		action="?/create"
		use:enhance={() =>
			({ result, update }) => {
				if (result.type === 'success') showNew = false;
				return update({ reset: result.type === 'success' });
			}}
	>
		<label class="block text-sm">
			<span class="text-gray-600">Name</span>
			<OneLine name="heading" placeholder="Trips" class="input mt-1 w-full" required autofocus />
		</label>
	</form>
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (showNew = false)}>Cancel</button>
		<button class="btn btn-primary" type="submit" form="album-form">Create</button>
	{/snippet}
</Modal>

<Modal
	open={renaming !== null}
	error={form?.message}
	title="Rename album"
	onclose={() => (renaming = null)}
	size="sm"
>
	<form
		id="rename-form"
		method="post"
		action="?/rename"
		use:enhance={() =>
			({ result, update }) => {
				if (result.type === 'success') renaming = null;
				return update();
			}}
	>
		<input type="hidden" name="id" value={renaming?.id} />
		<label class="block text-sm">
			<span class="text-gray-600">Name</span>
			<OneLine name="heading" value={renaming?.name ?? ''} class="input mt-1 w-full" required />
		</label>
	</form>
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (renaming = null)}>Cancel</button>
		<button class="btn btn-primary" type="submit" form="rename-form">Save</button>
	{/snippet}
</Modal>

<Modal
	open={confirmingDelete !== null}
	title="Delete this album?"
	onclose={() => (confirmingDelete = null)}
	size="sm"
>
	{#if confirmingDelete}
		<p class="text-sm text-gray-600">
			<strong>{confirmingDelete.name}</strong> lets go of its {confirmingDelete.count} pictures. A picture
			that also lives in another album stays there; one that lived only here is deleted with it.
		</p>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (confirmingDelete = null)}>Keep it</button>
		<form
			method="post"
			action="?/delete"
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') confirmingDelete = null;
					return update();
				}}
		>
			<input type="hidden" name="id" value={confirmingDelete?.id} />
			<button class="btn btn-danger" type="submit" use:armed>Delete</button>
		</form>
	{/snippet}
</Modal>
