<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import type { GoalBacklink } from '$lib/server/services/backlinks';

	/**
	 * What this thing belongs to.
	 *
	 * Every relation in this app was one-directional in the interface: a goal
	 * listed its tasks and a notebook listed its todos, while the task itself
	 * knew nothing about either. You wrote the todo *because* of the goal, and a
	 * week later the todo is the only thing in front of you.
	 *
	 * One quiet line, deliberately small. Seeing the goal is a reminder rather
	 * than information, and a task carrying three goal names at full weight
	 * reads as three tasks.
	 */
	let {
		goals = [],
		notebook = null
	}: {
		goals?: GoalBacklink[];
		notebook?: { id: number; title: string } | null;
	} = $props();
</script>

{#if goals.length || notebook}
	<p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
		{#if notebook}
			<a
				href={resolve('/notebooks/[id]', { id: String(notebook.id) })}
				class="inline-flex items-center gap-1 hover:text-gray-900 hover:underline"
				title="Notebook"
			>
				<Icon name="notebook" size={12} />
				{notebook.title}
			</a>
		{/if}
		{#each goals as goal (goal.id)}
			<a
				href="{resolve('/goals')}#goal-{goal.id}"
				class="inline-flex items-center gap-1 hover:text-gray-900 hover:underline {goal.status ===
				'open'
					? ''
					: 'line-through'}"
				title={goal.status === 'open' ? 'Goal' : `Goal — ${goal.status}`}
			>
				<Icon name="goals" size={12} />
				{goal.title}
			</a>
		{/each}
	</p>
{/if}
