<script lang="ts">
	import FormError from '$lib/components/FormError.svelte';
	import TodoRows from '$lib/components/TodoRows.svelte';
	import { TODO_ROOM_ACTIONS } from '$lib/todo-actions';
	import type { PageServerData, ActionData } from './$types.js';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();
</script>

<FormError message={form?.message} />

<!--
	The room is the list. Everything on this page is the same component a
	notebook's Tasks tab uses — see `TodoRows` — so a todo behaves the same way
	wherever somebody finds it.
-->
<TodoRows
	todos={data.todos}
	categories={data.categories}
	notebooks={data.notebooks}
	goalLinks={data.goalLinks.todos}
	actions={TODO_ROOM_ACTIONS}
	error={form?.message}
	shortcutRoom="/tasks/todo"
	listTour="todo-list"
	newTour="todo-new"
/>
