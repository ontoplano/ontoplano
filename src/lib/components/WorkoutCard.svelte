<script lang="ts">
	/**
	 * One workout, wherever a workout is shown.
	 *
	 * Written inside the Health room, so a workout filed under a subject was a
	 * title and a category: no plan, no register of what was actually done, no
	 * tick for "done just now", no way to put it on a day. The plan is the
	 * intention and the sessions are the record, and they belong on the same
	 * panel — which is exactly what a notebook's tab was missing.
	 *
	 * The same move as `GoalCard`, `IdeaCard`, `BillRow` and `HabitCard`. Where
	 * it posts is a prop (`$lib/workout-action-names`); the forms that write a
	 * session are the room's own dialogs, so the card asks for them by callback
	 * rather than carrying them.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import Written from '$lib/components/Written.svelte';
	import { enhance } from '$lib/enhance';
	import { dateOf, dayOf as shortDay } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import type { WorkoutActionNames } from '$lib/workout-action-names';
	import { useT } from '$lib/i18n';

	const t = useT();
	const now = useWhen();

	/** What a card needs off a workout — `listWorkouts` gives exactly this. */
	type Shown = {
		id: number;
		title: string;
		categoryName: string | null;
		plan: string;
		minutes: number | null;
		lastDoneAt: string | null;
	};

	type Session = {
		id: number;
		workoutId: number;
		doneOn: string;
		notes: string;
		measures: { id: number; activity: string; amount: number | null; unit: string }[];
	};

	let {
		workout,
		/** The register: every session, of every workout. Narrowed here. */
		sessions,
		actions,
		onedit,
		onlog,
		onschedule,
		onsession,
		ondeletesession,
		/**
		 * Whether the plan is unfolded, where the screen decides.
		 *
		 * Null means the card decides for itself. The Health room passes it,
		 * because only one workout is open there at a time.
		 */
		expanded = null,
		onexpand
	}: {
		workout: Shown;
		sessions: Session[];
		actions: WorkoutActionNames;
		onedit?: (id: number) => void;
		onlog?: (id: number) => void;
		onschedule?: (id: number) => void;
		onsession?: (workoutId: number, sessionId: number) => void;
		ondeletesession?: (sessionId: number) => void;
		expanded?: boolean | null;
		onexpand?: (id: number) => void;
	} = $props();

	let ownExpanded = $state(false);
	const open = $derived(expanded ?? ownExpanded);

	const history = $derived(sessions.filter((one) => one.workoutId === workout.id));

	function toggleExpanded() {
		if (onexpand) onexpand(workout.id);
		else ownExpanded = !ownExpanded;
	}

	/** The day a session was done, short — the year is almost always this one. */
	function dayOf(iso: string): string {
		const day = new Date(`${iso}T00:00:00`);
		if (Number.isNaN(day.getTime())) return iso;
		const thisYear = day.getFullYear() === new Date().getFullYear();
		return thisYear ? shortDay(day, now()) : dateOf(day, now());
	}
</script>

<li class="list-row">
	<button
		class="list-row-main text-left"
		aria-label={t('health.workouts.showThePlanFor', { title: workout.title })}
		aria-expanded={open}
		onclick={toggleExpanded}
	>
		<span class="font-medium text-gray-900">
			<Icon name={open ? 'chevron-down' : 'chevron-right'} />
			{workout.title}
		</span>
		<span class="block text-xs text-gray-500">
			{workout.categoryName ?? t('health.workouts.noCategory2')}{#if workout.minutes}{t(
					'health.workouts.aboutMinutes',
					{ minutes: workout.minutes }
				)}{/if}{#if workout.lastDoneAt}{t('health.workouts.lastDone', {
					date: workout.lastDoneAt.slice(0, 10)
				})}{/if}
		</span>
	</button>

	<div class="list-row-actions">
		<form method="post" action={actions.done} use:enhance>
			<input type="hidden" name="id" value={workout.id} />
			<button
				class="icon-btn"
				title={t('health.workouts.doneJustNow')}
				aria-label={t('health.workouts.markDone', { title: workout.title })}
			>
				<Icon name="check" />
			</button>
		</form>

		<!-- The tick says it happened; this says how much of what. -->
		<button
			class="icon-btn"
			title={t('health.workouts.writeDownWhatYouDid')}
			aria-label={t('health.workouts.writeDownWhatYouDid2', { title: workout.title })}
			onclick={() => onlog?.(workout.id)}
		>
			<Icon name="note" />
		</button>

		<button
			class="icon-btn"
			title={t('health.workouts.putItOnADay')}
			aria-label={t('health.workouts.planOntoADay', { title: workout.title })}
			onclick={() => onschedule?.(workout.id)}
		>
			<Icon name="calendar" />
		</button>

		<button
			class="icon-btn"
			aria-label={t('health.workouts.edit', { title: workout.title })}
			onclick={() => onedit?.(workout.id)}
		>
			<Icon name="edit" />
		</button>

		<form
			method="post"
			action={actions.archive}
			use:enhance
			title={t('health.workouts.putThisWorkoutAway')}
		>
			<input type="hidden" name="id" value={workout.id} />
			<input type="hidden" name="archived" value="true" />
			<button class="icon-btn" aria-label={t('health.workouts.archive', { title: workout.title })}>
				<Icon name="archive" />
			</button>
		</form>
	</div>

	{#if open}
		<div class="w-full space-y-3 border-t border-gray-100 pt-3">
			<div class="text-sm whitespace-pre-wrap text-gray-700">
				{#if workout.plan}{workout.plan}{:else}<span class="text-gray-500"
						>{t('health.workouts.noPlanWrittenYet')}</span
					>{/if}
			</div>

			<!--
						What was actually done, under the plan for it.

						The plan is the intention and this is the record, and they belong
						on the same panel: somebody opening a workout to see what it asks
						of them is the same person wondering what they managed last time.
					-->
			<div class="border-t border-gray-100 pt-3">
				<div class="mb-2 flex items-center justify-between">
					<h3 class="text-xs font-semibold tracking-wide text-gray-500 uppercase">
						{t('health.workouts.whatYouDid')}
					</h3>
					<button class="btn btn-sm" onclick={() => onlog?.(workout.id)}>
						<Icon name="plus" />
						{t('health.workouts.writeOneDown')}
					</button>
				</div>

				{#if history.length === 0}
					<p class="text-sm text-gray-500">
						{t('health.workouts.nothingWrittenDownYetRecord')}
					</p>
				{:else}
					<ul class="divide-y divide-gray-100 border-t border-gray-100">
						{#each history as session (session.id)}
							<li class="flex items-start gap-3 py-2 text-sm">
								<span class="tabular w-20 shrink-0 text-gray-500">{dayOf(session.doneOn)}</span>
								<div class="min-w-0 flex-1">
									{#if session.measures.length === 0}
										<span class="text-gray-500">{t('ui.done')}</span>
									{:else}
										<!--
														Each measure as three parts rather than one sentence.

														"benched 80 kg · for 10 reps · overhead pressed 44 kg" is a
														line you read; what somebody scanning a column of these
														wants is the figures, and they carried the same weight as
														the words around them. The number takes the emphasis and
														the tabular digits, so a month of sessions reads down the
														column as well as across.
													-->
										<span class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
											{#each session.measures as measure (measure.id)}
												<span class="inline-flex items-baseline gap-1">
													<span class="text-gray-500">{measure.activity}</span>
													{#if measure.amount !== null}
														<span class="tabular font-medium text-gray-900">{measure.amount}</span>
														{#if measure.unit}
															<span class="text-xs text-gray-500">{measure.unit}</span>
														{/if}
													{/if}
												</span>
											{/each}
										</span>
									{/if}
									{#if session.notes}
										<Written content={session.notes} compact />
									{/if}
								</div>
								<div class="flex shrink-0 items-center gap-1">
									<button
										class="icon-btn"
										title={t('health.workouts.correctThis')}
										aria-label={t('health.workouts.correctTheSessionOn', {
											doneOn: session.doneOn
										})}
										onclick={() => onsession?.(workout.id, session.id)}
									>
										<Icon name="edit" />
									</button>
									<button
										class="icon-btn icon-btn-danger"
										title={t('health.workouts.removeThis')}
										aria-label={t('health.workouts.removeTheSessionOn', {
											doneOn: session.doneOn
										})}
										onclick={() => ondeletesession?.(session.id)}
									>
										<Icon name="trash" />
									</button>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{/if}
</li>
