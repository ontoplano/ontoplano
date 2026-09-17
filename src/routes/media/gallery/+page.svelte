<script lang="ts">
	import { setRoomAction } from '$lib/room-action.svelte';
	import RoomToolbar from '$lib/components/RoomToolbar.svelte';
	import { deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import Modal from '$lib/components/Modal.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
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
	/** `Trips — Japan` is a name and a lineage at once; the strip reads it as one. */
	const here = $derived(
		standingIn ? standingIn.name.split(ALBUM_SEPARATOR).join(' › ') : 'All albums'
	);

	function choose(id: number) {
		folderId = id;
		// Opened as well as chosen: standing in a folder while the panel still
		// draws it shut is the tree and the tiles disagreeing about where you are.
		opened.add(id);
	}
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
					class="shrink-0 py-2 pl-1 text-gray-400 transition hover:text-gray-700"
					style="margin-left: {depth * 0.9}rem"
					aria-expanded={opened.has(node.id)}
					title={opened.has(node.id)
						? `Fold ${leafAlbumName(node.name)}`
						: `Show what is in ${leafAlbumName(node.name)}`}
					aria-label={opened.has(node.id)
						? `Fold ${leafAlbumName(node.name)}`
						: `Show what is in ${leafAlbumName(node.name)}`}
				>
					<Icon
						name="chevron-down"
						class="size-4 transition-transform {opened.has(node.id) ? '' : '-rotate-90'}"
					/>
				</button>
			{:else}
				<span class="invisible size-4 shrink-0 py-2 pl-1" style="margin-left: {depth * 0.9}rem"
				></span>
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

<!--
	The card is the `li`, not the link inside it.

	What is under an album belongs to the album, and a "5 albums inside" line
	floating under the card read as page furniture rather than as part of it. So
	the border is the cell's, and the link and the way into the folder both sit
	inside it.
-->
{#snippet albumCard(node: PageServerData['tree'][number])}
	<li class="group relative overflow-hidden rounded-lg border border-gray-200">
		<a href="{resolve('/media/gallery')}/{node.id}" class="block">
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
			<!--
				Its own pictures, not its branch's.

				The card used to show the total under it, so a folder import's root
				said 28 and opened empty — the 28 were in the albums inside it, and
				the number promised something the screen behind it did not have.

				It does have them now: an album shows everything beneath it, so the
				branch's total is what opening this card produces and the number is
				honest again. A folder import's root said 0 and opened onto
				twenty-eight birds.
			-->
			<span class="flex items-baseline justify-between gap-2 px-2.5 py-2">
				<span class="truncate text-sm font-medium text-gray-900">{leafAlbumName(node.name)}</span>
				<span class="shrink-0 text-xs text-gray-500 tabular-nums">
					{node.totalCount ?? node.count}
				</span>
			</span>
		</a>
		<span class="absolute top-1.5 right-1.5 flex gap-1">
			<button
				class="icon-btn bg-white/80"
				aria-label={t('gallery.rename', { name: node.name })}
				onclick={() => (renaming = node)}
			>
				<Icon name="edit" />
			</button>
			<button
				class="icon-btn bg-white/80"
				aria-label={t('gallery.delete', { name: node.name })}
				onclick={() => (confirmingDelete = node)}
			>
				<Icon name="trash" />
			</button>
		</span>
		{#if node.children.length > 0}
			<!-- The folders inside this one, as a place to go rather than as a
			     drawer that opened in the middle of the grid: it stands you in the
			     folder, and the panel and the tiles both follow. -->
			<button
				class="flex w-full items-center gap-1 border-t border-gray-200 px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700"
				onclick={() => choose(node.id)}
			>
				<Icon name="chevron-right" size={14} />{t('gallery.inside', {
					length: node.children.length,
					albums: node.children.length === 1 ? 'album' : 'albums'
				})}</button
			>
		{/if}
	</li>
{/snippet}

<div class="space-y-4">
	<!-- The room's own bar carries the title and the tab strip now; a second
	     one here would put "Gallery" twice on the same screen. -->
	<RoomToolbar>
		{#snippet tools()}
			<!-- A folder of pictures, with its subfolders as albums. -->
			<!-- Ask first: what is in this folder, and what would be refused. -->
			<form method="post" action="?/planFolder" bind:this={planForm} use:enhance>
				<input type="hidden" name="files" />
				<label class="btn btn-sm cursor-pointer">
					<Icon name="download" />
					{t('gallery.importAFolder')}
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
		{/snippet}
	</RoomToolbar>

	<!--
		What would happen, before it happens.

		The refused ones are named, with their size against the instance's
		ceiling — a number somebody can act on (compress it, or raise the
		limit in config.toml) rather than a count of files that vanished.
	-->
	{#if plan}
		<div class="rounded border border-gray-200">
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
					<span class="text-sm text-red-700"
						>{t('gallery.refused', { willRefuse: plan.willRefuse })}</span
					>
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
						{importing ? `Importing ${progress}/${plan.willImport}…` : `Import ${plan.willImport}`}
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

	{#if outcome}
		<p class="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
			{outcome.pictures}
			{t('gallery.picture')}{outcome.pictures === 1 ? '' : 's'}
			{t('gallery.into')}
			{outcome.albums}
			{t('gallery.album')}{outcome.albums === 1 ? '' : 's'}{outcome.skipped
				? `, ${outcome.skipped} refused`
				: ''}.
		</p>
	{/if}

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
	<div class="border border-gray-200 bg-white shadow-card">
		<!--
			Where you are, along the top of the same white.

			And the way into the album's own pictures, because a folder's tiles
			are the folders in it: what it holds itself is one press from here.
			The button is drawn whether or not there is anywhere to go, so
			choosing a folder never moves the row underneath it.
		-->
		<div class="flex items-center gap-3 border-b border-gray-200 px-4 py-2">
			<span class="min-w-0 flex-1 truncate text-sm text-gray-900">{here}</span>
			<span class="shrink-0 text-xs text-gray-500 tabular-nums">
				{#if standingIn}
					{standingIn.totalCount ?? standingIn.count}
					{t('gallery.picture')}{(standingIn.totalCount ?? standingIn.count) === 1 ? '' : 's'}
				{:else}
					{data.albums.length} {t('gallery.album')}{data.albums.length === 1 ? '' : 's'}
				{/if}
			</span>
			<a
				href="{resolve('/media/gallery')}/{standingIn?.id ?? ''}"
				class="btn btn-sm shrink-0 {standingIn ? '' : 'invisible'}"
				aria-hidden={standingIn ? undefined : 'true'}
				tabindex={standingIn ? undefined : -1}
			>
				{t('ui.open')}
			</a>
		</div>

		<div
			class="grid overflow-hidden lg:grid-cols-[var(--folders)_1fr]"
			style="--folders: {PANEL_REM}rem"
		>
			<section class="border-b border-gray-200 lg:border-r lg:border-b-0">
				<h2 class="eyebrow border-b border-gray-200 px-4 py-2 text-gray-600">
					{t('gallery.folders')}
				</h2>

				<!-- Capped on a phone, where the panel sits above the tiles rather
				     than beside them: an import of forty subfolders would otherwise
				     push the pictures off the bottom of the screen. -->
				<ul
					class="max-h-64 divide-y divide-gray-200 overflow-y-auto lg:max-h-none lg:overflow-visible"
				>
					<li>
						<button
							onclick={() => (folderId = null)}
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

			<div class="min-w-0 p-4">
				{#if data.albums.length === 0}
					<EmptyState
						icon="image"
						title={t('gallery.noAlbumsYet')}
						description={t('gallery.anAlbumIsWherePictures')}
					/>
				{:else if standingIn && level.length === 0}
					<!-- A folder with no folders in it. Its pictures are the thing to
					     offer: an empty grid with nothing to press is a dead end. -->
					<EmptyState
						icon="image"
						title={t('gallery.noAlbumsInside', { name: leafAlbumName(standingIn.name) })}
					>
						{#snippet action()}
							<a class="btn btn-primary" href="{resolve('/media/gallery')}/{standingIn?.id}">
								{t('gallery.openTheAlbum')}
							</a>
						{/snippet}
					</EmptyState>
				{:else}
					<!-- `tiles`: two columns at phone width, so each cell keeps its own
					     edges rather than bleeding to both sides of the screen. -->
					<ul class="tiles grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
						{#each level as node (node.id)}
							{@render albumCard(node)}
						{/each}
					</ul>
				{/if}

				<!--
					The pictures that are in notebooks.

					Not an album somebody made and not one they can make: a picture is
					in a notebook because a note mentions it, so this is a view of the
					writing rather than a place to put things. It draws a notebook
					rather than a cover for the same reason — a preview would suggest it
					is a pile of pictures like the others, and opening it shows folders
					named after notebooks, not a wall. It belongs to the top of the
					tree, so standing inside a folder puts it away with the rest of what
					is not in that folder.
				-->
				{#if folderId === null && data.notebookPictures > 0}
					<ul
						class="tiles mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
					>
						<li class="group relative overflow-hidden rounded-lg border border-gray-200">
							<a href="{resolve('/media/gallery')}/notebooks" class="block">
								<span
									class="flex aspect-square items-center justify-center bg-gray-50 text-gray-300"
								>
									<Icon name="notebook" size={56} />
								</span>
								<span class="flex items-baseline gap-2 px-3 py-2">
									<span class="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
										{t('gallery.notebooks')}
									</span>
									<span class="text-xs text-gray-400 tabular-nums">{data.notebookPictures}</span>
								</span>
							</a>
						</li>
					</ul>
				{/if}
			</div>
		</div>
	</div>
</div>

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
