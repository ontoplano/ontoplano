<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
	let selectedBeliefIndex = $state(0);
	let expandedBeliefId: number | null = $state(null);
	let editingBeliefId: number | null = $state(null);
	let confirmingDeleteId: number | null = $state(null);

	let linkBeliefSelect: Record<number, number | null> = $state({});
	let linkEvidenceSelect: Record<number, number | null> = $state({});
	let newEvidenceContent: Record<number, string> = $state({});
	let linkHabitSelect: Record<number, number | null> = $state({});
	let intensityValue: Record<number, number> = $state({});
	let intensityNotes: Record<number, string> = $state({});
	let intensityDate: Record<number, string> = $state({});

	function beliefsList() {
		return data.beliefs;
	}

	function unlinkedBeliefs(sourceId: number) {
		const linkedIds =
			data.beliefs.find((b) => b.id === sourceId)?.relatedBeliefs.map((r) => r.beliefId) ?? [];
		return data.beliefs.filter((b) => b.id !== sourceId && !linkedIds.includes(b.id));
	}

	function unlinkedEvidence(beliefId: number) {
		const linkedIds =
			data.beliefs.find((b) => b.id === beliefId)?.linkedEvidence.map((e) => e.evidenceId) ?? [];
		return data.allEvidence.filter((e) => !linkedIds.includes(e.id));
	}

	function unlinkedHabits(beliefId: number) {
		const linkedIds =
			data.beliefs.find((b) => b.id === beliefId)?.linkedHabits.map((h) => h.habitId) ?? [];
		return data.allHabits.filter((h) => !linkedIds.includes(h.id));
	}

	function latestIntensity(beliefId: number) {
		const intensities = data.beliefs.find((b) => b.id === beliefId)?.intensities ?? [];
		return intensities.length > 0 ? intensities[0].value : null;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		const beliefs = beliefsList();

		switch (e.key) {
			case 'j':
				e.preventDefault();
				selectedBeliefIndex = Math.min(selectedBeliefIndex + 1, beliefs.length - 1);
				break;
			case 'k':
				e.preventDefault();
				selectedBeliefIndex = Math.max(selectedBeliefIndex - 1, 0);
				break;
			case 'n':
				e.preventDefault();
				showForm = true;
				editingBeliefId = null;
				confirmingDeleteId = null;
				tick().then(() => {
					const ta = document.querySelector<HTMLTextAreaElement>('textarea[name="content"]');
					ta?.focus();
				});
				break;
			case 'Enter':
				e.preventDefault();
				if (beliefs.length > 0) {
					const belief = beliefs[selectedBeliefIndex];
					expandedBeliefId = expandedBeliefId === belief.id ? null : belief.id;
				}
				break;
			case 'e':
				e.preventDefault();
				if (beliefs.length > 0) {
					const belief = beliefs[selectedBeliefIndex];
					expandedBeliefId = belief.id;
					editingBeliefId = belief.id;
					tick().then(() => {
						const ta = document.querySelector<HTMLTextAreaElement>('.edit-belief-textarea');
						ta?.focus();
					});
				}
				break;
			case 'Escape':
				e.preventDefault();
				showForm = false;
				expandedBeliefId = null;
				editingBeliefId = null;
				confirmingDeleteId = null;
				break;
		}
	}

	function initIntensityForm(beliefId: number) {
		if (!(beliefId in intensityValue)) {
			intensityValue[beliefId] = 5;
			intensityNotes[beliefId] = '';
			intensityDate[beliefId] = data.today;
		}
	}

	function getIntensityBarHeight(value: number): string {
		return `${Math.round((value / 10) * 40)}px`;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-bold text-gray-900">Beliefs</h1>
		<button
			onclick={() => {
				showForm = !showForm;
				editingBeliefId = null;
				confirmingDeleteId = null;
				if (!showForm) return;
				tick().then(() => {
					const ta = document.querySelector<HTMLTextAreaElement>('textarea[name="content"]');
					ta?.focus();
				});
			}}
			class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
		>
			{showForm ? 'Cancel' : 'New Belief'}
		</button>
	</div>

	<div class="text-xs text-gray-400">
		<kbd class="border border-gray-300 bg-gray-50 px-1">j</kbd>/<kbd
			class="border border-gray-300 bg-gray-50 px-1">k</kbd
		>
		navigate &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">n</kbd> new &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">Enter</kbd> expand &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">e</kbd> edit &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">Esc</kbd> close
	</div>

	{#if form?.message}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{form.message}
		</div>
	{/if}

	{#if showForm}
		<form
			method="post"
			action="?/create"
			use:enhance={() => {
				return async ({ update }) => {
					await update();
					showForm = false;
				};
			}}
			class="space-y-3 border border-gray-200 bg-white p-4 shadow-sm"
		>
			<label class="block">
				<span class="text-sm font-medium text-gray-700">Belief</span>
				<textarea
					name="content"
					required
					rows="3"
					placeholder="vivid, first person, present tense, highly specific"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				></textarea>
			</label>
			<button
				type="submit"
				class="bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
			>
				Create
			</button>
		</form>
	{/if}

	{#if beliefsList().length === 0}
		<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
			No beliefs yet. Add one to start reconsolidation work.
		</div>
	{:else}
		<div class="space-y-3">
			{#each beliefsList() as belief, i (belief.id)}
				{@const isExpanded = expandedBeliefId === belief.id}
				{@const isEditing = editingBeliefId === belief.id}
				{@const latest = latestIntensity(belief.id)}
				{@const outgoingRelations = belief.relatedBeliefs.filter((r) => r.direction === 'outgoing')}
				{@const incomingRelations = belief.relatedBeliefs.filter((r) => r.direction === 'incoming')}
				<div
					class="border border-gray-200 bg-white shadow-sm {i === selectedBeliefIndex
						? 'ring-2 ring-gray-900 ring-inset'
						: ''}"
				>
					<div class="flex items-center gap-4 px-4 py-3">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="text-sm font-medium text-gray-900">{belief.content}</span>
								{#if latest}
									<span class="text-xs font-medium text-gray-600">{latest}/10</span>
								{/if}
							</div>
							<div class="flex items-center gap-3 text-xs text-gray-400">
								<span>{outgoingRelations.length + incomingRelations.length} related</span>
								<span>{belief.linkedEvidence.length} evidence</span>
								{#if belief.linkedHabits.length > 0}
									<span
										>{belief.linkedHabits.length}
										linked habit{belief.linkedHabits.length === 1 ? '' : 's'}</span
									>
								{/if}
							</div>
						</div>

						<div class="flex shrink-0 items-center gap-2">
							<button
								onclick={() => {
									expandedBeliefId = isExpanded ? null : belief.id;
									editingBeliefId = null;
									confirmingDeleteId = null;
								}}
								class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
							>
								{isExpanded ? 'Collapse' : 'Expand'}
							</button>
							{#if confirmingDeleteId === belief.id}
								<form method="post" action="?/delete" use:enhance>
									<input type="hidden" name="id" value={belief.id} />
									<button
										type="submit"
										class="border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100"
									>
										Confirm?
									</button>
								</form>
							{:else}
								<button
									onclick={() => {
										confirmingDeleteId = belief.id;
									}}
									class="border border-red-200 bg-white px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
								>
									Delete
								</button>
							{/if}
						</div>
					</div>

					{#if isExpanded}
						<div>
							{#if isEditing}
								<div class="border-t border-gray-200 px-4 py-3">
									<form
										method="post"
										action="?/update"
										use:enhance={() => {
											return async ({ update }) => {
												await update();
												editingBeliefId = null;
											};
										}}
										class="space-y-3"
									>
										<input type="hidden" name="id" value={belief.id} />
										<label class="block">
											<span class="text-xs font-medium text-gray-500">Edit Belief</span>
											<textarea
												name="content"
												required
												rows="2"
												class="edit-belief-textarea mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
												>{belief.content}</textarea
											>
										</label>
										<div class="flex gap-2">
											<button
												type="submit"
												class="bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
											>
												Save
											</button>
											<button
												type="button"
												onclick={() => {
													editingBeliefId = null;
												}}
												class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
											>
												Cancel
											</button>
										</div>
									</form>
								</div>
							{:else}
								<button
									onclick={() => {
										editingBeliefId = belief.id;
									}}
									class="w-full border-t border-gray-200 px-4 py-2 text-left text-xs text-gray-400 transition hover:bg-gray-50"
								>
									Edit belief
								</button>
							{/if}

							<div class="border-t border-gray-200 px-4 py-3">
								<div class="mb-2">
									<span class="text-xs font-medium text-gray-500">Related Beliefs</span>
								</div>
								{#if outgoingRelations.length > 0}
									<div class="mb-3 space-y-2">
										{#each outgoingRelations as rel (rel.relationId)}
											<div class="flex items-center justify-between gap-2">
												<div class="flex items-center gap-2">
													<span class="text-xs text-gray-400">this</span>
													<span
														class="{rel.type === 'supports'
															? 'border border-green-200 bg-green-50 text-green-700'
															: 'border border-red-200 bg-red-50 text-red-700'} px-1.5 py-0.5 text-xs"
													>
														{rel.type}
													</span>
													<span class="text-xs text-gray-400">that</span>
													<span class="text-sm text-gray-700">{rel.beliefContent}</span>
												</div>
												<form method="post" action="?/removeRelation" use:enhance>
													<input type="hidden" name="id" value={rel.relationId} />
													<button
														type="submit"
														class="text-xs text-gray-400 transition hover:text-red-500"
													>
														&times;
													</button>
												</form>
											</div>
										{/each}
									</div>
								{/if}
								{#if incomingRelations.length > 0}
									<div class="mb-3 space-y-2">
										{#each incomingRelations as rel (rel.relationId)}
											<div class="flex items-center justify-between gap-2">
												<div class="flex items-center gap-2">
													<span class="text-sm text-gray-700">{rel.beliefContent}</span>
													<span
														class="{rel.type === 'supports'
															? 'border border-green-200 bg-green-50 text-green-700'
															: 'border border-red-200 bg-red-50 text-red-700'} px-1.5 py-0.5 text-xs"
													>
														{rel.type}
													</span>
													<span class="text-xs text-gray-400">this</span>
												</div>
												<form method="post" action="?/removeRelation" use:enhance>
													<input type="hidden" name="id" value={rel.relationId} />
													<button
														type="submit"
														class="text-xs text-gray-400 transition hover:text-red-500"
													>
														&times;
													</button>
												</form>
											</div>
										{/each}
									</div>
								{/if}
								{#if unlinkedBeliefs(belief.id).length > 0}
									<form
										method="post"
										action="?/addRelation"
										use:enhance
										class="flex flex-wrap gap-2"
									>
										<input type="hidden" name="sourceBeliefId" value={belief.id} />
										<select
											name="targetBeliefId"
											bind:value={linkBeliefSelect[belief.id]}
											class="border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
										>
											<option value={null}>Select belief...</option>
											{#each unlinkedBeliefs(belief.id) as b (b.id)}
												<option value={b.id}>{b.content}</option>
											{/each}
										</select>
										<select
											name="type"
											class="border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
										>
											<option value="supports">supports</option>
											<option value="contradicts">contradicts</option>
										</select>
										<button
											type="submit"
											disabled={!linkBeliefSelect[belief.id]}
											class="border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
										>
											Link
										</button>
									</form>
								{/if}
							</div>

							<div class="border-t border-gray-200 px-4 py-3">
								<div class="mb-2">
									<span class="text-xs font-medium text-gray-500">Evidence</span>
								</div>
								{#if belief.linkedEvidence.length > 0}
									<div class="mb-3 space-y-2">
										{#each belief.linkedEvidence as ev (ev.linkId)}
											<div class="flex items-center justify-between gap-2">
												<div class="flex items-center gap-2">
													<span
														class="{ev.type === 'supports'
															? 'border border-green-200 bg-green-50 text-green-700'
															: 'border border-red-200 bg-red-50 text-red-700'} px-1.5 py-0.5 text-xs"
													>
														{ev.type}
													</span>
													<span class="text-sm text-gray-700">{ev.evidenceContent}</span>
												</div>
												<div class="flex items-center gap-2">
													<form method="post" action="?/deleteEvidence" use:enhance>
														<input type="hidden" name="id" value={ev.evidenceId} />
														<button
															type="submit"
															class="text-xs text-gray-400 transition hover:text-red-500"
															title="Delete evidence"
														>
															del
														</button>
													</form>
													<form method="post" action="?/unlinkEvidence" use:enhance>
														<input type="hidden" name="id" value={ev.linkId} />
														<button
															type="submit"
															class="text-xs text-gray-400 transition hover:text-red-500"
														>
															&times;
														</button>
													</form>
												</div>
											</div>
										{/each}
									</div>
								{/if}
								<div class="space-y-2">
									{#if unlinkedEvidence(belief.id).length > 0}
										<form
											method="post"
											action="?/linkEvidence"
											use:enhance
											class="flex flex-wrap gap-2"
										>
											<input type="hidden" name="beliefId" value={belief.id} />
											<select
												name="evidenceId"
												bind:value={linkEvidenceSelect[belief.id]}
												class="border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
											>
												<option value={null}>Link existing evidence...</option>
												{#each unlinkedEvidence(belief.id) as ev (ev.id)}
													<option value={ev.id}>{ev.content}</option>
												{/each}
											</select>
											<select
												name="type"
												class="border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
											>
												<option value="supports">supports</option>
												<option value="contradicts">contradicts</option>
											</select>
											<button
												type="submit"
												disabled={!linkEvidenceSelect[belief.id]}
												class="border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
											>
												Link
											</button>
										</form>
									{/if}
									<form
										method="post"
										action="?/createEvidence"
										use:enhance={() => {
											return async ({ update }) => {
												await update();
												newEvidenceContent[belief.id] = '';
											};
										}}
										class="flex flex-wrap gap-2"
									>
										<input type="hidden" name="beliefId" value={belief.id} />
										<input
											name="content"
											type="text"
											placeholder="new evidence..."
											bind:value={newEvidenceContent[belief.id]}
											class="flex-1 border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
										/>
										<select
											name="type"
											class="border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
										>
											<option value="supports">supports</option>
											<option value="contradicts">contradicts</option>
										</select>
										<button
											type="submit"
											disabled={!newEvidenceContent[belief.id]?.trim()}
											class="border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
										>
											Create
										</button>
									</form>
								</div>
							</div>

							<div class="border-t border-gray-200 px-4 py-3">
								<div class="mb-2">
									<span class="text-xs font-medium text-gray-500">Intensity</span>
								</div>

								{#if belief.intensities.length > 0}
									<div class="mb-3 flex items-end gap-1" style="height: 44px">
										{#each belief.intensities.slice(0, 20).toReversed() as intensity (intensity.id)}
											<div
												class="w-4 bg-gray-900"
												style="height: {getIntensityBarHeight(intensity.value)}"
												title="{intensity.date}: {intensity.value}/10{intensity.notes
													? ` - ${intensity.notes}`
													: ''}"
											></div>
										{/each}
									</div>
									<div class="mb-3 space-y-1">
										{#each belief.intensities.slice(0, 5) as intensity (intensity.id)}
											<div class="flex items-center justify-between text-xs">
												<span class="text-gray-500">{intensity.date}</span>
												<span class="font-medium text-gray-900">{intensity.value}/10</span>
												{#if intensity.notes}
													<span class="text-gray-400">{intensity.notes}</span>
												{/if}
											</div>
										{/each}
										{#if belief.intensities.length > 5}
											<div class="text-xs text-gray-400">
												and {belief.intensities.length - 5} more...
											</div>
										{/if}
									</div>
								{/if}

								<div class="border border-gray-100 bg-gray-50 p-3">
									<form
										method="post"
										action="?/logIntensity"
										use:enhance={() => {
											return async ({ update }) => {
												await update();
												intensityValue[belief.id] = 5;
												intensityNotes[belief.id] = '';
											};
										}}
										class="space-y-2"
									>
										<input type="hidden" name="beliefId" value={belief.id} />
										<div class="flex items-center gap-3">
											<input
												type="range"
												name="value"
												min="1"
												max="10"
												value={intensityValue[belief.id] ?? 5}
												oninput={(e) => {
													initIntensityForm(belief.id);
													intensityValue[belief.id] = parseInt(
														(e.target as HTMLInputElement).value
													);
												}}
												class="flex-1"
											/>
											<span class="w-8 text-center text-sm font-medium text-gray-900"
												>{intensityValue[belief.id] ?? 5}</span
											>
										</div>
										<div class="flex gap-2">
											<input
												name="date"
												type="date"
												value={intensityDate[belief.id] ?? data.today}
												oninput={(e) => {
													initIntensityForm(belief.id);
													intensityDate[belief.id] = (e.target as HTMLInputElement).value;
												}}
												class="border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
											/>
											<input
												name="notes"
												type="text"
												placeholder="optional notes"
												value={intensityNotes[belief.id] ?? ''}
												oninput={(e) => {
													initIntensityForm(belief.id);
													intensityNotes[belief.id] = (e.target as HTMLInputElement).value;
												}}
												class="flex-1 border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
											/>
											<button
												type="submit"
												class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
											>
												Log
											</button>
										</div>
									</form>
								</div>
							</div>

							<div class="border-t border-gray-200 px-4 py-3">
								<div class="mb-2">
									<span class="text-xs font-medium text-gray-500">Linked Habits</span>
								</div>
								<div class="mb-3 space-y-2">
									{#each belief.linkedHabits as linked (linked.linkId)}
										<div class="flex items-center justify-between gap-2">
											<div class="flex items-center gap-2">
												<span class="text-sm text-gray-700">{linked.habitName}</span>
												<span
													class="text-xs {linked.habitType === 'bad'
														? 'text-red-500'
														: 'text-green-600'}">{linked.habitType}</span
												>
											</div>
											<form method="post" action="?/unlinkHabit" use:enhance>
												<input type="hidden" name="id" value={linked.linkId} />
												<button
													type="submit"
													class="text-xs text-gray-400 transition hover:text-red-500"
												>
													&times;
												</button>
											</form>
										</div>
									{/each}
								</div>
								{#if unlinkedHabits(belief.id).length > 0}
									<form method="post" action="?/linkHabit" use:enhance class="flex gap-2">
										<input type="hidden" name="beliefId" value={belief.id} />
										<select
											name="habitId"
											bind:value={linkHabitSelect[belief.id]}
											class="flex-1 border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
										>
											<option value={null}>Select habit...</option>
											{#each unlinkedHabits(belief.id) as habit (habit.id)}
												<option value={habit.id}>{habit.name}</option>
											{/each}
										</select>
										<button
											type="submit"
											disabled={!linkHabitSelect[belief.id]}
											class="border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
										>
											Link
										</button>
									</form>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
