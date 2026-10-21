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
	import type { TabVerb } from '$lib/room-action.svelte';
	import NotebookPicture from '$lib/components/NotebookPicture.svelte';
	import NotebookStar from '$lib/components/NotebookStar.svelte';
	import { enhance } from '$lib/enhance';
	import { useT } from '$lib/i18n';
	import { phoneWidth } from '$lib/breakpoints.svelte';
	import { setRoomSubject } from '$lib/room-subject.svelte';
	import { resolve } from '$app/paths';

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
		ontags,
		bar = false
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
		fill?: TabVerb;
		onedit: () => void;
		ontags: () => void;
		/**
		 * Whether this notebook is the screen — its own page — and so wears the
		 * room's bar on a phone. The shelf's panel is not shown on a phone at
		 * all, and must not name a notebook over the list.
		 */
		bar?: boolean;
	} = $props();

	/*
	 * On a phone the notebook is the room's bar: its picture and name where
	 * "Notebooks" was, and every verb here behind the bar's ⋮ with its word —
	 * the way back to all notebooks among them. What stays under the tabs is
	 * only what the bar cannot say: the description, and the tab's own button.
	 * See `$lib/room-subject`.
	 */
	const phone = phoneWidth();
	const inBar = $derived(bar && phone.current);
	setRoomSubject(() =>
		inBar ? { title: notebook.title, pictureId: notebook.pictureId, menu: verbsAsMenu } : null
	);
	const allNotebooks = $derived(back?.href ?? resolve('/notebooks'));
</script>

<!--
	The verbs as the bar's menu rows: a `.btn` each, with its icon and its
	word — what were tooltips on the icons are the labels here.
-->
{#snippet fillButtons()}
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
			{#if fill.open && fill.form}
				<!-- Outside the form and still its submit, through `form=`: a long
					     note is not scrolled past to reach its own button. -->
				<button type="submit" form={fill.form} class="btn btn-sm btn-primary">
					<Icon name="check" />
					{t('ui.save')}
				</button>
			{/if}
			<!-- Open, it is the composer's Cancel, and quiet beside its Save. -->
			<button type="button" onclick={fill.run} class="btn btn-sm" class:btn-primary={!fill.open}>
				<Icon name={fill.open ? 'close' : 'plus'} />
				{@render words()}
			</button>
		{/if}
	{/if}
{/snippet}

{#snippet verbsAsMenu()}
	<!-- Already resolved: the page passed it built with resolve(). -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<a href={allNotebooks} class="btn btn-sm">
		<Icon name="undo" />
		<span>{t('notebooks.allNotebooks')}</span>
	</a>
	{#if open}
		<a href={open} class="btn btn-sm">
			<Icon name="arrow-right" />
			<span>{t('ui.open')}</span>
		</a>
	{/if}
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{#if link}
		<button type="button" onclick={link.run} class="btn btn-sm">
			<Icon name="link" />
			<span>{link.label}</span>
		</button>
	{/if}
	<button type="button" onclick={ontags} class="btn btn-sm">
		<Icon name="tag" />
		<span>{t('tags.manageTags')}</span>
	</button>
	<NotebookStar {notebook} kind="btn btn-sm" worded />
	{#if notebook.mine && onFamilyPlan}
		<form method="post" action="?/setShared" use:enhance>
			<input type="hidden" name="id" value={notebook.id} />
			<input type="hidden" name="shared" value={notebook.sharedWithFamily ? 'false' : 'true'} />
			<button class="btn btn-sm w-full" aria-pressed={notebook.sharedWithFamily}>
				<Icon name="user" />
				<span
					>{notebook.sharedWithFamily
						? t('notebooks.id.stopSharing')
						: t('notebooks.id.shareWithFamily')}</span
				>
			</button>
		</form>
	{/if}
	{#if notebook.mine}
		<button type="button" onclick={onedit} class="btn btn-sm">
			<Icon name="edit" />
			<span>{t('ui.rename')}</span>
		</button>
		<form method="post" action="?/setClosed" use:enhance>
			<input type="hidden" name="id" value={notebook.id} />
			<input type="hidden" name="closed" value={notebook.closedAt ? 'false' : 'true'} />
			<button class="btn btn-sm w-full">
				<Icon name={notebook.closedAt ? 'undo' : 'archive'} />
				<span>{notebook.closedAt ? t('notebooks.id.reopen') : t('notebooks.id.close')}</span>
			</button>
		</form>
	{/if}
{/snippet}

{#snippet picture()}
	{#if notebook.mine}
		<!-- Pressing it edits the notebook, on its page as in the panel: a
		     press that went straight to the file chooser changed the cover
		     when somebody meant to open the notebook's settings. The picture
		     is changed in that dialog; the corner badge views it. -->
		<NotebookPicture
			{notebook}
			kilobytes={pictureKilobytes}
			onpress={onedit}
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

{#if inBar}
	{#if notebook.description || notebook.closedAt || !notebook.mine || notebook.sharedWithFamily || fill}
		<div class="flex flex-col gap-2 px-3 pt-3 pb-2">
			{#if notebook.closedAt || !notebook.mine || notebook.sharedWithFamily}
				<p class="eyebrow text-gray-500">
					{#if notebook.closedAt}{t('notebooks.id.closed')}{/if}
					{#if !notebook.mine}
						{t('notebooks.id.sharedBy', { sharedBy: notebook.sharedBy ?? '' })}
					{:else if notebook.sharedWithFamily}
						{t('notebooks.id.sharedWithFamily')}
					{/if}
				</p>
			{/if}
			{#if notebook.description}
				<FoldedText text={notebook.description} />
			{/if}
			{#if fill}
				<div class="flex justify-end gap-2">{@render fillButtons()}</div>
			{/if}
		</div>
	{/if}
{:else}
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
			{#if fill}{@render fillButtons()}{/if}
		{/snippet}
	</DetailHeader>
{/if}
