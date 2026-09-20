import type { PlainKey } from '$lib/i18n/keys';
export interface ShortcutBinding {
	key: string;
	action: string;
	description: PlainKey;
}

export interface PageShortcuts {
	label: PlainKey;
	shortcuts: ShortcutBinding[];
}

/**
 * The four this owns, for a page's entry in `PAGE_SHORTCUTS`.
 *
 * Spread into the list so the help dock says what the screen actually does
 * rather than the two halves disagreeing:
 *
 *     shortcuts: [...BROWSE_SHORTCUTS, { key: 'n', action: 'new', … }]
 */
export const BROWSE_SHORTCUTS: ShortcutBinding[] = [
	{ key: 'h', action: 'browse-prev-tab', description: 'shortcut.moveBetweenTabs' },
	{ key: 'l', action: 'browse-next-tab', description: 'shortcut.moveBetweenTabs' },
	{ key: 'j', action: 'browse-next', description: 'shortcut.navigateList' },
	{ key: 'k', action: 'browse-prev', description: 'shortcut.navigateList' },
	{ key: 'Enter', action: 'browse-open', description: 'shortcut.openTheOneUnderThe' },
	{ key: 'e', action: 'browse-edit', description: 'shortcut.editTheOneUnderThe' }
];

export const GLOBAL_SHORTCUTS: ShortcutBinding[] = [
	{ key: 'J', action: 'global-next-page', description: 'shortcut.nextPage' },
	{ key: 'K', action: 'global-prev-page', description: 'shortcut.previousPage' },
	/*
	 * The rooms are J and K; the places inside one are H and L.
	 *
	 * Lower-case h and l walk the tabs of whatever is on screen — see
	 * `$lib/browse` — so the shifted pair walking the room's own places keeps
	 * the same axis at the next level out: sideways is sideways, and the shift
	 * is how far out you mean.
	 */
	{ key: 'L', action: 'global-next-place', description: 'shortcut.nextPlaceInRoom' },
	{ key: 'H', action: 'global-prev-place', description: 'shortcut.previousPlaceInRoom' },
	{ key: 'Escape', action: 'global-close', description: 'shortcut.closeForm' },
	{ key: '?', action: 'global-help', description: 'shortcut.toggleShortcutHelp' }
];

export const PAGE_SHORTCUTS: Record<string, PageShortcuts> = {
	'/': {
		label: 'app.dashboard',
		shortcuts: [
			{ key: 'i', action: 'capture-idea', description: 'shortcut.captureAnIdea' },
			{ key: 't', action: 'capture-todo', description: 'shortcut.captureATodo' },
			{ key: 'd', action: 'capture-note', description: 'shortcut.captureANote' },
			{ key: 'b', action: 'capture-buy', description: 'shortcut.captureSomethingToBuy' },
			{ key: 'n', action: 'new-diary', description: 'shortcut.newDiaryEntry' },
			{ key: 'w', action: 'new-wins', description: 'shortcut.newWins' }
		]
	},
	'/goals': {
		label: 'app.goals',
		shortcuts: [
			{ key: 'n', action: 'new', description: 'shortcut.newGoal' },
			{ key: 'j', action: 'next', description: 'shortcut.nextGoal' },
			{ key: 'k', action: 'prev', description: 'shortcut.previousGoal' }
		]
	},

	'/tasks/board': {
		label: 'app.board',
		shortcuts: [
			{ key: 'h', action: 'prev-column', description: 'shortcut.moveBetweenColumns' },
			{ key: 'j', action: 'next-card', description: 'shortcut.moveBetweenCards' },
			{ key: 'k', action: 'prev-card', description: 'shortcut.moveBetweenCards' },
			{ key: 'l', action: 'next-column', description: 'shortcut.moveBetweenColumns' },
			/*
			 * `<` and `>`, not `H` and `L`.
			 *
			 * Those two walk the places inside a room, everywhere in the app —
			 * and a key that means one thing on nine screens and something else
			 * on the tenth is a key nobody trusts. The board used to claim them,
			 * so the board was the one room you could not walk out of sideways.
			 * The angle brackets already read as "push it that way".
			 */
			{ key: '<', action: 'carry-left', description: 'shortcut.carryCardToPreviousColumn' },
			{ key: '>', action: 'carry-right', description: 'shortcut.carryCardToNextColumn' },
			{ key: 'c', action: 'toggle-done', description: 'shortcut.markDoneReopen' },
			{ key: 't', action: 'toggle-today', description: 'shortcut.pullOntoTodayPut' },
			{ key: 'g', action: 'switch-tab', description: 'shortcut.switchTodayGeneral' },
			{ key: 'n', action: 'new', description: 'shortcut.newCard' },
			{ key: 'Enter', action: 'edit', description: 'shortcut.openTheCard' },
			{ key: '1', action: 'rate', description: 'shortcut.setTheActiveRating' },
			{ key: '2', action: 'rate', description: 'shortcut.setTheActiveRating' },
			{ key: '3', action: 'rate', description: 'shortcut.setTheActiveRating' },
			{ key: '4', action: 'rate', description: 'shortcut.setTheActiveRating' },
			{ key: '5', action: 'rate', description: 'shortcut.setTheActiveRating' },
			{ key: 'u', action: 'rate-urgency', description: 'shortcut.numberKeysSetUrgency' },
			{ key: 'i', action: 'rate-interest', description: 'shortcut.numberKeysSetInterest' },
			{ key: 'y', action: 'rate-energy', description: 'shortcut.numberKeysSetEnergy' },
			{ key: 'x', action: 'delete', description: 'shortcut.askToDeleteCard' }
		]
	},

	'/tasks/plan': {
		label: 'app.plan',
		shortcuts: [
			{ key: 'j', action: 'navigate-down', description: 'shortcut.navigateSlots' },
			{ key: 'k', action: 'navigate-up', description: 'shortcut.navigateSlots' },
			{ key: 'g', action: 'toggle-view', description: 'shortcut.toggleListGridView' },
			{ key: '+', action: 'zoom-in', description: 'shortcut.zoomInGrid' },
			{ key: '=', action: 'zoom-in', description: 'shortcut.zoomInGrid' },
			{ key: '-', action: 'zoom-out', description: 'shortcut.zoomOutGrid' },
			{ key: '0', action: 'zoom-reset', description: 'shortcut.resetZoomGrid' },
			{ key: 'h', action: 'prev-day', description: 'shortcut.switchDay' },
			{ key: 'l', action: 'next-day', description: 'shortcut.switchDay' },
			{ key: '[', action: 'prev-week', description: 'shortcut.switchWeek' },
			{ key: ']', action: 'next-week', description: 'shortcut.switchWeek' },
			{ key: 'n', action: 'new', description: 'shortcut.newWeeklyBlock' },
			{ key: 'N', action: 'new-exceptional', description: 'shortcut.newOneOffBlock' },
			{ key: 'e', action: 'edit', description: 'shortcut.editBlock' },
			{ key: 'd', action: 'toggle-active', description: 'shortcut.toggleActive' },
			{ key: 'D', action: 'delete', description: 'shortcut.deleteBlock' },
			{ key: 'v', action: 'toggle-multiselect', description: 'shortcut.toggleMultiselect' },
			{ key: ' ', action: 'toggle-select', description: 'shortcut.selectDeselectMultiselect' },
			{ key: 'x', action: 'delete-selected', description: 'shortcut.askToDeleteSelected' },
			{ key: 'p', action: 'copy-to-days', description: 'shortcut.copyToDaysMultiselect' }
		]
	},
	'/tasks/activities': {
		label: 'app.activities',
		shortcuts: [
			{ key: 'j', action: 'navigate-down', description: 'shortcut.navigateList' },
			{ key: 'k', action: 'navigate-up', description: 'shortcut.navigateList' },
			{ key: 'n', action: 'new', description: 'shortcut.newActivity' },
			{ key: '1', action: 'filter-1', description: 'shortcut.toggleCategoryFilter' },
			{ key: '2', action: 'filter-2', description: 'shortcut.toggleCategoryFilter' },
			{ key: '3', action: 'filter-3', description: 'shortcut.toggleCategoryFilter' },
			{ key: '4', action: 'filter-4', description: 'shortcut.toggleCategoryFilter' },
			{ key: '5', action: 'filter-5', description: 'shortcut.toggleCategoryFilter' },
			{ key: '6', action: 'filter-6', description: 'shortcut.toggleCategoryFilter' },
			{ key: '7', action: 'filter-7', description: 'shortcut.toggleCategoryFilter' },
			{ key: '8', action: 'filter-8', description: 'shortcut.toggleCategoryFilter' },
			{ key: '9', action: 'filter-9', description: 'shortcut.toggleCategoryFilter' }
		]
	},
	'/tasks/todo': {
		label: 'app.toDo',
		shortcuts: [
			{ key: 'j', action: 'navigate-down', description: 'shortcut.navigateList' },
			{ key: 'k', action: 'navigate-up', description: 'shortcut.navigateList' },
			{ key: 'n', action: 'new', description: 'shortcut.newTodo' },
			{ key: 'e', action: 'edit', description: 'shortcut.editTodo' },
			{ key: 'c', action: 'toggle-done', description: 'shortcut.toggleDone' },
			{ key: 'g', action: 'delegate', description: 'shortcut.delegate' },
			{ key: 'x', action: 'delete', description: 'shortcut.askToDelete' }
		]
	},
	'/notebooks/diary': {
		label: 'app.diary',
		shortcuts: [
			{ key: 'j', action: 'navigate-down', description: 'shortcut.navigateEntries' },
			{ key: 'k', action: 'navigate-up', description: 'shortcut.navigateEntries' },
			{ key: 'n', action: 'new', description: 'shortcut.newEntry' },
			{ key: 'e', action: 'edit', description: 'shortcut.editEntry' }
		]
	},
	'/notebooks/ideas': {
		label: 'app.ideas',
		shortcuts: [
			{ key: 'j', action: 'navigate-down', description: 'shortcut.navigateIdeas' },
			{ key: 'k', action: 'navigate-up', description: 'shortcut.navigateIdeas' },
			{ key: 'n', action: 'new', description: 'shortcut.newIdea' },
			{ key: 'e', action: 'edit', description: 'shortcut.editIdea' },
			{ key: 'f', action: 'toggle-favorite', description: 'shortcut.toggleFavorite' },
			{ key: 'a', action: 'toggle-applied', description: 'shortcut.toggleApplied' }
		]
	},
	'/inventory': {
		label: 'app.toBuy',
		shortcuts: [
			{ key: 'j', action: 'navigate-down', description: 'shortcut.navigateItems' },
			{ key: 'k', action: 'navigate-up', description: 'shortcut.navigateItems' },
			{ key: 'n', action: 'new', description: 'shortcut.newItem' },
			{ key: 'e', action: 'edit', description: 'shortcut.editItem' },
			{ key: 'd', action: 'delete', description: 'shortcut.deleteItem' },
			{ key: 'D', action: 'toggle-done', description: 'shortcut.toggleDone' },
			{ key: 'z', action: 'snooze', description: 'shortcut.archiveUnarchive' },
			{ key: '1', action: 'filter-someday', description: 'shortcut.toggleSomedayFilter' },
			{ key: '2', action: 'filter-replenish', description: 'shortcut.toggleReplenishFilter' },
			{ key: 'b', action: 'toggle-show-bought', description: 'shortcut.toggleShowBought' },
			{ key: 's', action: 'toggle-show-snoozed', description: 'shortcut.toggleShowArchived' }
		]
	},
	'/health/habits': {
		label: 'app.habits',
		shortcuts: [
			{ key: 'j', action: 'navigate-down', description: 'shortcut.navigateHabits' },
			{ key: 'k', action: 'navigate-up', description: 'shortcut.navigateHabits' },
			{ key: 'n', action: 'new', description: 'shortcut.newHabit' },
			{ key: 'Enter', action: 'toggle-expand', description: 'shortcut.expandCollapse' }
		]
	},
	'/notebooks': {
		label: 'app.notebooks',
		// `BROWSE_SHORTCUTS` is the set `$lib/browse` answers for any screen that
		// declares itself browsable, spread in here so the help dock says what
		// the screen actually does rather than the two halves disagreeing.
		shortcuts: [
			...BROWSE_SHORTCUTS,
			{ key: 'n', action: 'new', description: 'shortcut.newNotebook' }
		]
	},
	'/notebooks/people': {
		label: 'app.people',
		shortcuts: [
			{ key: 'j', action: 'navigate-down', description: 'shortcut.navigatePeople' },
			{ key: 'k', action: 'navigate-up', description: 'shortcut.navigatePeople' },
			{ key: 'n', action: 'new', description: 'shortcut.newPerson' }
		]
	},
	'/health/recipes': {
		label: 'app.recipes',
		shortcuts: [{ key: 'n', action: 'new', description: 'shortcut.newRecipe' }]
	},
	'/settings/account': {
		label: 'app.account',
		shortcuts: [
			{ key: 'j', action: 'navigate-down', description: 'shortcut.navigateSessions' },
			{ key: 'k', action: 'navigate-up', description: 'shortcut.navigateSessions' }
		]
	},
	'/settings/integrations/connections': {
		label: 'app.integrations',
		shortcuts: [
			{ key: 'j', action: 'navigate-down', description: 'shortcut.navigateTokens' },
			{ key: 'k', action: 'navigate-up', description: 'shortcut.navigateTokens' },
			{ key: 'n', action: 'new', description: 'shortcut.newToken' }
		]
	}
};

/**
 * The key that triggers an action on a page, for a `<kbd>` hint.
 *
 * Markup asks the registry instead of repeating the letter, so a rebinding
 * changes the hint with it. Asking for an action a page does not register is
 * a mistake worth failing loudly on — a silent fallback here is exactly the
 * drift this file exists to end.
 */
export function keyFor(pagePath: string, action: string): string {
	const binding = PAGE_SHORTCUTS[pagePath]?.shortcuts.find((s) => s.action === action);
	if (!binding) throw new Error(`No '${action}' binding registered for ${pagePath}`);
	return displayKey(binding.key);
}

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
): { displayKey: string; description: PlainKey }[] {
	const page = PAGE_SHORTCUTS[pagePath];
	if (!page) return [];
	const groups: { keys: string[]; description: PlainKey }[] = [];
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
