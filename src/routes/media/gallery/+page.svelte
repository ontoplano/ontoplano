<script lang="ts">
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import Banner from '$lib/components/Banner.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import { enhance } from '$lib/enhance';
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { MediaQuery, SvelteSet } from 'svelte/reactivity';
	import Modal from '$lib/components/Modal.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import SortControl from '$lib/components/SortControl.svelte';
	import StripVerb from '$lib/components/StripVerb.svelte';
	import AlbumCard from '$lib/components/AlbumCard.svelte';
	import MediaTiles from '$lib/components/MediaTiles.svelte';
	import { browsable } from '$lib/browse.svelte';
	import { goto } from '$app/navigation';
	import type { PlainKey } from '$lib/i18n/keys';
	import { armed } from '$lib/actions/armed';
	import { ALBUM_SEPARATOR, leafAlbumName } from '$lib/album-path';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

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

	/**
	 * How wide the folder panel is.
	 *
	 * An album's name carries its lineage, so the column has to hold more than
	 * a word; everything past that is width the pictures do not get. Inventory
	 * lets its panel be dragged because a house is somebody's own naming — a
	 * gallery's folders come from a folder on a disk, and one number fits them.
	 */
	const PANEL_REM = 15;

	/** Which folder the tiles are standing in. `null` is every root album. */
	let folderId = $state<number | null>(null);

	/** A node anywhere in the tree, or nothing once it has been renamed away. */
	function nodeOf(
		nodes: PageServerData['tree'],
		id: number
	): PageServerData['tree'][number] | null {
		for (const node of nodes) {
			if (node.id === id) return node;
			const found = nodeOf(node.children, id);
			if (found) return found;
		}
		return null;
	}

	const standingIn = $derived(folderId === null ? null : nodeOf(data.tree, folderId));
	/** The tiles: what is directly inside where the panel says you are. */
	const level = $derived(standingIn ? standingIn.children : data.tree);
	/** `Trips — Japan` is a name and a lineage at once; the panel's summary reads it as one. */
	const here = $derived(
		standingIn ? standingIn.name.split(ALBUM_SEPARATOR).join(' › ') : t('gallery.allAlbums')
	);

	/** Every album in the tree, for a search that looks past the level you are on. */
	const everyAlbum = $derived.by(() => {
		const out: PageServerData['tree'] = [];
		const walk = (nodes: PageServerData['tree']) => {
			for (const node of nodes) {
				out.push(node);
				walk(node.children);
			}
		};
		walk(data.tree);
		return out;
	});

	let looking = $state('');
	const needle = $derived(looking.trim().toLowerCase());

	const ORDERS = ['name', 'size'] as const;
	type Order = (typeof ORDERS)[number];
	const ORDER_LABELS: Record<Order, PlainKey> = {
		name: 'gallery.orderName',
		size: 'gallery.orderSize'
	};
	let order = $state<Order>('name');
	let direction = $state<'asc' | 'desc'>('asc');

	const sizeOf = (node: PageServerData['tree'][number]) => node.totalCount ?? node.count;

	/** What the grid shows: the level you stand on, or every album the search finds. */
	const tiles = $derived.by(() => {
		const found =
			needle === ''
				? [...level]
				: everyAlbum.filter((node) => node.name.toLowerCase().includes(needle));
		const sign = direction === 'asc' ? 1 : -1;
		return found.sort((a, b) =>
			order === 'name'
				? sign * leafAlbumName(a.name).localeCompare(leafAlbumName(b.name))
				: sign * (sizeOf(a) - sizeOf(b))
		);
	});
	const listed = $derived(needle === '' ? level.length : everyAlbum.length);

	/** The notebooks' pictures, as the last card of the top level. */
	const showNotebooks = $derived(folderId === null && needle === '' && data.notebookPictures > 0);
	const showUnused = $derived(folderId === null && needle === '' && data.unusedPictures > 0);

	/** j/k across the cards; Enter opens one, e renames it. */
	let at = $state(-1);
	const hrefOf = (id: number) => `${resolve('/media/gallery')}/${id}`;
	browsable(() => ({
		items: () => tiles,
		cursor: () => at,
		moveTo: (i) => (at = i),
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		open: (i) => goto(hrefOf(tiles[i].id)),
		edit: (i) => (renaming = tiles[i])
	}));

	/** On a phone the panel is folded to one line, so the albums start on the first screen. */
	let foldersOpen = $state(false);
	/** The width at which the panel sits beside the tiles: Tailwind's `lg`. */
	const wide = new MediaQuery('(min-width: 64rem)');

	function choose(id: number | null) {
		folderId = id;
		at = -1;
		foldersOpen = false;
		// Opened as well as chosen: standing in a folder while the panel still
		// draws it shut is the tree and the tiles disagreeing about where you are.
		if (id !== null) opened.add(id);
	}
	let folderInput: HTMLInputElement | undefined = $state();
	let planForm: HTMLFormElement | undefined = $state();
	let importing = $state(false);
	/** How many of the chosen files have been sent, for the button. */
	let progress = $state(0);
	/** What the whole import came to, once every batch is in. */
	let outcome: { pictures: number; albums: number; skipped: number } | null = $state(null);
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

	/*
	 * Go: the files themselves, in batches that fit in one request.
	 *
	 * A folder is many pictures and the server reads one body at a time — a
	 * whole tree in a single POST is refused by the Node adapter before the
	 * app sees it, with a 413 whose body no page can read. So the batch is
	 * filled up to what the instance says one request holds (`batchBytes`,
	 * its own body limit less the multipart framing) and the next one starts.
	 * The counts add up across the batches; the albums are what the plan
	 * already said they would be.
	 */
	async function sendFolder() {
		const taking = new Set(plan?.files.filter((f) => f.ok).map((f) => f.path) ?? []);
		const queue = chosen.filter((f) => taking.has(f.webkitRelativePath || f.name));
		if (queue.length === 0 || !plan) return;

		importing = true;
		progress = 0;
		outcome = null;
		let pictures = 0;
		let skipped = 0;

		const send = async (batch: File[]) => {
			const body = new FormData();
			for (const file of batch) {
				body.append('file', file, file.name);
				// The paths ride alongside the files, in the same order, because
				// a File loses `webkitRelativePath` on the way.
				body.append('path', file.webkitRelativePath || file.name);
			}
			const response = await fetch('?/importFolder', {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body
			});
			const result = deserialize(await response.text());
			if (result.type === 'success' && result.data) {
				pictures += Number(result.data.pictures ?? 0);
				skipped += Number(result.data.skipped ?? 0);
			} else {
				skipped += batch.length;
			}
			progress += batch.length;
		};

		let batch: File[] = [];
		let bytes = 0;
		for (const file of queue) {
			if (batch.length > 0 && bytes + file.size > plan.batchBytes) {
				await send(batch);
				batch = [];
				bytes = 0;
			}
			batch.push(file);
			bytes += file.size;
		}
		if (batch.length > 0) await send(batch);

		outcome = { pictures, skipped, albums: plan.albums.length };
		importing = false;
		chosen = [];
		await invalidateAll();
	}

	let renaming: (typeof data.albums)[number] | null = $state(null);
	let confirmingDelete: (typeof data.albums)[number] | null = $state(null);

	/* This screen's one verb, drawn by the room's bar — see $lib/room-action. */
	setRoomAction(() => ({ label: t('gallery.newAlbum'), run: () => (showNew = true) }));
</script>

<!--
	One folder in the panel, and everything under it.

	Foldable, because an import of somebody's pictures folder makes a row per
	subfolder and a panel taller than the tiles it exists to help you find.
	Folding hides what is inside a folder, never the folder itself, and its
	number still counts the whole branch — so a shut branch says how much is in
	there without listing it. Pressing the name stands you in it, which is what
	the tiles beside the panel then show.
-->
{#snippet folderRow(node: PageServerData['tree'][number], depth: number)}
	<li>
		<div class="flex items-center {folderId === node.id ? 'bg-gray-100' : 'hover:bg-gray-50'}">
			<!-- Its own control, outside the row button: pressing it must fold the
			     branch, not walk into it. -->
			{#if node.children.length > 0}
				<button
					onclick={() => toggle(node.id)}
					class="shrink-0 py-2 pl-1 text-gray-500 transition hover:text-gray-900"
					style="margin-left: {depth * 0.9}rem"
					aria-expanded={opened.has(node.id)}
					title={opened.has(node.id)
						? t('media.fold', { name: leafAlbumName(node.name) })
						: t('media.showWhatIsIn', { name: leafAlbumName(node.name) })}
					aria-label={opened.has(node.id)
						? t('media.fold', { name: leafAlbumName(node.name) })
						: t('media.showWhatIsIn', { name: leafAlbumName(node.name) })}
				>
					<Icon
						name="chevron-down"
						class="size-4 transition-transform {opened.has(node.id) ? '' : '-rotate-90'}"
					/>
				</button>
			{:else}
				<!-- As wide as the chevron's button, so a leaf's name lines up with a
				     branch's. -->
				<span class="invisible shrink-0 py-2 pl-1" style="margin-left: {depth * 0.9}rem"
					><span class="block size-4"></span></span
				>
			{/if}
			<button
				onclick={() => choose(node.id)}
				class="flex min-w-0 flex-1 items-center gap-2 py-2 pr-3 pl-2 text-left text-sm transition {folderId ===
				node.id
					? 'font-medium text-gray-900'
					: 'text-gray-700'}"
			>
				<!-- Its own name as the tooltip: the column is one width and a name
				     can always be longer than it. -->
				<span class="truncate" title={node.name}>{leafAlbumName(node.name)}</span>
				<span class="ml-auto shrink-0 text-xs text-gray-500 tabular-nums">
					{node.totalCount ?? node.count}
				</span>
			</button>
		</div>
		{#if node.children.length > 0 && opened.has(node.id)}
			<ul>
				{#each node.children as child (child.id)}
					{@render folderRow(child, depth + 1)}
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}

<!-- An album as a card, its verbs on its caption rather than over its picture. -->
{#snippet albumCard(node: PageServerData['tree'][number], index: number)}
	<AlbumCard
		href={hrefOf(node.id)}
		name={node.name}
		title={needle === '' ? leafAlbumName(node.name) : node.name.split(ALBUM_SEPARATOR).join(' › ')}
		coverId={node.coverId}
		count={sizeOf(node)}
		inside={node.children.length}
		cursor={at === index}
	>
		{#snippet actions()}
			<button
				class="icon-btn"
				title={t('gallery.rename', { name: node.name })}
				aria-label={t('gallery.rename', { name: node.name })}
				onclick={() => (renaming = node)}
			>
				<Icon name="edit" />
			</button>
			<button
				class="icon-btn icon-btn-danger"
				title={t('gallery.delete', { name: node.name })}
				aria-label={t('gallery.delete', { name: node.name })}
				onclick={() => (confirmingDelete = node)}
			>
				<Icon name="trash" />
			</button>
		{/snippet}
	</AlbumCard>
{/snippet}

<!--
	One surface under the folders and what is in them.

	The tree used to open inside the grid itself — a row of tiles, then a
	strip of whatever was inside the one you had expanded — so the deeper you
	went the less a row of cells had to do with the row above it, and the
	whole thing floated on the page's own background as a loose wall of
	squares. The folders are a panel down the left now, the way inventory's
	locations are, and the tiles beside them are one level: what is directly
	inside wherever the panel says you are standing.
-->
<RoomSurface>
	{#snippet tools()}
		<!--
			Search, count, the import and the order, in the strip every room has.
			The search looks through every album, not only the level you stand on.
		-->
		<FilterBar name="gallery">
			{#snippet lead()}
				<SearchField bind:value={looking} label={t('gallery.searchAlbums')} />
			{/snippet}
			{#snippet count()}
				<ShowingCount
					total={listed}
					shown={tiles.length}
					said={(n) => t('gallery.albumsCount', { count: n })}
				/>
			{/snippet}
			{#snippet verb()}
				<StripVerb
					icon="download"
					label={t('gallery.import')}
					title={t('gallery.importAFolder')}
					onclick={() => folderInput?.click()}
				/>
			{/snippet}
			{#snippet trailing()}
				<SortControl
					value={order}
					options={ORDERS}
					labels={ORDER_LABELS}
					{direction}
					onpick={(next) => (order = next)}
					onflip={() => (direction = direction === 'asc' ? 'desc' : 'asc')}
					label={t('gallery.orderBy')}
				/>
			{/snippet}
		</FilterBar>
		<!-- A folder of pictures, with its subfolders as albums. Ask first: what
		     is in this folder, and what would be refused. -->
		<form method="post" action="?/planFolder" bind:this={planForm} class="hidden" use:enhance>
			<input type="hidden" name="files" />
			<input
				bind:this={folderInput}
				type="file"
				accept="image/png,image/jpeg,image/gif,image/webp"
				multiple
				use:directory
				onchange={folderChosen}
			/>
		</form>
	{/snippet}

	<!--
		What would happen, before it happens.

		The refused ones are named, with their size against the instance's
		ceiling — a number somebody can act on (compress it, or raise the
		limit in config.toml) rather than a count of files that vanished.
	-->
	{#if plan}
		<div class="border-b border-gray-200">
			<div class="flex flex-wrap items-baseline gap-2 border-b border-gray-200 px-4 py-3">
				<span class="text-sm font-medium text-gray-900"
					>{t('gallery.pictureIntoAlbum', {
						willImport: plan.willImport,
						s: plan.willImport === 1 ? '' : 's',
						length: plan.albums.length,
						s2: plan.albums.length === 1 ? '' : 's'
					})}</span
				>
				{#if plan.willRefuse > 0}
					<!-- A mark and a word, never red text alone. -->
					<span class="inline-flex items-center gap-1 text-sm font-medium text-gray-900">
						<Icon name="warning" size={14} />
						{t('gallery.refused', { willRefuse: plan.willRefuse })}
					</span>
				{/if}
				<span class="ml-auto flex items-center gap-2">
					<button class="btn btn-sm" type="button" onclick={() => (chosen = [])}
						>{t('ui.cancel')}</button
					>
					<button
						class="btn btn-primary btn-sm"
						type="button"
						disabled={plan.willImport === 0 || importing}
						onclick={sendFolder}
					>
						{importing
							? t('media.importingProgress', { done: progress, total: plan.willImport })
							: t('media.importCount', { count: plan.willImport })}
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
							class="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums {file.ok
								? 'text-gray-500'
								: 'font-medium text-gray-900'}"
							title={file.refusedBecause ??
								t('gallery.atMostKilobytes', { kilobytes: plan.maxKilobytes })}
						>
							{#if !file.ok}<Icon name="warning" size={12} />{/if}
							{asKB(file.bytes)}
						</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if outcome}
		<div class="border-b border-gray-200 px-4 py-3">
			<Banner kind="success">
				{t('gallery.pictureIntoAlbum', {
					willImport: outcome.pictures,
					s: outcome.pictures === 1 ? '' : 's',
					length: outcome.albums,
					s2: outcome.albums === 1 ? '' : 's'
				})}{outcome.skipped ? ` · ${t('gallery.refused', { willRefuse: outcome.skipped })}` : ''}
			</Banner>
		</div>
	{/if}

	<div
		class="grid overflow-hidden lg:grid-cols-[var(--folders)_1fr]"
		style="--folders: {PANEL_REM}rem"
	>
		<section class="border-b border-gray-200 lg:border-r lg:border-b-0">
			<!-- On a phone the heading is the fold: one line saying where you
			     stand, so the albums start on the first screen. -->
			<h2 class="eyebrow border-b border-gray-200 text-gray-600">
				{#if wide.current}
					<span class="block px-4 py-2">{t('gallery.folders')}</span>
				{:else}
					<button
						type="button"
						class="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-gray-50"
						aria-expanded={foldersOpen}
						aria-controls="gallery-folders"
						onclick={() => (foldersOpen = !foldersOpen)}
					>
						<span class="shrink-0">{t('gallery.folders')}</span>
						<span class="min-w-0 truncate font-normal tracking-normal normal-case">· {here}</span>
						<Icon
							name="chevron-down"
							size={14}
							class="ml-auto shrink-0 transition-transform {foldersOpen ? '' : '-rotate-90'}"
						/>
					</button>
				{/if}
			</h2>

			<ul
				id="gallery-folders"
				class="divide-y divide-gray-200 {foldersOpen || wide.current ? '' : 'hidden'}"
			>
				<li>
					<button
						onclick={() => choose(null)}
						class="flex w-full items-center gap-2 py-2 pr-3 pl-1 text-left text-sm transition {folderId ===
						null
							? 'bg-gray-100 font-medium text-gray-900'
							: 'text-gray-700 hover:bg-gray-50'}"
					>
						<!-- Where a foldable row keeps its chevron, so a folder gaining
						     children never shifts any name sideways. -->
						<span class="invisible size-4 shrink-0"><Icon name="chevron-down" /></span>
						<span class="truncate">{t('gallery.allAlbums')}</span>
						<span class="ml-auto shrink-0 text-xs text-gray-500 tabular-nums">
							{data.albums.length}
						</span>
					</button>
				</li>
				{#each data.tree as root (root.id)}
					{@render folderRow(root, 0)}
				{/each}
			</ul>
		</section>

		<div class="min-w-0">
			{#if data.albums.length === 0 && !showNotebooks && !showUnused}
				<EmptyState
					icon="image"
					title={t('gallery.noAlbumsYet')}
					description={t('gallery.anAlbumIsWherePictures')}
				/>
			{:else if needle !== '' && tiles.length === 0}
				<EmptyState icon="search" title={t('gallery.noneMatch')} />
			{:else}
				<MediaTiles>
					<!-- Standing in a folder, its own pictures come first: every one
					     beneath it, in one album. -->
					{#if standingIn && needle === ''}
						<AlbumCard
							href={hrefOf(standingIn.id)}
							name={standingIn.name}
							title={t('gallery.allOf', { name: leafAlbumName(standingIn.name) })}
							coverId={standingIn.coverId}
							count={sizeOf(standingIn)}
						/>
					{/if}
					{#each tiles as node, i (node.id)}
						{@render albumCard(node, i)}
					{/each}
					<!--
						The pictures that are in notebooks.

						Not an album somebody made and not one they can make: a picture
						is in a notebook because a note mentions it, so this is a view of
						the writing rather than a place to put things. It draws a
						notebook rather than a cover for the same reason, and belongs to
						the top of the tree.
					-->
					{#if showNotebooks}
						<AlbumCard
							href="{resolve('/media/gallery')}/notebooks"
							name={t('gallery.notebooks')}
							icon="notebook"
							count={data.notebookPictures}
						/>
					{/if}
					<!-- The pictures nothing points at any more: pasted and then cut
					     out of the writing. Drawn only when there are some. -->
					{#if showUnused}
						<AlbumCard
							href="{resolve('/media/gallery')}/unused"
							name={t('gallery.unused.title')}
							icon="broom"
							count={data.unusedPictures}
						/>
					{/if}
				</MediaTiles>
			{/if}
		</div>
	</div>
</RoomSurface>

<Modal bind:open={showNew} error={form?.message} title={t('gallery.newAlbum')} size="sm">
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
			<span class="text-gray-600">{t('ui.name')}</span>
			<OneLine
				name="heading"
				placeholder={t('gallery.trips')}
				class="input mt-1 w-full"
				required
				autofocus
			/>
		</label>
	</form>
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (showNew = false)}>{t('ui.cancel')}</button>
		<button class="btn btn-primary" type="submit" form="album-form">{t('ui.create')}</button>
	{/snippet}
</Modal>

<Modal
	open={renaming !== null}
	error={form?.message}
	title={t('gallery.renameAlbum')}
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
			<span class="text-gray-600">{t('ui.name')}</span>
			<OneLine name="heading" value={renaming?.name ?? ''} class="input mt-1 w-full" required />
		</label>
	</form>
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (renaming = null)}>{t('ui.cancel')}</button>
		<button class="btn btn-primary" type="submit" form="rename-form">{t('ui.save')}</button>
	{/snippet}
</Modal>

<Modal
	open={confirmingDelete !== null}
	title={t('gallery.deleteThisAlbum')}
	onclose={() => (confirmingDelete = null)}
	size="sm"
>
	{#if confirmingDelete}
		<p class="text-sm text-gray-600">
			<strong>{confirmingDelete.name}</strong>{t('gallery.letsGoOfItsPictures', {
				count: confirmingDelete.count
			})}
		</p>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (confirmingDelete = null)}
			>{t('gallery.keepIt')}</button
		>
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
			<button class="btn btn-danger" type="submit" use:armed>{t('ui.delete')}</button>
		</form>
	{/snippet}
</Modal>
