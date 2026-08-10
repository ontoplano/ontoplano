export interface ShortcutBinding {
	key: string;
	action: string;
	description: string;
}

export interface PageShortcuts {
	label: string;
	shortcuts: ShortcutBinding[];
}

export const GLOBAL_SHORTCUTS: ShortcutBinding[] = [
	{ key: 'J', action: 'global-next-page', description: 'Next page' },
	{ key: 'K', action: 'global-prev-page', description: 'Previous page' },
	{ key: 'Escape', action: 'global-close', description: 'Close form' },
	{ key: '?', action: 'global-help', description: 'Toggle shortcut help' }
];

export const PAGE_SHORTCUTS: Record<string, PageShortcuts> = {
	'/': {
		label: 'Dashboard',
		shortcuts: [
			{ key: 'n', action: 'new-diary', description: 'New diary entry' },
			{ key: 'w', action: 'new-wins', description: 'New wins' }
		]
	},
	'/planner/track': {
		label: 'Track',
		shortcuts: [
			{ key: 'j', action: 'navigate-down', description: 'Navigate tasks' },
			{ key: 'k', action: 'navigate-up', description: 'Navigate tasks' },
			{ key: 'h', action: 'prev-day', description: 'Switch day' },
			{ key: 'l', action: 'next-day', description: 'Switch day' },
			{ key: '[', action: 'prev-week', description: 'Switch week' },
			{ key: ']', action: 'next-week', description: 'Switch week' },
			{ key: 'c', action: 'mark-done', description: 'Mark done' },
			{ key: 'd', action: 'mark-delayed', description: 'Mark delayed' },
			{ key: 'e', action: 'mark-early', description: 'Mark early' },
			{ key: 's', action: 'mark-skipped', description: 'Mark skipped' },
			{ key: 'r', action: 'reset-status', description: 'Reset status' },
			{ key: 't', action: 'edit-time', description: 'Edit time' },
			{ key: 'D', action: 'edit-duration', description: 'Edit duration' },
			{ key: 'a', action: 'edit-activity', description: 'Edit activity' },
			{ key: 'x', action: 'delete', description: 'Delete task' }
		]
	},
	'/planner/plan': {
		label: 'Plan',
		shortcuts: [
			{ key: 'j', action: 'navigate-down', description: 'Navigate slots' },
			{ key: 'k', action: 'navigate-up', description: 'Navigate slots' },
			{ key: 'g', action: 'toggle-view', description: 'Toggle list/grid view' },
			{ key: '+', action: 'zoom-in', description: 'Zoom in (grid)' },
			{ key: '=', action: 'zoom-in', description: 'Zoom in (grid)' },
			{ key: '-', action: 'zoom-out', description: 'Zoom out (grid)' },
			{ key: '0', action: 'zoom-reset', description: 'Reset zoom (grid)' },
			{ key: 'h', action: 'prev-day', description: 'Switch day' },
			{ key: 'l', action: 'next-day', description: 'Switch day' },
			{ key: '[', action: 'prev-week', description: 'Switch week' },
			{ key: ']', action: 'next-week', description: 'Switch week' },
			{ key: 'n', action: 'new', description: 'New slot' },
			{ key: 'N', action: 'new-exceptional', description: 'New exceptional slot' },
			{ key: 'e', action: 'edit', description: 'Edit slot' },
			{ key: 'd', action: 'toggle-active', description: 'Toggle active' },
			{ key: 'D', action: 'delete', description: 'Delete slot' },
			{ key: 'v', action: 'toggle-multiselect', description: 'Toggle multiselect' },
			{ key: ' ', action: 'toggle-select', description: 'Select/deselect (multiselect)' },
			{ key: 'x', action: 'delete-selected', description: 'Delete selected (multiselect)' },
			{ key: 'p', action: 'copy-to-days', description: 'Copy to days (multiselect)' }
		]
	},
	'/planner/activities': {
		label: 'Activities',
		shortcuts: [
			{ key: 'j', action: 'navigate-down', description: 'Navigate list' },
			{ key: 'k', action: 'navigate-up', description: 'Navigate list' },
			{ key: 'n', action: 'new', description: 'New activity' },
			{ key: '1', action: 'filter-1', description: 'Toggle category filter' },
			{ key: '2', action: 'filter-2', description: 'Toggle category filter' },
			{ key: '3', action: 'filter-3', description: 'Toggle category filter' },
			{ key: '4', action: 'filter-4', description: 'Toggle category filter' },
			{ key: '5', action: 'filter-5', description: 'Toggle category filter' },
			{ key: '6', action: 'filter-6', description: 'Toggle category filter' },
			{ key: '7', action: 'filter-7', description: 'Toggle category filter' },
			{ key: '8', action: 'filter-8', description: 'Toggle category filter' },
			{ key: '9', action: 'filter-9', description: 'Toggle category filter' }
		]
	},
	'/planner/history': {
		label: 'History',
		shortcuts: [
			{ key: 'j', action: 'navigate-down', description: 'Navigate tasks' },
			{ key: 'k', action: 'navigate-up', description: 'Navigate tasks' },
			{ key: 'h', action: 'prev-day', description: 'Switch day' },
			{ key: 'l', action: 'next-day', description: 'Switch day' },
			{ key: '[', action: 'prev-week', description: 'Switch week' },
			{ key: ']', action: 'next-week', description: 'Switch week' }
		]
	},
	'/planner/todo': {
		label: 'Todo',
		shortcuts: [
			{ key: 'j', action: 'navigate-down', description: 'Navigate list' },
			{ key: 'k', action: 'navigate-up', description: 'Navigate list' },
			{ key: 'n', action: 'new', description: 'New todo' },
			{ key: 'e', action: 'edit', description: 'Edit todo' },
			{ key: 'c', action: 'toggle-done', description: 'Toggle done' },
			{ key: 'g', action: 'delegate', description: 'Delegate' },
			{ key: 'x', action: 'delete', description: 'Delete' }
		]
	},
	'/diary': {
		label: 'Diary',
		shortcuts: [
			{ key: 'j', action: 'navigate-down', description: 'Navigate entries' },
			{ key: 'k', action: 'navigate-up', description: 'Navigate entries' },
			{ key: 'n', action: 'new', description: 'New entry' },
			{ key: 'e', action: 'edit', description: 'Edit entry' }
		]
	},
	'/ideas': {
		label: 'Ideas',
		shortcuts: [
			{ key: 'j', action: 'navigate-down', description: 'Navigate ideas' },
			{ key: 'k', action: 'navigate-up', description: 'Navigate ideas' },
			{ key: 'n', action: 'new', description: 'New idea' },
			{ key: 'e', action: 'edit', description: 'Edit idea' },
			{ key: 'f', action: 'toggle-favorite', description: 'Toggle favorite' },
			{ key: 'a', action: 'toggle-applied', description: 'Toggle applied' }
		]
	},
	'/shopping': {
		label: 'Shopping',
		shortcuts: [
			{ key: 'j', action: 'navigate-down', description: 'Navigate items' },
			{ key: 'k', action: 'navigate-up', description: 'Navigate items' },
			{ key: 'n', action: 'new', description: 'New item' },
			{ key: 'e', action: 'edit', description: 'Edit item' },
			{ key: 'd', action: 'delete', description: 'Delete item' },
			{ key: 'D', action: 'toggle-done', description: 'Toggle done' },
			{ key: 'z', action: 'snooze', description: 'Snooze/unsnooze' },
			{ key: '1', action: 'filter-someday', description: 'Toggle someday filter' },
			{ key: '2', action: 'filter-replenish', description: 'Toggle replenish filter' },
			{ key: 'b', action: 'toggle-show-bought', description: 'Toggle show bought' },
			{ key: 's', action: 'toggle-show-snoozed', description: 'Toggle show snoozed' }
		]
	},
	'/health/habits': {
		label: 'Habits',
		shortcuts: [
			{ key: 'j', action: 'navigate-down', description: 'Navigate habits' },
			{ key: 'k', action: 'navigate-up', description: 'Navigate habits' },
			{ key: 'n', action: 'new', description: 'New habit' },
			{ key: 'Enter', action: 'toggle-expand', description: 'Expand/collapse' }
		]
	},
};

/**
 * Look up the action slug for a key press on a given page.
 * Returns null if no binding exists.
 */
export function getAction(pagePath: string, key: string): string | null {
	const page = PAGE_SHORTCUTS[pagePath];
	if (!page) return null;
	const binding = page.shortcuts.find((s) => s.key === key);
	return binding?.action ?? null;
}

/**
 * Get display-friendly shortcuts for a page, grouping consecutive
 * bindings that share the same description (e.g. j/k → "Navigate").
 */
export function getDisplayShortcuts(
	pagePath: string
): { displayKey: string; description: string }[] {
	const page = PAGE_SHORTCUTS[pagePath];
	if (!page) return [];
	const groups: { keys: string[]; description: string }[] = [];
	for (const s of page.shortcuts) {
		const last = groups[groups.length - 1];
		if (last && last.description === s.description) {
			last.keys.push(displayKey(s.key));
		} else {
			groups.push({ keys: [displayKey(s.key)], description: s.description });
		}
	}
	return groups.map((g) => ({ displayKey: g.keys.join('/'), description: g.description }));
}

function displayKey(key: string): string {
	if (key === ' ') return 'Space';
	if (key === 'Enter') return 'Enter';
	if (key === 'Escape') return 'Esc';
	return key;
}
