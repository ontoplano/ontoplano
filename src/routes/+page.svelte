<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	let selectedIndex = $state(0);

	const statusOptions = [
		{ value: 'completed', label: 'Done', key: 'c' },
		{ value: 'delayed', label: 'Delayed', key: 'd' },
		{ value: 'early', label: 'Early', key: 'e' },
		{ value: 'skipped', label: 'Skip', key: 's' },
		{ value: 'pending', label: 'Reset', key: 'r' }
	];

	const categoryColors: Record<string, string> = {
		duty: 'border-l-duty bg-duty-light/30',
		skill: 'border-l-skill bg-skill-light/30',
		money: 'border-l-money bg-money-light/30'
	};

	function isFuture(scheduledAt: string): boolean {
		return scheduledAt > data.now;
	}

	function statusBadgeClass(status: string): string {
		const map: Record<string, string> = {
			pending: 'bg-gray-100 text-gray-600',
			completed: 'bg-green-100 text-green-700',
			delayed: 'bg-yellow-100 text-yellow-700',
			early: 'bg-blue-100 text-blue-700',
			skipped: 'bg-red-100 text-red-700'
		};
		return map[status] ?? 'bg-gray-100 text-gray-600';
	}

	function formatTime(scheduledAt: string): string {
		return scheduledAt.slice(11, 16);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

		const tasks = data.tasks;
		if (!tasks.length) return;

		switch (e.key) {
			case 'j':
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, tasks.length - 1);
				break;
			case 'k':
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, 0);
				break;
			case 'c':
			case 'd':
			case 'e':
			case 's':
			case 'r': {
				e.preventDefault();
				const opt = statusOptions.find((o) => o.key === e.key);
				if (opt) {
					const form = document.getElementById(`status-form-${tasks[selectedIndex].id}`);
					if (form instanceof HTMLFormElement) {
						const statusInput = form.querySelector<HTMLInputElement>('input[name="status"]');
						if (statusInput) {
							statusInput.value = opt.value;
							form.requestSubmit();
						}
					}
				}
				break;
			}
		}
	}

	function taskLabel(task: (typeof data.tasks)[number]): string {
		if (task.slotMode === 'activity' && task.activityName) return task.activityName;
		if (task.slotLabel) return task.slotLabel;
		if (task.categoryName) return task.categoryName;
		return 'Task';
	}

	$effect(() => {
		if (selectedIndex >= data.tasks.length && data.tasks.length > 0) {
			selectedIndex = data.tasks.length - 1;
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-bold text-gray-900">Today</h1>
		<div class="text-sm text-gray-500">
			{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
		</div>
	</div>

	<div class="mb-2 text-xs text-gray-400">
		<kbd class="border border-gray-300 bg-gray-50 px-1">j</kbd>/<kbd
			class="border border-gray-300 bg-gray-50 px-1">k</kbd
		>
		navigate &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">c</kbd> done
		<kbd class="border border-gray-300 bg-gray-50 px-1">d</kbd> delayed
		<kbd class="border border-gray-300 bg-gray-50 px-1">e</kbd> early
		<kbd class="border border-gray-300 bg-gray-50 px-1">s</kbd> skip
		<kbd class="border border-gray-300 bg-gray-50 px-1">r</kbd> reset
	</div>

	{#if data.tasks.length === 0}
		<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
			No tasks scheduled for today. Add slots in the <a href="/planner" class="underline">Planner</a
			>.
		</div>
	{:else}
		<div class="divide-y divide-gray-200 border border-gray-200 bg-white shadow-sm">
			{#each data.tasks as task, i}
				{@const future = isFuture(task.scheduledAt)}
				{@const colorClass = categoryColors[task.categoryName ?? ''] ?? 'border-l-gray-300'}
				<div
					class="flex items-center gap-4 border-l-4 px-4 py-3 transition-colors {colorClass} {i ===
					selectedIndex
						? 'ring-2 ring-gray-900 ring-inset'
						: ''} {future ? 'opacity-50' : ''}"
				>
					<div class="w-12 shrink-0 font-mono text-sm text-gray-500">
						{formatTime(task.scheduledAt)}
					</div>

					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<span class="truncate text-sm font-medium text-gray-900">{taskLabel(task)}</span>
							{#if task.slotMode === 'activity' && task.categoryName}
								<span class="text-xs text-gray-400">{task.categoryName}</span>
							{/if}
						</div>
						{#if task.slotDuration && task.slotDuration !== 60}
							<span class="text-xs text-gray-400">{task.slotDuration}min</span>
						{/if}
					</div>

					<span class="shrink-0 px-2 py-0.5 text-xs font-medium {statusBadgeClass(task.status)}">
						{task.status}
					</span>

					<form
						id="status-form-{task.id}"
						method="post"
						action="?/updateStatus"
						use:enhance
						class="flex shrink-0 gap-1"
					>
						<input type="hidden" name="id" value={task.id} />
						<input type="hidden" name="status" value="pending" />
						{#each statusOptions as opt}
							<button
								type="submit"
								onclick={(e) => {
									const form = (e.currentTarget as HTMLButtonElement).closest('form');
									const input = form?.querySelector<HTMLInputElement>('input[name="status"]');
									if (input) input.value = opt.value;
								}}
								class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
								title="{opt.label} ({opt.key})"
							>
								{opt.label}
							</button>
						{/each}
					</form>
				</div>
			{/each}
		</div>
	{/if}
</div>
