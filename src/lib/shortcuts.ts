export interface Shortcut {
	key: string;
	description: string;
}

export interface PageShortcuts {
	label: string;
	shortcuts: Shortcut[];
}

export const GLOBAL_SHORTCUTS: Shortcut[] = [
	{ key: 'J', description: 'Next page' },
	{ key: 'K', description: 'Previous page' },
	{ key: 'Esc', description: 'Close form' },
	{ key: '?', description: 'Toggle shortcut help' }
];

export const PAGE_SHORTCUTS: Record<string, PageShortcuts> = {
	'/': {
		label: 'Dashboard',
		shortcuts: [
			{ key: 'n', description: 'New diary entry' },
			{ key: 'w', description: 'New wins' }
		]
	},
	'/planner/track': {
		label: 'Track',
		shortcuts: [
			{ key: 'j/k', description: 'Navigate tasks' },
			{ key: 'h/l', description: 'Switch day' },
			{ key: '[/]', description: 'Switch week' },
			{ key: 'c', description: 'Mark done' },
			{ key: 'd', description: 'Mark delayed' },
			{ key: 'e', description: 'Mark early' },
			{ key: 's', description: 'Mark skipped' },
			{ key: 'r', description: 'Reset status' },
			{ key: 't', description: 'Edit time' },
			{ key: 'D', description: 'Edit duration' },
			{ key: 'a', description: 'Edit activity' },
			{ key: 'x', description: 'Delete task' }
		]
	},
	'/planner/plan': {
		label: 'Plan',
		shortcuts: [
			{ key: 'j/k', description: 'Navigate slots' },
			{ key: 'h/l', description: 'Switch day' },
			{ key: '[/]', description: 'Switch week' },
			{ key: 'n', description: 'New slot' },
			{ key: 'N', description: 'New exceptional slot' },
			{ key: 'e', description: 'Edit slot' },
			{ key: 'd', description: 'Toggle active' },
			{ key: 'D', description: 'Delete slot' },
			{ key: 'v', description: 'Toggle multiselect' },
			{ key: 'Space', description: 'Select/deselect (multiselect)' },
			{ key: 'x', description: 'Delete selected (multiselect)' },
			{ key: 'p', description: 'Copy to days (multiselect)' }
		]
	},
	'/planner/activities': {
		label: 'Activities',
		shortcuts: [
			{ key: 'j/k', description: 'Navigate list' },
			{ key: 'n', description: 'New activity' },
			{ key: '1-9', description: 'Toggle category filter' }
		]
	},
	'/planner/history': {
		label: 'History',
		shortcuts: [
			{ key: 'j/k', description: 'Navigate tasks' },
			{ key: 'h/l', description: 'Switch day' },
			{ key: '[/]', description: 'Switch week' }
		]
	},
	'/planner/todo': {
		label: 'Todo',
		shortcuts: [
			{ key: 'j/k', description: 'Navigate list' },
			{ key: 'n', description: 'New todo' },
			{ key: 'e', description: 'Edit todo' },
			{ key: 'c', description: 'Toggle done' },
			{ key: 'g', description: 'Delegate' },
			{ key: 'x', description: 'Delete' }
		]
	},
	'/diary': {
		label: 'Diary',
		shortcuts: [
			{ key: 'j/k', description: 'Navigate entries' },
			{ key: 'n', description: 'New entry' },
			{ key: 'e', description: 'Edit entry' }
		]
	},
	'/ideas': {
		label: 'Ideas',
		shortcuts: [
			{ key: 'j/k', description: 'Navigate ideas' },
			{ key: 'n', description: 'New idea' },
			{ key: 'e', description: 'Edit idea' }
		]
	},
	'/shopping': {
		label: 'Shopping',
		shortcuts: [
			{ key: 'j/k', description: 'Navigate items' },
			{ key: 'n', description: 'New item' },
			{ key: 'e', description: 'Edit item' },
			{ key: 'd', description: 'Delete item' },
			{ key: 'D', description: 'Toggle done' },
			{ key: 'z', description: 'Snooze/unsnooze' },
			{ key: '1', description: 'Toggle someday filter' },
			{ key: '2', description: 'Toggle replenish filter' },
			{ key: 'b', description: 'Toggle show bought' },
			{ key: 's', description: 'Toggle show snoozed' }
		]
	},
	'/health/habits': {
		label: 'Habits',
		shortcuts: [
			{ key: 'j/k', description: 'Navigate habits' },
			{ key: 'n', description: 'New habit' },
			{ key: 'Enter', description: 'Expand/collapse' }
		]
	},
	'/beliefs': {
		label: 'Beliefs',
		shortcuts: [
			{ key: 'j/k', description: 'Navigate beliefs' },
			{ key: 'n', description: 'New belief' },
			{ key: 'Enter', description: 'Expand/collapse' },
			{ key: 'e', description: 'Edit belief' }
		]
	},
	'/services': {
		label: 'Services',
		shortcuts: [
			{ key: 'j/k', description: 'Navigate services' },
			{ key: 'Enter', description: 'Expand/collapse' }
		]
	}
};
