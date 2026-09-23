<script lang="ts">
	import { page } from '$app/state';
	import Written from '$lib/components/Written.svelte';
	import TagInput from '$lib/components/TagInput.svelte';
	import { dayOf, momentOf, today, weekdayOf } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import { resolve } from '$app/paths';
	import OneLine from '$lib/components/OneLine.svelte';
	import Card from '$lib/components/Card.svelte';
	import { formatMoney } from '$lib/money';
	import Icon from '$lib/components/Icon.svelte';
	import FrontDoor from '$lib/components/FrontDoor.svelte';
	import QuickCapture from '$lib/components/QuickCapture.svelte';
	import WidgetPicker from '$lib/components/WidgetPicker.svelte';
	import Pie from '$lib/components/Pie.svelte';
	import Swatch from '$lib/components/Swatch.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import { enhance } from '$lib/enhance';
	import FormError from '$lib/components/FormError.svelte';
	import { tick } from 'svelte';
	import type { PageServerData, ActionData } from './$types';
	import { SECTION_COLORS, CATEGORY_FALLBACK_COLOR } from '$lib/colors.js';
	import { cardById, type DashboardCardId } from '$lib/dashboard.js';
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { cancelFor, changeNow, isPending } from '$lib/undo.svelte';
	import { getAction, keyFor } from '$lib/shortcuts';
	import { useT } from '$lib/i18n';

	const t = useT();
	const now = useWhen();

	/** Keep the card a card: the tracker is one click away for the full list. */
	const TODO_PREVIEW = 5;
	const GOAL_PREVIEW = 4;
	/** How many blocks a day column shows before it says how many more. */
	const DAY_PREVIEW = 5;
	/** How many rows a shopping or wishlist card shows before it says how many more. */
	const SHOPPING_PREVIEW = 6;
	/** How many categories the ring names beside it before folding the rest in. */
	const PIE_LEGEND = 5;
	const MINUTES_IN_HOUR = 60;

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	/**
	 * What a day column is called: Today, Tomorrow, then its own weekday.
	 *
	 * Two words rather than three dates. "Today" and "Tomorrow" are how
	 * somebody refers to those two days, and the day after has no such name in
	 * any of these languages — so it gets the weekday, from the reader's own
	 * locale rather than a list of abbreviations written in English.
	 */
	function dayHeading(date: string, ahead: number): string {
		if (ahead === 0) return t('app.today');
		if (ahead === 1) return t('home.tomorrow');
		return weekdayOf(date, now(), { weekday: 'long' });
	}

	/** "19 Sep" — the date under the name, so "Tomorrow" is still a date. */
	function dayNumber(date: string): string {
		return dayOf(date, now());
	}

	/** "1 block", "3 blocks" — because "1 blocks" is how a sentence loses trust. */
	function blocks(n: number): string {
		return t('home.blocksCount', { count: n });
	}

	/** "17 Aug" — a Monday said the way somebody would say it. */
	function weekName(weekStart: string): string {
		return dayOf(weekStart, now());
	}

	// Rearranging is a mode rather than something you can trigger by accident:
	// the cards hold forms and links, and making them permanently draggable
	// would fight every click you actually meant.
	let arranging = $state(false);
	let capture = $state<QuickCapture | undefined>();
	let order: DashboardCardId[] = $state([]);
	let dragging: DashboardCardId | null = $state(null);
	let dragOver: DashboardCardId | null = $state(null);

	/**
	 * Signed out, this route is a door and there is no dashboard.
	 *
	 * One route with two audiences: the template picks between them, but the
	 * script above it runs either way, so the places that reach for dashboard
	 * data say what they mean when there is none.
	 */
	const layout = $derived(arranging ? order : (data.layout ?? []));

	/*
	 * Which end of the todo list the card shows.
	 *
	 * Kept in this browser rather than on the account: it is a way of looking at
	 * a list, closer to a scroll position than to a setting, and somebody who
	 * flips it on a phone has not said anything about their laptop.
	 */
	let todosNewestFirst = $state(true);
	$effect(() => {
		try {
			const held = localStorage.getItem('ontoplano:dash-todos-newest');
			if (held !== null) todosNewestFirst = held === '1';
		} catch {
			// A private window, or storage refused. The default stands.
		}
	});
	const sortedTodos = $derived.by(() => {
		// Signed out, this page is the pitch and there is no list at all.
		const todos = data.latestTodos ?? [];
		return todosNewestFirst ? todos : [...todos].reverse();
	});

	/**
	 * Today's blocks that are still to do, and any that are mid-undo.
	 *
	 * The server's list is what is *left*, so a ticked block drops out of it the
	 * moment the reload lands — taking the row, and the Undo the row was
	 * offering, out from under the cursor a couple of hundred milliseconds after
	 * the tick. Everything below it moved up at the same time.
	 *
	 * So the list is rebuilt from the day's blocks instead, and one inside its
	 * undo window keeps the place it had, struck through, until the window
	 * closes. The counts beside it are the server's and move straight away:
	 * the block really is done, and this is only the offer to say otherwise.
	 */
	const todoRows = $derived(
		(data.todayTasks ?? []).filter(
			(t) => t.status === 'todo' || t.status === 'doing' || isPending(`instance:${t.id}`)
		)
	);

	function startArranging() {
		order = [...layout];
		arranging = true;
	}

	/**
	 * Moving a card, by the handle, with whatever is doing the moving.
	 *
	 * This was HTML5 drag-and-drop, which does not exist on a touch screen at
	 * all: the mode opened on a phone, said "drag the cards", and then could not
	 * be used — which is why there were arrows beside the handle. Pointer events
	 * are the same three events for a mouse, a finger and a pen, so there is one
	 * gesture now and the arrows are gone with the duplication.
	 *
	 * Only the handle starts it. Arming the whole card would take the gesture
	 * the moment a finger landed anywhere on it, and on a phone that gesture is
	 * the page scrolling — the handle is a control whose only purpose is this,
	 * so it may answer immediately.
	 *
	 * The card under the pointer is asked for by hit test rather than by
	 * listening on every card: the thing being dragged holds the pointer
	 * capture, so no other element hears a thing until it is let go.
	 */
	/*
	 * Where every card is, measured once at the grab.
	 *
	 * The first version asked `document.elementFromPoint` on every
	 * pointermove. A mouse reports far more often than the screen redraws, and
	 * a hit test is a question the browser cannot answer without finishing any
	 * layout it was putting off — so each of those events flushed the layout
	 * of a page made of twelve cards, and the card lagged behind the cursor.
	 *
	 * Measuring once is possible because nothing moves during the drag: see
	 * `settle` below. The boxes taken at the grab are the boxes for the whole
	 * of it.
	 */
	let boxes: { id: DashboardCardId; left: number; top: number; right: number; bottom: number }[] =
		[];

	function measure() {
		boxes = [...document.querySelectorAll<HTMLElement>('[data-card]')].map((el) => {
			const box = el.getBoundingClientRect();
			return {
				id: el.dataset.card as DashboardCardId,
				left: box.left,
				top: box.top,
				right: box.right,
				bottom: box.bottom
			};
		});
	}

	function cardAt(x: number, y: number): DashboardCardId | undefined {
		return boxes.find((b) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom)?.id;
	}

	/** The last place the pointer was, and whether a frame is already booked. */
	let pointerAt: { x: number; y: number } | null = null;
	let frame = 0;

	function grab(id: DashboardCardId, e: PointerEvent) {
		e.preventDefault();
		dragging = id;
		dragOver = id;
		measure();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	/*
	 * One answer per frame, and the answer is only ever "which card is this
	 * over" — the cards themselves do not move until it is let go.
	 *
	 * They used to move under the pointer, which is the obvious thing and the
	 * wrong one on a grid that packs half-width cards into whatever gap is
	 * free. Every swap re-laid the whole dashboard out, so the thing under the
	 * pointer a frame later was not the thing you were aiming at, dragging
	 * down and back up did not return a card to where it started, and after
	 * enough of that it stopped doing anything at all.
	 *
	 * So the grid holds still and says where the card would land — the target
	 * wears an outline, the card being carried goes faint — and the move
	 * happens once, on release. Nothing has moved, so the measurements cannot
	 * go stale, and letting go where you picked it up is exactly a no-op.
	 */
	function dragTo(e: PointerEvent) {
		if (!dragging) return;
		e.preventDefault();
		pointerAt = { x: e.clientX, y: e.clientY };
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			if (!dragging || !pointerAt) return;
			const under = cardAt(pointerAt.x, pointerAt.y);
			if (under && order.includes(under)) dragOver = under;
		});
	}

	function letGo() {
		if (frame) cancelAnimationFrame(frame);
		frame = 0;
		pointerAt = null;

		const moved = dragging;
		const onto = dragOver;
		dragging = null;
		dragOver = null;
		if (!moved || !onto || moved === onto) return;

		const next = order.filter((x) => x !== moved);
		next.splice(next.indexOf(onto), 0, moved);
		order = next;
	}

	async function saveOrder() {
		const body = new FormData();
		for (const id of order) body.append('card', id);
		const res = await fetch('/?/setLayout', {
			method: 'POST',
			headers: { 'x-sveltekit-action': 'true' },
			body
		});
		deserialize(await res.text());
		arranging = false;
		dragging = null;
		dragOver = null;
		await invalidateAll();
	}

	function hideCard(id: DashboardCardId) {
		order = order.filter((x) => x !== id);
	}

	/** The picker's one verb: on the dashboard, or not. */
	function toggleCard(id: DashboardCardId) {
		order = order.includes(id) ? order.filter((x) => x !== id) : [...order, id];
	}

	let pickingWidgets = $state(false);

	/** "2 h 30" — the middle of the ring, and the same words the review uses. */
	function hoursAndMinutes(minutes: number): string {
		const hours = Math.floor(minutes / MINUTES_IN_HOUR);
		const rest = minutes % MINUTES_IN_HOUR;
		if (!hours) return t('home.minutesShort', { minutes: rest });
		if (!rest) return t('home.hoursShort', { hours });
		return t('home.hoursAndMinutesShort', { hours, minutes: String(rest).padStart(2, '0') });
	}

	let showDiaryForm = $state(false);
	let showWinsForm = $state(false);

	// The three-wins card is now a layout choice; this only gates its keybind.
	const winsEnabled = $derived(layout.includes('threeWins'));

	function formatDate(dateStr: string): string {
		const d = new Date(dateStr);
		return momentOf(d, now(), { weekday: 'short', year: undefined });
	}

	/**
	 * Answer for the block on the dashboard, and offer to take it back.
	 *
	 * Written at once, not when the toast expires. Holding the request made the
	 * tick a lie for five seconds: this card said done while the rest of the
	 * page — the next-up card, the counts — was still drawn from a server that
	 * had not been told. Undo sends the opposite status, which is an ordinary
	 * write. A second press inside the window is the same gesture.
	 */
	function answerLater(task: { id: number | string; name: string }, status: 'done' | 'skipped') {
		const key = `instance:${task.id}`;
		if (isPending(key)) {
			cancelFor(key);
			return;
		}

		const write = (to: string) => {
			const body = new FormData();
			body.set('id', String(task.id));
			body.set('kind', 'instance');
			body.set('status', to);
			return fetch('/tasks/board?/setStatus', {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body
			}).then(() => invalidateAll());
		};

		const said = status === 'done' ? 'Completed' : 'Skipped';
		changeNow(
			key,
			`${said} ${task.name}`,
			() => write(status),
			() => write('todo')
		);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			/*
			 * A dialog closes itself, and this used to stop it.
			 *
			 * `<dialog>` handles Escape in the platform — that is most of why it
			 * is a dialog — and `preventDefault()` here cancelled it. So the four
			 * quick-write forms opened with `i`, `t`, `n`, `b` could be dismissed
			 * by the × and the backdrop and by nothing else, which is the one
			 * thing somebody who opened it with a keystroke would try.
			 *
			 * Nothing else on this page needs Escape while a dialog is up, so the
			 * whole handler stands aside.
			 */
			if (document.querySelector('dialog[open]')) return;

			e.preventDefault();
			showDiaryForm = false;
			showWinsForm = false;
			(document.activeElement as HTMLElement)?.blur?.();
			return;
		}

		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		// Quick capture first: those four keys belong to it wherever it is shown.
		// Both shapes are mounted; only one is visible, and either will do.
		if (capture?.openByShortcut(e.key)) {
			e.preventDefault();
			return;
		}

		const action = getAction('/', e.key);
		if (!action) return;
		e.preventDefault();

		switch (action) {
			case 'new-diary':
				showDiaryForm = !showDiaryForm;
				showWinsForm = false;
				if (showDiaryForm) {
					tick().then(() => {
						const ta = document.querySelector<HTMLTextAreaElement>('textarea[name="content"]');
						ta?.focus();
					});
				}
				break;
			case 'new-wins':
				if (!winsEnabled) break;
				showWinsForm = !showWinsForm;
				showDiaryForm = false;
				if (showWinsForm) {
					tick().then(() => {
						const input = document.querySelector<HTMLInputElement>('input[name="win_0"]');
						input?.focus();
					});
				}
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if data.frontDoor}
	<!--
		Signed out, this is a door rather than a pitch. The pitch is
		ontoplano.com, which is its own repository and its own audience.
	-->
	<FrontDoor {...data.frontDoor} />
{:else}
	<div class="space-y-6">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h1 class="text-lg font-bold text-gray-900">
				{dayOf(new Date(), now(), { weekday: 'long', month: 'long' })}
			</h1>
			<!--
				Both states of this corner, in one cell.

				They used to swap: the capture row and the handle, or Cancel and
				Done. Those are different widths and different heights, and the
				header wraps on a phone — so pressing the handle re-wrapped the
				row, the header grew a line, and the whole dashboard jumped down
				at the moment somebody was looking at where the cards were. Both
				are drawn on every render and the one that is not in charge is
				made invisible, so the row is the size of the larger of the two
				whatever is happening. `inert` because an invisible button is
				still a tab stop otherwise.

				And the way out is where the way in was: Done sat at the bottom of
				the card list, past however many cards there are, so on a phone
				finishing meant scrolling back down through everything that had
				just been rearranged to find it.
			-->
			<div class="dash-corner">
				<div class="dash-corner-state" class:is-away={arranging} inert={arranging}>
					<QuickCapture
						bind:this={capture}
						error={form?.message}
						hidden={data.hiddenSections ?? []}
						inline
					/>
					<span class="hidden h-5 w-px bg-gray-300 lg:block"></span>
					<!-- Arrange is not a fifth thing to write down — it changes what
					     the page is. Set apart by a rule, and the icon alone, so the
					     row reads as "four things you can write" and then "and you
					     can rearrange". The glyph is six dots, which at the size the
					     rest of the icons are drawn was a smudge: this one is a
					     target you aim at rather than one you read. -->
					<button
						onclick={startArranging}
						class="icon-btn icon-btn-lg"
						title={t('home.rearrangeTheCards')}
						aria-label={t('home.rearrangeTheCards')}
					>
						<Icon name="drag" size={26} class="icon-heavy" />
					</button>
				</div>
				<div class="dash-corner-state" class:is-away={!arranging} inert={!arranging}>
					<button onclick={() => (pickingWidgets = true)} class="btn btn-sm">
						<Icon name="plus" />
						{t('home.widgets')}
					</button>
					<button
						onclick={() => (arranging = false)}
						class="btn btn-sm"
						title={t('home.leaveTheCardsAsThey')}>{t('ui.cancel')}</button
					>
					<button onclick={saveOrder} class="btn btn-primary btn-sm">{t('ui.done')}</button>
				</div>
			</div>
		</div>

		<!--
			The four tiles that used to sit here are gone from the phone.

			They were the phone's answer to "write one thing down before it
			evaporates", and then the capture pie became a better one: the + in the
			bottom bar is under the thumb, opens the same four, and needs no room
			on the page at all. Two controls doing one job, and this was the one
			costing a fifth of the first screen before anything about the day.

			The desktop row stays, inline in the header above: there is no pie
			under a mouse, and it costs one line.
		-->

		<!--
	An empty card says what the thing is for and offers the way in.

	"No goals running." on its own is a dead end on the one screen a new
	account opens first.
-->
		{#snippet nothingYet(text: string, href: string, action: string)}
			<p class="text-sm text-gray-500">{text}</p>
			<!-- Every caller passes a resolved path; a snippet parameter is as far
			     as the rule can follow. -->
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a {href} class="btn btn-sm mt-3 inline-flex">{action}</a>
		{/snippet}

		<!--
		Last week, if nobody has closed it.

		The review page existed for a week before this line did, and in that week
		nothing ever asked anybody to open it — which was the exact complaint that
		made the page worth building. One line, above the fold, only while there is
		a finished week with something in it and no write-up.
	-->
		{#if data.pendingReview}
			<a
				href="{resolve('/tasks/review')}?week={data.pendingReview.weekStart}"
				class="flex items-center gap-3 border border-gray-200 bg-white px-4 py-3 shadow-card transition hover:bg-gray-50"
			>
				<span class="text-gray-500"><Icon name="clock" size={16} /></span>
				<span class="min-w-0 flex-1 text-sm text-gray-900">
					<!-- More than one week open is a different sentence, and saying
					     "last week" to somebody three weeks behind is both wrong and
					     comforting. The number is the blocks still waiting for an
					     answer, because those are what closing a week actually is. -->
					{#if data.pendingReview.weeks > 1}
						{data.pendingReview.weeks}
						{t('home.weeksAreStillOpen')}
						{weekName(data.pendingReview.weekStart)}{t('home.with')}
						{blocks(data.pendingReview.unanswered)}
						{t('home.unanswered')}
					{:else}
						{t('home.lastWeekIsStillOpen')}
						{blocks(data.pendingReview.unanswered)}
						{t('home.withNoAnswer')}
					{/if}
				</span>
				<span class="shrink-0 text-xs text-gray-500">{t('home.reviewIt')}</span>
				<Icon name="chevron-right" size={14} />
			</a>
		{/if}

		<!--
		What is happening now.

		The dashboard used to open with "0 / 11 · 11 to go" — a score about the
		past at the top of the screen somebody opens to ask what to do next. The
		count is still there; it is just no longer the answer.

		Drawn above the grid and outside the layout, it was also the one thing
		on this page that could not be moved or taken off — on the screen whose
		whole point is that you arrange it. It is a card like the others now.
	-->
		{#snippet card_now()}
			{#if data.now || data.taskSummary.total > 0}
				{@const now = data.now}
				<section
					class="card-accent now-card flex flex-col border border-gray-200 bg-white p-4 shadow-card sm:flex-row sm:items-center sm:gap-6"
					style="--card-accent: {now?.task.categoryColor ?? SECTION_COLORS.planner}"
				>
					<div class="min-w-0 flex-1">
						{#if now}
							<span class="eyebrow text-gray-600">
								{now.state === 'now' ? t('home.nowEyebrow') : t('home.nextEyebrow')}
							</span>
							<p class="mt-1 text-xl font-bold text-gray-900">{now.task.name}</p>
							<p class="mt-1 text-sm text-gray-500">
								<span class="tabular">{now.task.startTime}</span>
								{#if now.task.categoryName}· {now.task.categoryName}{/if}
								·
								<!--
									One message per sentence, and the plural chosen by the
									language rather than by an `=== 1` here: "minute" and
									"minutes" were written inline in English, so this line
									stayed English in every language the app ships.
								-->
								{#if now.state === 'now'}
									{t('home.minutesLeft', { count: now.minutes })}
								{:else if now.minutes < 60}
									{t('home.inMinutes', { count: now.minutes })}
								{:else}
									{t('home.inHours', { count: Math.round(now.minutes / 60) })}
								{/if}
							</p>
						{:else}
							<!-- The same card, with the day answered in it. -->
							<span class="eyebrow text-gray-600">{t('ui.next')}</span>
							<p class="mt-1 text-xl font-bold text-gray-900">{t('home.nothingElseToday')}</p>
							<p class="mt-1 text-sm text-gray-500">{t('home.everyBlockOnTodaySPlan')}</p>
						{/if}
					</div>

					<!--
						Two answers, because there are two.

						A block you planned and did not do is not a failure the app should
						make you argue with: some weeks the gym does not happen, and saying
						so is the honest input. Leaving only "Done" meant the only way to
						tell the truth was to say nothing, which is how a tracker starts
						lying.

						Both answers wait a few seconds before they are sent: this is the
						pair somebody presses without looking — it is the first thing on
						the screen and it is under a thumb on a phone.

						Drawn whether or not there is a block to answer, and the card keeps
						its height either way, because answering the last block of the day
						used to empty this card and jump everything under it — the list
						the person had just pressed something in — up the screen.
					-->
					<div
						class="mt-3 flex shrink-0 items-center gap-2 sm:mt-0 {now ? '' : 'invisible'}"
						aria-hidden={now ? undefined : 'true'}
					>
						<button
							type="button"
							class="btn btn-primary"
							disabled={!now}
							onclick={() => now && answerLater(now.task, 'done')}
						>
							<Icon name="check" />
							{t('ui.done')}
						</button>
						<button
							type="button"
							class="btn"
							disabled={!now}
							onclick={() => now && answerLater(now.task, 'skipped')}
						>
							<Icon name="skip" />
							{t('home.skipped')}
						</button>
					</div>
				</section>
			{/if}
		{/snippet}

		{#snippet card_todayTasks()}
			<Card title={t('home.todaySTasks')} accent={SECTION_COLORS.planner}>
				{#snippet actions()}
					<a href={resolve('/tasks/board')} class="text-xs text-gray-500 hover:text-gray-900">
						{t('home.open')}
					</a>
				{/snippet}
				{#if data.taskSummary.total === 0}
					{@render nothingYet(
						t('home.nothingIsPlannedForToday'),
						'/tasks/plan',
						t('home.openThePlan')
					)}
				{:else}
					<div class="flex items-baseline gap-3">
						<span class="text-2xl font-bold text-gray-900">
							{data.taskSummary.done}
							<span class="text-sm font-normal text-gray-500">/ {data.taskSummary.total}</span>
						</span>
						<span class="text-xs text-gray-500">
							{data.tasksTodo.length === 0
								? t('home.nothingLeftToday')
								: t('home.countToGo', { count: data.tasksTodo.length })}
						</span>
					</div>

					{#if todoRows.length > 0}
						<ul class="mt-3 divide-y divide-gray-100 border-t border-gray-100">
							{#each todoRows.slice(0, TODO_PREVIEW) as task (`${task.kind}-${task.id}`)}
								{@const pending = isPending(`instance:${task.id}`)}
								<li class="flex items-center gap-3 py-1.5">
									<!--
										Finishing something from the screen you are already on. It
										used to be a list you could only read, and then a form that
										wrote the moment it was pressed.

										Held for a few seconds now, like the card above and like
										everything else in the app that changes a day: a checkbox
										beside eight lines of small type is the easiest thing on
										this page to tick by accident, and it is somebody's record
										of what they actually did. Pressing it again inside the
										window means the same as pressing Undo.
									-->
									<button
										type="button"
										onclick={() => answerLater({ id: task.id, name: task.name }, 'done')}
										class="-m-1 flex shrink-0 items-center justify-center p-1 pointer-coarse:w-11"
										title={pending ? 'Undo' : 'Done'}
										aria-label={pending
											? `Undo marking ${task.name} done`
											: `Mark ${task.name} done`}
									>
										<span
											class="flex h-4 w-4 items-center justify-center border {pending
												? 'on-fill'
												: 'border-gray-400 bg-white'}"
										>
											{#if pending}<Icon name="check" size={12} />{/if}
										</span>
									</button>
									<span
										class="w-1 shrink-0 self-stretch"
										style="background-color: {task.categoryColor ?? CATEGORY_FALLBACK_COLOR}"
									></span>
									<span class="tabular w-12 shrink-0 font-mono text-xs text-gray-500"
										>{task.startTime}</span
									>
									<span class="truncate text-sm {pending ? 'text-gray-400' : 'text-gray-900'}"
										>{task.name}</span
									>
									{#if task.kind === 'once'}
										<span
											class="ml-auto shrink-0 text-[10px] tracking-wide text-blue-600 uppercase"
										>
											{t('home.oneOff')}
										</span>
									{/if}
								</li>
							{/each}
						</ul>
						{#if todoRows.length > TODO_PREVIEW}
							<p class="mt-1 text-xs text-gray-500">
								{t('home.more', { todoPreview: todoRows.length - TODO_PREVIEW })}
							</p>
						{/if}
					{/if}

					<!--
						A line's worth of room, whether or not there is anything to say
						in it. Ticking the first block off the day makes "1 done" exist,
						and a card that grows by a line the moment you press something
						inside it moves everything under it.
					-->
					<div class="mt-3 flex min-h-4 flex-wrap gap-3 text-xs text-gray-500">
						{#if data.taskSummary.done > 0}
							<span>{t('home.done', { done: data.taskSummary.done })}</span>
						{/if}
						{#if data.taskSummary.doing > 0}
							<span>{t('home.inProgress', { doing: data.taskSummary.doing })}</span>
						{/if}
						{#if data.taskSummary.skipped > 0}
							<span>{t('home.skipped2', { skipped: data.taskSummary.skipped })}</span>
						{/if}
					</div>
				{/if}
			</Card>
		{/snippet}

		{#snippet card_goals()}
			<Card title={t('home.goals')} accent={SECTION_COLORS.goals}>
				{#snippet actions()}
					<a href={resolve('/goals')} class="text-xs text-gray-500 hover:text-gray-900"
						>{t('home.openRarr')}</a
					>
				{/snippet}
				{#if data.activeGoals.length === 0}
					{@render nothingYet(t('home.noGoalsForThisPeriod'), '/goals', t('goals.newGoal'))}
				{:else}
					<ul class="space-y-2">
						{#each data.activeGoals.slice(0, GOAL_PREVIEW) as goal (goal.id)}
							{@const pct =
								goal.progress.fraction === null ? null : Math.round(goal.progress.fraction * 100)}
							<li class="flex items-center gap-3">
								<span
									class="h-4 w-1 shrink-0"
									style="background-color: {goal.areaColor ?? CATEGORY_FALLBACK_COLOR}"
									title={goal.areaName ?? t('home.noArea')}
								></span>
								<span class="min-w-0 flex-1 truncate text-sm text-gray-900">{goal.title}</span>
								<!-- Nothing to count, nothing to draw: an empty track reads as
							     zero progress rather than as no measure. -->
								{#if pct !== null}
									<span class="h-1.5 w-16 shrink-0 bg-gray-200">
										<span
											class="block h-full"
											style="width: {pct}%; background-color: {goal.areaColor ??
												SECTION_COLORS.goals}"
										></span>
									</span>
									<span class="tabular w-10 shrink-0 text-right text-xs text-gray-500">{pct}%</span>
								{:else}
									<span class="shrink-0 text-xs text-gray-500">{t('home.noMeasure')}</span>
								{/if}
							</li>
						{/each}
					</ul>
					{#if data.activeGoals.length > GOAL_PREVIEW}
						<p class="mt-2 text-xs text-gray-500">
							{t('home.more2', { goalPreview: data.activeGoals.length - GOAL_PREVIEW })}
						</p>
					{/if}
				{/if}
			</Card>
		{/snippet}

		{#snippet card_habits()}
			<Card title={t('home.habits')} accent={SECTION_COLORS.health}>
				{#snippet actions()}
					<a href={resolve('/health/habits')} class="text-xs text-gray-500 hover:text-gray-900">
						{t('home.open')}
					</a>
				{/snippet}
				{#if data.habitStreaks.length === 0}
					{@render nothingYet(
						t('home.nothingTrackedYetAHabit'),
						'/health/habits',
						t('health.habits.newHabit')
					)}
				{:else}
					<div class="space-y-2">
						{#each data.habitStreaks as habit (habit.id)}
							<div class="flex items-center justify-between">
								<span class="text-sm text-gray-700">{habit.name}</span>
								<span
									class="text-xs font-medium {habit.type === 'bad'
										? habit.streak > 0
											? 'text-blue-600'
											: 'text-red-600'
										: habit.type === 'neutral'
											? habit.streak > 0
												? 'text-gray-600'
												: 'text-gray-500'
											: habit.streak > 0
												? 'text-blue-600'
												: 'text-gray-500'}"
								>
									{habit.streak}d
								</span>
							</div>
						{/each}
					</div>
				{/if}
			</Card>
		{/snippet}

		<!--
			Today and the next two days, side by side.

			This was the whole week as a table: seven columns of nine-pixel text
			with a row per start time, most of it blank, and four of the columns
			already spent. It answered "what does my timetable look like" — a
			question the planner answers better on a page built for it — rather
			than "what is coming", which is what somebody opening the dashboard
			wants. Three columns leaves room to write the name of the thing.

			A done block is struck through rather than removed: the column is
			the day, and a day with its morning missing is a lie about the day.
		-->
		{#snippet card_nextDays()}
			<Card title={t('home.nextThreeDays')} accent={SECTION_COLORS.planner}>
				{#snippet actions()}
					<a href={resolve('/tasks/plan')} class="text-xs text-gray-500 hover:text-gray-900"
						>{t('home.edit')}</a
					>
				{/snippet}
				<div class="grid gap-3 sm:grid-cols-3">
					{#each data.nextDays as day, ahead (day.date)}
						{@const shown = day.blocks.slice(0, DAY_PREVIEW)}
						<div class="day-column {ahead === 0 ? 'is-today' : ''}">
							<!-- The name and the date together, not one at each end: the
							     columns are half a screen wide on a desktop, and a heading
							     split across that gap reads as two separate things. -->
							<div class="flex items-baseline gap-2">
								<span class="eyebrow text-gray-700">{dayHeading(day.date, ahead)}</span>
								<span class="tabular text-xs text-gray-500">{dayNumber(day.date)}</span>
							</div>
							{#if day.blocks.length === 0}
								<p class="mt-2 text-xs text-gray-500">{t('home.nothingPlanned')}</p>
							{:else}
								<ul class="mt-2 space-y-1.5">
									{#each shown as block (block.id)}
										<li class="flex items-baseline gap-2 text-xs leading-tight">
											<!-- The category's colour as a mark beside the words, never
											     as the words' own ink: the user picks that colour and a
											     pale one is unreadable on a light page. -->
											<span
												class="mt-1 h-3 w-0.5 shrink-0 rounded-full"
												style="background-color: {block.categoryColor || CATEGORY_FALLBACK_COLOR}"
											></span>
											<span class="tabular shrink-0 text-gray-500"
												>{block.startTime.slice(0, 5)}</span
											>
											<span
												class="min-w-0 flex-1 truncate {block.status === 'done'
													? 'text-gray-400'
													: 'text-gray-700'}"
												title={block.name}>{block.name}</span
											>
										</li>
									{/each}
								</ul>
								{#if day.blocks.length > shown.length}
									<p class="mt-1.5 text-xs text-gray-500">
										{t('home.more3', { length: day.blocks.length - shown.length })}
									</p>
								{/if}
							{/if}
						</div>
					{/each}
				</div>
			</Card>
		{/snippet}

		<!--
			The week so far, as a shape.

			The same reading Sunday's review draws, on the day it is still worth
			changing: minutes of blocks actually ticked, by category, with the
			total in the middle of the ring. A column of figures says the same
			thing and nobody reads it — which is why the review got the ring
			first, and why the dashboard should not be the one screen that still
			answers this question as a table.
		-->
		{#snippet card_weekPie()}
			{@const slices = data.weekSoFar.byCategory}
			{@const named = slices.slice(0, PIE_LEGEND)}
			<Card title={t('home.whereTheWeekWent')} accent={SECTION_COLORS.planner}>
				{#snippet actions()}
					<a href={resolve('/tasks/review')} class="text-xs text-gray-500 hover:text-gray-900"
						>{t('home.open')}</a
					>
				{/snippet}
				{#if data.weekSoFar.minutesDone === 0}
					<p class="text-sm text-gray-500">{t('home.nothingTickedOffThisWeek')}</p>
				{:else}
					<div class="flex flex-wrap items-center gap-4">
						<Pie
							slices={slices.map((cat) => ({
								name: cat.name,
								value: cat.minutesDone,
								color: cat.color ?? CATEGORY_FALLBACK_COLOR
							}))}
							label={hoursAndMinutes(data.weekSoFar.minutesDone)}
							size={116}
						/>
						<ul class="min-w-40 flex-1 space-y-1.5">
							{#each named as cat (cat.id ?? 'none')}
								<li class="flex items-center gap-2 text-xs">
									<Swatch color={cat.color ?? CATEGORY_FALLBACK_COLOR} />
									<span class="min-w-0 flex-1 truncate text-gray-700">{cat.name}</span>
									<span class="tabular shrink-0 text-gray-500">
										{hoursAndMinutes(cat.minutesDone)}
									</span>
								</li>
							{/each}
							{#if slices.length > named.length}
								<li class="text-xs text-gray-500">
									{t('home.more3', { length: slices.length - named.length })}
								</li>
							{/if}
						</ul>
					</div>
				{/if}
			</Card>
		{/snippet}

		{#snippet card_diary()}
			<Card title={t('home.diary')} accent={SECTION_COLORS.diary}>
				{#snippet actions()}
					<div class="flex items-center gap-3">
						<a href={resolve('/notebooks/diary')} class="text-xs text-gray-500 hover:text-gray-900">
							{t('home.allEntries')}
						</a>
						{#if winsEnabled}
							<button
								onclick={() => {
									showWinsForm = !showWinsForm;
									showDiaryForm = false;
									if (showWinsForm) {
										tick().then(() => {
											const input = document.querySelector<HTMLInputElement>('input[name="win_0"]');
											input?.focus();
										});
									}
								}}
								class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm transition hover:bg-gray-50"
							>
								{showWinsForm ? 'Cancel' : 'Wins'}
								<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700"
									>{keyFor('/', 'new-wins')}</kbd
								>
							</button>
						{/if}
						<button
							onclick={() => {
								showDiaryForm = !showDiaryForm;
								showWinsForm = false;
							}}
							class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm transition hover:bg-gray-50"
						>
							{showDiaryForm ? 'Cancel' : t('notebooks.diary.newEntry')}
						</button>
					</div>
				{/snippet}

				{#if showDiaryForm}
					<form
						method="post"
						action="?/createDiaryEntry"
						use:enhance={() => {
							return async ({ update }) => {
								await update({ reset: false });
								showDiaryForm = false;
							};
						}}
						class="mb-4 space-y-3 border border-gray-100 bg-gray-50 p-3"
					>
						<textarea
							name="content"
							required
							rows="3"
							placeholder={t('home.whatSOnYourMind')}
							class="block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						></textarea>
						<TagInput
							known={page.data.tagVocabulary ?? []}
							placeholder={t('home.tagsCommaSeparated')}
						/>
						<button type="submit" class="btn btn-primary btn-sm">
							{t('ui.save')}
						</button>
					</form>
				{/if}

				{#if winsEnabled && showWinsForm}
					<form
						method="post"
						action="?/createWins"
						use:enhance={() => {
							return async ({ update }) => {
								await update({ reset: false });
								showWinsForm = false;
							};
						}}
						class="mb-4 space-y-3 border border-gray-100 bg-gray-50 p-3"
					>
						<div class="flex items-center justify-between">
							<span class="text-sm font-medium text-gray-700">{t('home.3Wins')}</span>
							<input
								autocomplete="off"
								name="forDate"
								type="date"
								value={today(now())}
								class="border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
							/>
						</div>
						<OneLine
							name="win_0"
							placeholder={t('home.win1')}
							class="block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						/>
						<OneLine
							name="win_1"
							placeholder={t('home.win2')}
							class="block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						/>
						<OneLine
							name="win_2"
							placeholder={t('home.win3')}
							class="block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						/>
						<button type="submit" class="btn btn-primary btn-sm">
							{t('home.saveWins')}
						</button>
					</form>
				{/if}

				{#if data.lastEntry}
					<div>
						<Written content={data.lastEntry.content} lines={4} />
						<div class="mt-2 flex items-center gap-2">
							<span class="text-xs text-gray-500">{formatDate(data.lastEntry.createdAt)}</span>
							{#each data.lastEntry.tags as tag (tag.id)}
								<TagChip name={tag.name} />
							{/each}
						</div>
					</div>
				{:else}
					{@render nothingYet(
						t('home.nothingWrittenYetWhateverHappened'),
						'/notebooks/diary',
						t('notebooks.diary.newEntry')
					)}
				{/if}
			</Card>
		{/snippet}

		{#snippet card_latestTodos()}
			<Card title={t('home.latestToDos')} accent={SECTION_COLORS.planner}>
				{#snippet actions()}
					<div class="flex items-center gap-2">
						<!--
							Newest first, and reversible.

							The newest is what somebody just wrote and is looking for; the
							oldest is the one that has been avoided longest, which is worth
							being able to look at on purpose. The order is remembered for
							this browser — a preference about a list, not about an account.
						-->
						<button
							type="button"
							onclick={() => {
								todosNewestFirst = !todosNewestFirst;
								try {
									localStorage.setItem('ontoplano:dash-todos-newest', todosNewestFirst ? '1' : '0');
								} catch {
									// It still flips for this visit; only the memory is lost.
								}
							}}
							class="text-xs text-gray-500 hover:text-gray-900"
							title={todosNewestFirst ? t('home.showingNewestFirst') : t('home.showingOldestFirst')}
							>{t('home.first', {
								oldest: todosNewestFirst ? t('todoRows.newest') : t('todoRows.oldest')
							})}</button
						>
						<a href={resolve('/tasks/todo')} class="text-xs text-gray-500 hover:text-gray-900"
							>{t('home.open')}</a
						>
					</div>
				{/snippet}
				{#if sortedTodos.length === 0}
					{@render nothingYet(
						t('home.nothingOnTheListAnything'),
						'/tasks/todo',
						t('home.addATodo')
					)}
				{:else}
					<div class="space-y-1">
						{#each sortedTodos.slice(0, 6) as todo (todo.id)}
							<div class="flex items-baseline gap-2">
								<span class="min-w-0 flex-1 truncate text-sm text-gray-700">{todo.title}</span>
								{#if todo.categoryName}
									<span class="shrink-0 text-[10px] text-gray-500">{todo.categoryName}</span>
								{/if}
							</div>
						{/each}
						{#if sortedTodos.length > 6}
							<span class="text-xs text-gray-500"
								>{t('home.more3', { length: sortedTodos.length - 6 })}</span
							>
						{/if}
					</div>
				{/if}
			</Card>
		{/snippet}

		{#snippet card_ideas()}
			<Card title={t('home.ideas')} accent={SECTION_COLORS.ideas}>
				{#snippet actions()}
					<a href={resolve('/notebooks/ideas')} class="text-xs text-gray-500 hover:text-gray-900"
						>{t('home.open')}</a
					>
				{/snippet}
				{#if (data.latestIdeas ?? []).length === 0}
					{@render nothingYet(
						t('home.noIdeasYetThisIs'),
						'/notebooks/ideas',
						t('health.workouts.writeOneDown')
					)}
				{:else}
					<div class="space-y-1">
						{#each (data.latestIdeas ?? []).slice(0, 5) as idea (idea.id)}
							<Written content={idea.content} oneLine />
						{/each}
						{#if (data.latestIdeas ?? []).length > 5}
							<span class="text-xs text-gray-500"
								>{t('home.more3', { length: (data.latestIdeas ?? []).length - 5 })}</span
							>
						{/if}
					</div>
				{/if}
			</Card>
		{/snippet}

		{#snippet card_bills()}
			<Card title={t('home.bills')} accent={SECTION_COLORS.finance}>
				{#snippet actions()}
					<a href={resolve('/finance/bills')} class="text-xs text-gray-500 hover:text-gray-900"
						>{t('home.open')}</a
					>
				{/snippet}
				{#if data.billsCard.summary.billCount === 0}
					{@render nothingYet(t('home.noBillsYetWriteDown'), '/finance/bills', t('home.addABill'))}
				{:else}
					<div class="space-y-2">
						<div class="text-sm text-gray-700">
							{t('home.paidOfExpected', {
								currency: formatMoney(data.billsCard.summary.paid, data.billsCard.currency),
								currency2: formatMoney(data.billsCard.summary.expected, data.billsCard.currency)
							})}
						</div>
						{#if data.billsCard.open.length === 0}
							<span class="text-xs text-gray-500">{t('home.everythingPaidThisMonth')}</span>
						{:else}
							<div class="space-y-1">
								{#each data.billsCard.open.slice(0, 5) as bill (bill.id)}
									<div class="flex items-center justify-between gap-2 text-sm">
										<span class="text-gray-700">{bill.name}</span>
										<span class="text-xs text-gray-500">
											{formatMoney(bill.amountExpected, data.billsCard.currency)}{#if bill.dueDay}
												{t('home.dueThe')} {bill.dueDay}{/if}
										</span>
									</div>
								{/each}
								{#if data.billsCard.open.length > 5}
									<span class="text-xs text-gray-500"
										>{t('home.more3', { length: data.billsCard.open.length - 5 })}</span
									>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			</Card>
		{/snippet}

		{#snippet card_workouts()}
			<Card title={t('home.workouts')} accent={SECTION_COLORS.health}>
				{#snippet actions()}
					<a href={resolve('/health/workouts')} class="text-xs text-gray-500 hover:text-gray-900"
						>{t('home.open')}</a
					>
				{/snippet}
				{#if data.workoutsCard.length === 0}
					{@render nothingYet(
						t('home.noWorkoutsYetWriteOne'),
						'/health/workouts',
						t('home.addAWorkout')
					)}
				{:else}
					<div class="space-y-1">
						{#each data.workoutsCard.slice(0, 5) as workout (workout.id)}
							<div class="flex items-center justify-between gap-2 text-sm">
								<span class="text-gray-700">{workout.title}</span>
								<span class="text-xs text-gray-500">
									{workout.lastDoneAt
										? t('home.lastDone', { date: workout.lastDoneAt.slice(0, 10) })
										: t('home.neverYet')}
								</span>
							</div>
						{/each}
					</div>
				{/if}
			</Card>
		{/snippet}

		<!--
			What to buy, and what you would like one day: two cards.

			They were one, with a word beside each row saying which kind it was
			— so the list you take to a shop and the list of things you might
			want in a year were interleaved, and neither could be read. They are
			different questions asked at different times; the second is off by
			default because most people do not keep one.
		-->
		{#snippet card_shopping()}
			<Card title={t('home.shopping')} accent={SECTION_COLORS.inventory}>
				{#snippet actions()}
					<a href={resolve('/inventory')} class="text-xs text-gray-500 hover:text-gray-900"
						>{t('home.open')}</a
					>
				{/snippet}
				{#if data.shoppingCard.lines.length === 0}
					{@render nothingYet(t('home.nothingToBuyTheList'), '/inventory', t('home.addAnItem'))}
				{:else}
					<ul class="space-y-1">
						{#each data.shoppingCard.lines.slice(0, SHOPPING_PREVIEW) as line (line.id)}
							<li class="flex items-baseline gap-2 text-sm">
								<span class="min-w-0 flex-1 truncate text-gray-700">{line.name}</span>
								{#if line.needed > 1}
									<span class="tabular shrink-0 text-xs text-gray-500">×{line.needed}</span>
								{/if}
							</li>
						{/each}
					</ul>
					{#if data.shoppingCard.lines.length > SHOPPING_PREVIEW}
						<p class="mt-1 text-xs text-gray-500">
							{t('home.more3', { length: data.shoppingCard.lines.length - SHOPPING_PREVIEW })}
						</p>
					{/if}
				{/if}
			</Card>
		{/snippet}

		{#snippet card_wishlist()}
			<Card title={t('home.wishlist')} accent={SECTION_COLORS.inventory}>
				{#snippet actions()}
					<a href={resolve('/inventory')} class="text-xs text-gray-500 hover:text-gray-900"
						>{t('home.open')}</a
					>
				{/snippet}
				{#if data.shoppingCard.wishlist.length === 0}
					{@render nothingYet(t('home.nothingOnTheWishlist'), '/inventory', t('home.addAnItem'))}
				{:else}
					<ul class="space-y-1">
						{#each data.shoppingCard.wishlist.slice(0, SHOPPING_PREVIEW) as item (item.id)}
							<li class="text-sm text-gray-700"><span class="truncate">{item.name}</span></li>
						{/each}
					</ul>
					{#if data.shoppingCard.wishlist.length > SHOPPING_PREVIEW}
						<p class="mt-1 text-xs text-gray-500">
							{t('home.more3', { length: data.shoppingCard.wishlist.length - SHOPPING_PREVIEW })}
						</p>
					{/if}
				{/if}
			</Card>
		{/snippet}

		{#snippet card_quote()}
			<Card title={t('ui.today')} accent={SECTION_COLORS.home}>
				{#snippet actions()}
					<a
						href={resolve('/settings/preferences')}
						class="text-xs text-gray-500 hover:text-gray-900">{t('home.editRarr')}</a
					>
				{/snippet}
				{#if data.quote}
					<blockquote class="text-sm text-gray-900 italic">
						{t('home.ldquoRdquo', { text: data.quote.text })}
					</blockquote>
					{#if data.quote.author}
						<p class="mt-1 text-xs text-gray-500">
							{t('home.mdash', { author: data.quote.author })}
						</p>
					{/if}
				{:else}
					<p class="text-sm text-gray-500">{t('home.noQuotesYetAddSome')}</p>
				{/if}
			</Card>
		{/snippet}

		{#snippet card_threeWins()}
			<Card title={t('home.threeWins')} accent={SECTION_COLORS.diary}>
				{#snippet actions()}
					<span class="text-xs text-gray-500">{t('home.whatWentWellToday')}</span>
				{/snippet}
				<!-- Rows of their own rather than diary prose, so they can be counted later. -->
				<form method="post" action="?/saveWins" use:enhance class="space-y-2">
					{#each [1, 2, 3] as position (position)}
						<div class="flex items-center gap-2">
							<span class="tabular w-4 shrink-0 text-xs text-gray-500">{position}</span>
							<OneLine
								name="win_{position}"
								value={data.wins.find((w) => w.position === position)?.content ?? ''}
								class="input flex-1"
							/>
						</div>
					{/each}
					<button class="btn btn-primary btn-sm"> {t('ui.save')} </button>
				</form>
			</Card>
		{/snippet}

		<!--
		`grid-flow-dense` so a half-width card fills a gap a full-width one left
		beside it. On a sparse account, where most cards are one line, the
		difference is a screen of empty space or none.
	-->
		<div
			class="grid grid-flow-row-dense grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3"
			data-tour="dash-cards"
		>
			{#each layout as id (id)}
				{@const card = cardById(id)}
				{#if card}
					<!-- Half-width cards pair up on wide screens; full-width ones take the row. -->
					<div
						class="relative {card.width === 'half'
							? 'md:col-span-1'
							: 'md:col-span-2 2xl:col-span-3'} {arranging ? 'being-arranged' : ''} {dragging === id
							? 'opacity-40'
							: ''} {arranging && dragOver === id ? 'outline-2 outline-gray-900' : ''}"
						data-card={id}
						role={arranging ? 'listitem' : undefined}
					>
						{#if arranging}
							<!--
								The handle takes the card's own corner, where "Open →" was.
								
								It was a bar of its own above each card: a bordered strip
								with a drag handle and three buttons, and the card's real
								header underneath it. On a phone that read as a stack of
								empty boxes with the dashboard showing through the gaps —
								two headers per card, one of them blank. A card has one
								header, and while these are being moved it holds these
								instead of the way in. `.card-actions` is hidden by the
								rule at the bottom of this file.

								Padded from the same two numbers the header is
								(`--card-pad-*`), so it lands on the button it replaces
								rather than near it — written separately, it sat high and
								inset, which on a phone read as a row of controls hanging
								off the bottom of the title.

								Two controls, and the handle is the last of them: it is
								what the card is grabbed by, so it belongs at the outside
								edge, under the thumb that reaches for it. The arrows are
								gone — dragging is the way these move, and a pair of
								chevrons beside the handle was a second answer to the same
								question taking up the width of the first.

								They are round targets rather than bare glyphs, centred on
								the title's own line, and there is a real gap between them.
								The handle is drawn heavier than the × beside it: it is six
								dots, so its whole shape is stroke, and at the weight of the
								text it was a smudge rather than a thing to take hold of.
								As two 16px icons four pixels apart they were a pair of
								marks floating under the title — off its baseline, and with
								the one that removes the card close enough to the one you
								grab it by that reaching for the handle could take the card
								away instead. The gap is the whole point of the number.
							-->
							<div
								class="card-header pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-end gap-3"
							>
								<button
									onclick={() => hideCard(id)}
									class="card-control pointer-events-auto hover:text-red-600"
									title={t('home.hideThisCard')}
									aria-label={t('home.hideCard', { card: t(card.label) })}
								>
									<Icon name="close" size={16} />
								</button>
								<span
									class="card-control pointer-events-auto cursor-grab touch-none"
									title={t('home.dragCard', { card: t(card.label) })}
									aria-hidden="true"
									onpointerdown={(e) => grab(id, e)}
									onpointermove={dragTo}
									onpointerup={letGo}
									onpointercancel={letGo}
								>
									<Icon name="drag" size={20} class="icon-heavy" />
								</span>
							</div>
						{/if}
						{#if id === 'now'}{@render card_now()}
						{:else if id === 'todayTasks'}{@render card_todayTasks()}
						{:else if id === 'goals'}{@render card_goals()}
						{:else if id === 'habits'}{@render card_habits()}
						{:else if id === 'nextDays'}{@render card_nextDays()}
						{:else if id === 'weekPie'}{@render card_weekPie()}
						{:else if id === 'diary'}{@render card_diary()}
						{:else if id === 'bills'}{@render card_bills()}
						{:else if id === 'workouts'}{@render card_workouts()}
						{:else if id === 'shoppingList'}{@render card_shopping()}
						{:else if id === 'wishlist'}{@render card_wishlist()}
						{:else if id === 'quote'}{@render card_quote()}
						{:else if id === 'threeWins'}{@render card_threeWins()}
						{:else if id === 'latestTodos'}{@render card_latestTodos()}
						{:else if id === 'ideas'}{@render card_ideas()}
						{/if}
					</div>
				{/if}
			{/each}
		</div>

		{#if arranging}
			<!-- What the mode is for, once, at the end of the cards it is about.
			     The row of dashed "+ name" buttons that used to sit here is the
			     Widgets dialog now — see `WidgetPicker.svelte` for why. -->
			<p class="text-xs text-gray-500">{t('home.dragTheCardsByThe')}</p>
		{/if}

		<WidgetPicker
			bind:open={pickingWidgets}
			cards={data.cards}
			layout={order}
			ontoggle={toggleCard}
		/>

		<FormError message={form?.message} />
	</div>
{/if}

<style>
	/*
	 * While a card is being moved, its own corner belongs to the moving.
	 *
	 * The handle and the three buttons sit where "Open →" was, so the way in
	 * steps aside for the length of the rearranging — hidden rather than
	 * removed, since removing it would change the header's height and move
	 * every card under it at the moment somebody is trying to aim at one.
	 */
	.being-arranged :global(.card-actions) {
		visibility: hidden;
	}

	/*
	 * The header's right-hand corner, which holds two things at once.
	 *
	 * One grid cell with both states in it: the row is as wide and as tall as
	 * the larger of the two whichever is showing, so entering and leaving
	 * arrange mode cannot re-wrap the header and shove the cards down the
	 * page. `visibility` rather than `display`, because a box that is not
	 * drawn does not reserve anything.
	 */
	.dash-corner {
		display: grid;
		justify-items: end;
		/* The header wraps on a phone, and a lone item on the second line of a
		   `justify-between` row sits at its start. This keeps the corner a
		   corner at every width. */
		margin-left: auto;
	}

	.dash-corner-state {
		grid-area: 1 / 1;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.dash-corner-state.is-away {
		visibility: hidden;
	}

	/*
	 * A day in the three-day card.
	 *
	 * A rule down the left rather than a box around each: three bordered boxes
	 * inside a bordered card is four frames deep, and the card already says
	 * where it ends. Today's wears the card's own accent, which is the one
	 * difference between the three columns that has to be visible at a glance.
	 */
	.day-column {
		padding-left: 0.625rem;
		border-left: 2px solid var(--color-gray-200);
	}

	.day-column.is-today {
		border-left-color: var(--card-accent, var(--color-gray-400));
	}
</style>
