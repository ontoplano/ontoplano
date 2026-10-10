<script lang="ts">
	/**
	 * The top of one notebook: its picture, its name, what it is about, and
	 * what can be done to it.
	 *
	 * The shelf's panel and the notebook's own page draw the same notebook, and
	 * they had two headers — an eyebrow on a washed band beside the list, a
	 * heading with a row of mixed buttons on the page — so moving from one to
	 * the other changed where everything was. This is the one of them.
	 *
	 * The verbs are icons at one size, in the app's order — the ways into and
	 * around the notebook, then edit, then close. Deleting it lives in the edit
	 * dialogue, where the notebook's name is in front of you. The label of the
	 * Link button follows the tab below, so it is its glyph alone and its width
	 * never changes; the tooltip says what it links.
	 */
	import DetailHeader from '$lib/components/DetailHeader.svelte';
	import FoldedText from '$lib/components/FoldedText.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import NotebookPicture from '$lib/components/NotebookPicture.svelte';
	import NotebookStar from '$lib/components/NotebookStar.svelte';
	import { enhance } from '$lib/enhance';
	import { useT } from '$lib/i18n';

	const t = useT();

	/** The picture is a cover, the shelf's 3:4 rather than a square — see `.cover-art`. */
	const COVER = 'w-12 aspect-[3/4]';

	let {
		notebook,
		pictureKilobytes,
		onFamilyPlan = false,
		back,
		open,
		link,
		fill,
		onedit,
		ontags
	}: {
		notebook: {
			id: number;
			title: string;
			description: string | null;
			pictureId: number | null;
			mine: boolean;
			favourite: boolean;
			closedAt: string | null;
			sharedWithFamily: boolean;
			sharedBy?: string | null;
		};
		pictureKilobytes: number;
		/** Whether the owner can share it into the family. */
		onFamilyPlan?: boolean;
		/** The list it lives in, on its own page. */
		back?: { href: string; label: string };
		/** Its own page, from the panel beside the shelf. Already resolved. */
		open?: string;
		/** Taking something already written into the tab below. */
		link?: { label: string; run: () => void };
		/**
		 * The tab's New button, where the page has no room bar to put it in.
		 *
		 * `labels` is every word it can say, so it is as wide as the longest and
		 * changing tab does not move the verbs beside it.
		 */
		fill?: { label: string; labels: string[]; run?: () => void; href?: string };
		onedit: () => void;
		ontags: () => void;
	} = $props();
</script>

{#snippet picture()}
	{#if notebook.mine}
		<!-- On a phone the picture opens the viewer; Edit still changes it. -->
		<NotebookPicture
			{notebook}
			kilobytes={pictureKilobytes}
			onpress={open ? onedit : undefined}
			size={COVER}
			resizable
			viewOnTouch
		/>
	{:else if notebook.pictureId}
		<!-- Not yours to change, but yours to look at: the viewer answers `data-view`. -->
		<img
			src="/media/{notebook.pictureId}"
			alt={notebook.title}
			loading="lazy"
			data-view
			class="{COVER} shrink-0 cursor-zoom-in border border-gray-200 bg-white object-cover"
		/>
	{/if}
{/snippet}

<DetailHeader
	surface
	pane
	title={notebook.title}
	{back}
	lead={notebook.mine || notebook.pictureId ? picture : undefined}
>
	{#snippet badges()}
		{#if open}
			<!-- Beside the name it opens, rather than among the verbs at the far end.
			     Already resolved by the caller. -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href={open}
				class="icon-btn ml-1 inline-flex align-middle"
				title={t('ui.open')}
				aria-label={t('ui.open')}
			>
				<Icon name="arrow-right" />
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}
		{#if notebook.closedAt}
			<span class="eyebrow ml-2 align-middle text-gray-500">{t('notebooks.id.closed')}</span>
		{/if}
		{#if !notebook.mine}
			<span class="eyebrow ml-2 align-middle text-gray-500"
				>{t('notebooks.id.sharedBy', { sharedBy: notebook.sharedBy ?? '' })}</span
			>
		{:else if notebook.sharedWithFamily}
			<span class="eyebrow ml-2 align-middle text-gray-500"
				>{t('notebooks.id.sharedWithFamily')}</span
			>
		{/if}
	{/snippet}

	{#snippet meta()}
		{#if notebook.description}
			<!-- Folded when it is long: a description written properly pushed the
			     notes off a phone screen. See `FoldedText`. -->
			<FoldedText text={notebook.description} />
		{/if}
	{/snippet}

	{#snippet actions()}
		{#if link}
			<button
				type="button"
				onclick={link.run}
				class="icon-btn"
				title={link.label}
				aria-label={link.label}
			>
				<Icon name="link" />
			</button>
		{/if}
		<!-- This subject's own words, rather than the whole account's. -->
		<button
			type="button"
			onclick={ontags}
			class="icon-btn"
			title={t('tags.manageTags')}
			aria-label={t('tags.manageTags')}
		>
			<Icon name="tag" />
		</button>
		<!-- The reader's own star, so a notebook shared with them can carry one. -->
		<NotebookStar {notebook} />
		{#if notebook.mine && onFamilyPlan}
			<!-- The owner's switch: everybody on the plan reads it and writes their
			     own entries into it. Entries keep their writers. -->
			<form
				method="post"
				action="?/setShared"
				use:enhance={() =>
					async ({ update }) => {
						await update({ reset: false });
					}}
			>
				<input type="hidden" name="id" value={notebook.id} />
				<input type="hidden" name="shared" value={notebook.sharedWithFamily ? 'false' : 'true'} />
				<button
					class="icon-btn"
					aria-pressed={notebook.sharedWithFamily}
					title={notebook.sharedWithFamily
						? t('notebooks.id.stopSharing')
						: t('notebooks.id.shareWithFamily')}
					aria-label={notebook.sharedWithFamily
						? t('notebooks.id.stopSharing')
						: t('notebooks.id.shareWithFamily')}
				>
					<Icon name="user" />
				</button>
			</form>
		{/if}
		{#if notebook.mine}
			<button
				type="button"
				onclick={onedit}
				class="icon-btn"
				title={t('ui.rename')}
				aria-label={t('ui.rename')}><Icon name="edit" /></button
			>
			<!-- Closing is putting it away: the app's glyph for that is the box. -->
			<form
				method="post"
				action="?/setClosed"
				use:enhance={() =>
					async ({ update }) => {
						await update({ reset: false });
					}}
			>
				<input type="hidden" name="id" value={notebook.id} />
				<input type="hidden" name="closed" value={notebook.closedAt ? 'false' : 'true'} />
				<button
					class="icon-btn"
					title={notebook.closedAt ? t('notebooks.id.reopen') : t('notebooks.id.close')}
					aria-label={notebook.closedAt ? t('notebooks.id.reopen') : t('notebooks.id.close')}
				>
					<Icon name={notebook.closedAt ? 'undo' : 'archive'} />
				</button>
			</form>
		{/if}
		{#if fill}
			{#snippet words()}
				<span class="grid">
					{#each fill.labels as one (one)}
						<span class="col-start-1 row-start-1" class:invisible={one !== fill.label}>{one}</span>
					{/each}
				</span>
			{/snippet}
			{#if fill.href}
				<!-- Already resolved: NotebookDetail builds this with `resolve()`. -->
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={fill.href} class="btn btn-sm btn-primary">
					<Icon name="plus" />
					{@render words()}
				</a>
			{:else}
				<button type="button" onclick={fill.run} class="btn btn-sm btn-primary">
					<Icon name="plus" />
					{@render words()}
				</button>
			{/if}
		{/if}
	{/snippet}
</DetailHeader>
