import { NAV_PLACES } from '$lib/sections-nav';
import { PAGE_SHORTCUTS } from '$lib/shortcuts';

/**
 * The guided tours: what a screen is, said on the screen itself.
 *
 * A room in this app is not self-evident from looking at it. The plan grid has
 * two gestures nothing on it mentions, the board's columns mean something, and
 * "Ideas" and "Notebooks" are different things for reasons that only make sense
 * once somebody says them. Written help lives in the docs and nobody reads the
 * docs before they have a question.
 *
 * So each screen can dim itself and point: one step per part, in the order a
 * person meets them. The tour is shown once — first login, and every visit to
 * the demo — and is on a button in the corner forever after.
 *
 * **A step's `target` is a selector, and the page is what makes it true.** The
 * anchors are `data-tour` attributes written beside the markup they name, so a
 * step points at whatever that part of the page has become rather than at
 * coordinates. Three rules follow from that, and they are what make the tours
 * survive a redesign:
 *
 *  - The first *visible* match wins, so one selector can name the desktop
 *    control and its counterpart in the phone bar. They are the same thing.
 *  - **A step whose target is nowhere on screen is skipped**, silently. That is
 *    how one tour serves both sizes, and how a step about a card somebody has
 *    put away stops existing rather than pointing at nothing.
 *  - A step with no target at all is a card in the middle of a dark screen.
 *    Used for openings, which are about the room rather than a part of it.
 *
 * Coverage is checked, in two places, because the failure here is silent: a
 * feature ships, its docs are generated, and the tour is the one thing nobody
 * remembers. `tutorials.test.ts` fails when a place in the navigation or a page
 * with keyboard shortcuts has no tour, and `yarn docs` writes the count into
 * `docs/reference/pages.md`. In the app itself the button in the corner turns
 * red on a screen with no tour, which is the version of this that a person
 * using it can see.
 */
export type TutorialStep = {
	/**
	 * A CSS selector for what this step points at. The first match with a box on
	 * screen wins; no match means the step is skipped. Omitted means a card in
	 * the middle of the screen.
	 */
	target?: string;
	title: string;
	body: string;
};

export type Tutorial = {
	/** What this screen is called, shown above the step counter. */
	label: string;
	steps: TutorialStep[];
};

/**
 * The step every tour ends on, wherever it is left.
 *
 * Dismissing does not close the tour; it comes here, which is the only place
 * that answers "and how do I get that back". Pressing Next through to the end
 * arrives at the same step, so the way out is the way out.
 *
 * Which is also why no tour writes a step of its own about that corner. The
 * dashboard's used to, and the tour then said the same thing twice in a row —
 * a card pointing at the help cluster, and then this card pointing at a button
 * inside it. `tutorials.test.ts` fails on a step that targets either.
 */
export const CLOSING_STEP: TutorialStep = {
	target: '[data-tour="tutorial"]',
	title: 'Click here if you ever need this help',
	body: 'It opens the tour for whatever screen you are on. The keyboard beside it lists that screen’s keys, and the book is the full documentation.'
};

export const TUTORIALS: Record<string, Tutorial> = {
	/*
	 * The dashboard's tour is also the app's.
	 *
	 * It is where a new account lands after first run, so this is the one that
	 * runs unasked — and the only one that has to explain the shell rather than
	 * the page. Half of these steps point at things that are on every screen.
	 */
	'/': {
		label: 'Ontoplano',
		steps: [
			{
				title: 'This is ontoplano',
				body: 'Your week, your goals, and everything else you would otherwise keep across six apps and a piece of paper. Two minutes, and you can stop whenever you like.'
			},
			{
				target: '[data-tour="nav"]',
				title: 'One room per kind of thing',
				body: 'The planner holds your week, the diary holds what happened, ideas hold what you thought of on the bus. Preferences reorders them and puts away the ones you do not want.'
			},
			{
				target: '[data-tour="mobile-bar"]',
				title: 'The bar',
				body: 'Your account, search, the rooms, home, and one button for writing something down.'
			},
			{
				target: '[data-tour="rooms"]',
				title: 'Hold this, then let go',
				body: 'The rooms open around your finger and you release on the one you want. Faster than reading a list of ten words, once your hand knows where they are.'
			},
			{
				target: '[data-tour="capture"]',
				title: 'Before it evaporates',
				body: 'The same gesture, for a todo, an idea, a note or something to buy — without deciding where it belongs first.'
			},
			{
				target: '[data-tour="search"]',
				title: 'Everything you have written',
				body: 'Entries, goals, people, recipes, ideas. One box over all of it.'
			},
			{
				target: '[data-tour="dash-cards"]',
				title: 'What today looks like',
				body: 'Each card is one room reporting in. Drag them into the order you want — the handle is up beside the date.'
			},
			{
				target: '[data-tour="menu"]',
				title: 'Yours to change',
				body: 'Theme, the day your week starts on, which rooms you keep and what colour they are. Your account and your data live here too.'
			}
		]
	},

	'/planner/plan': {
		label: 'Plan',
		steps: [
			{
				title: 'The shape of a normal week',
				body: 'Not a calendar of appointments — the blocks you mean to repeat. Everything else in the planner is built out of this.'
			},
			{
				target: '[data-tour="planner-tabs"]',
				title: 'Six views of the same week',
				body: 'Plan is the shape of it, Board is today, To-do is everything with no date yet, History is what actually happened.'
			},
			{
				target: '[data-tour="plan-grid"]',
				title: 'Drag to make a block',
				body: 'Pull down an empty stretch of a day. Hold Alt while dragging one to move that occurrence only and leave the rest of the weeks alone.'
			},
			{
				target: '[data-tour="plan-toolbar"]',
				title: 'Where you are, and what shape',
				body: 'The week and the arrows that move it on the left; grid or list, and what to add, on the right.'
			},
			{
				target: '[data-tour="plan-schemes"]',
				title: 'A week you can lay down again',
				body: 'Save the shape you are looking at as a scheme — a term-time week, a holiday week — and apply it to any week later.'
			}
		]
	},

	'/planner/board': {
		label: 'Board',
		steps: [
			{
				title: 'Today, as cards',
				body: 'The same blocks as the plan, in the one form where you can pick one up and move it.'
			},
			{
				target: '[data-tour="board-tabs"]',
				title: 'Today, or everything else',
				body: 'Today is the day in front of you. To-do is everything you have written down without a date; pulling one onto today gives it one.'
			},
			{
				target: '[data-tour="board-columns"]',
				title: 'Drag a card, or carry it',
				body: 'h j k l move between cards and columns, H and L carry the selected card with you, and c marks it done.'
			},
			{
				target: '[data-tour="board-ratings"]',
				title: 'Urgency, interest, energy',
				body: 'Three optional numbers on every card, one to five. Sort or filter the board by any of them; the history and the review read them afterwards.'
			}
		]
	},

	'/planner/todo': {
		label: 'To-do',
		steps: [
			{
				title: 'The things without a day yet',
				body: 'Anything you wrote down and did not place. It stays here until you give it a date, and then it is a block like any other.'
			},
			{
				target: '[data-tour="todo-new"]',
				title: 'One line is enough',
				body: 'A title, and nothing else if that is all you have. Everything after it can be filled in later.'
			},
			{
				target: '[data-tour="todo-list"]',
				title: 'j and k move, e edits, c finishes',
				body: 'Hand off a todo with g — it stays on the list, marked as somebody else’s.'
			}
		]
	},

	'/planner/activities': {
		label: 'Activities',
		steps: [
			{
				title: 'The named things you keep doing',
				body: '“Gym”, “Russian”, “Read”. A block on the plan points at one of these, so a year of gym is one thing rather than fifty unrelated blocks.'
			},
			{
				target: '[data-tour="activity-categories"]',
				title: 'Categories are the colours',
				body: 'Work, health, whatever divides your life. Every block wears its category’s colour, on the grid and on the dashboard.'
			},
			{
				target: '[data-tour="activity-list"]',
				title: 'Retire one without losing it',
				body: 'An activity you have stopped goes inactive rather than deleted, and everything you did under it stays in the history.'
			}
		]
	},

	'/planner/history': {
		label: 'History',
		steps: [
			{
				title: 'What actually happened',
				body: 'Week by week, against what you had planned — including the blocks you skipped, which are the interesting ones.'
			},
			{
				target: '[data-tour="history-week"]',
				title: 'Walk back through the weeks',
				body: '[ and ] do the same thing without the mouse.'
			},
			{
				target: '[data-tour="history-summary"]',
				title: 'Done, skipped, and late',
				body: 'Early, on time or late is worked out from when you finished against when you meant to. Nobody sets it by hand.'
			}
		]
	},

	'/planner/review': {
		label: 'Review',
		steps: [
			{
				title: 'Closing a week',
				body: 'A few lines about the week that just ended, and a decision about everything it left open.'
			},
			{
				target: '[data-tour="review-lines"]',
				title: 'Say it in your own words',
				body: 'What went well, what did not, what you are changing. It is the part you will read next year.'
			},
			{
				target: '[data-tour="review-loose"]',
				title: 'Nothing carries itself over',
				body: 'Everything you planned and did not do gets an answer here. Next week generates its own blocks either way, so an unanswered list cannot quietly become the week.'
			}
		]
	},

	'/goals': {
		label: 'Goals',
		steps: [
			{
				title: 'What the week is for',
				body: 'A goal has a horizon — this month, this year, the decade — and progress you either count or set by hand.'
			},
			{
				target: '[data-tour="goal-areas"]',
				title: 'Areas group them',
				body: 'Your own divisions, with your own colours. A goal belongs to one.'
			},
			{
				target: '[data-tour="goal-new"]',
				title: 'Give it a number if it has one',
				body: 'Books, kilos, euros — anything countable. A goal with a unit fills its own bar as you link the tasks that count towards it.'
			},
			{
				target: '[data-tour="goal-list"]',
				title: 'Link the work to the goal',
				body: 'Attach the blocks and todos that count. That is what turns a goal from a wish into a number that moves.'
			}
		]
	},

	'/diary': {
		label: 'Diary',
		steps: [
			{
				title: 'What happened, in your words',
				body: 'One entry a day or twenty, as long or short as you like.'
			},
			{
				target: '[data-tour="diary-new"]',
				title: 'Tags and people, as you write',
				body: 'Tags are free-form — invent one and it exists. Naming a person links the entry to them.'
			},
			{
				target: '[data-tour="diary-wins"]',
				title: 'Three wins',
				body: 'Three good things about the day, in one line each. The shortest entry worth keeping, for the days you will not write more.'
			},
			{
				target: '[data-tour="diary-list"]',
				title: 'Find it again by tag',
				body: 'Every tag on an entry is a filter. Search reaches the words inside them.'
			}
		]
	},

	'/diary/people': {
		label: 'People',
		steps: [
			{
				title: 'A person is not a tag',
				body: 'They have a name, a birthday, and a page of their own — so “everything about Ana” is somewhere to go rather than a search you run.'
			},
			{
				target: '[data-tour="people-new"]',
				title: 'A name is enough to start',
				body: 'The rest fills in as you write about them.'
			},
			{
				target: '[data-tour="people-list"]',
				title: 'Every mention, in one place',
				body: 'Open a person to see each entry that named them, newest first.'
			}
		]
	},

	'/diary/notebooks': {
		label: 'Notebooks',
		steps: [
			{
				title: 'For the things that are not a day',
				body: 'A renovation, a trip, a piece of research. A notebook holds notes about one subject, and it does not care when you wrote them.'
			},
			{
				target: '[data-tour="notebook-new"]',
				title: 'One notebook per subject',
				body: 'Diary entries are what happened; a notebook is what you are working out.'
			}
		]
	},

	'/ideas': {
		label: 'Ideas',
		steps: [
			{
				title: 'Catch it now, judge it later',
				body: 'Anything you thought of and do not want to lose. No date, no category, no decision required.'
			},
			{
				target: '[data-tour="idea-new"]',
				title: 'A sentence is a complete idea',
				body: 'Write it and move on. n opens this from anywhere on the page.'
			},
			{
				target: '[data-tour="idea-list"]',
				title: 'Star it, or mark it done',
				body: 'f keeps the good ones at the top. a marks one as applied, with a line about what came of it — which is the part you will want in a year.'
			}
		]
	},

	'/health/habits': {
		label: 'Habits',
		steps: [
			{
				title: 'The things you do, and the things you do not',
				body: 'A habit is either one to keep or one to avoid, and both are logged the same way: one mark a day.'
			},
			{
				target: '[data-tour="habit-new"]',
				title: 'Say which kind it is',
				body: 'A good habit counts the days you did it. A bad one counts the days you did not.'
			},
			{
				target: '[data-tour="habit-list"]',
				title: 'The calendar is the point',
				body: 'A year of a habit at a glance. A gap in it says more than any number.'
			}
		]
	},

	'/shopping': {
		label: 'Shopping',
		steps: [
			{
				title: 'Two lists, one page',
				body: 'Inventory is what runs out and has to be replaced. Wishlist is what you might buy one day.'
			},
			{
				target: '[data-tour="shopping-new"]',
				title: 'Which list, and where it lives',
				body: 'A category — fridge, bathroom, desk — is what makes the list match the walk around the house.'
			},
			{
				target: '[data-tour="shopping-list"]',
				title: 'Bought, and back again',
				body: 'Ticking something off inventory starts it running down again. z snoozes what you do not want to think about this month.'
			}
		]
	},

	'/kitchen/recipes': {
		label: 'Recipes',
		steps: [
			{
				title: 'Recipes, and what they cost you',
				body: 'Ingredients, steps, and a cook mode that keeps the screen awake while you follow it.'
			},
			{
				target: '[data-tour="recipe-new"]',
				title: 'Paste the page in',
				body: 'Copy a recipe from wherever you found it and paste the whole thing. The ingredients and the steps are pulled out of it.'
			},
			{
				target: '[data-tour="recipe-pictures"]',
				title: 'And what it looks like',
				body: 'Up to six pictures per recipe. Star one and it becomes the one the list shows, so a cookbook is something you recognise by sight rather than by reading forty titles.'
			},
			{
				target: '[data-tour="recipe-list"]',
				title: 'An ingredient is a shopping item',
				body: 'Put a recipe on the week and everything it needs turns up on the shopping list, minus what you already have.'
			}
		]
	},

	'/kitchen/meals': {
		label: 'Meals',
		steps: [
			{
				title: 'The week, as food',
				body: 'What you are cooking on which day, and the one shopping list that comes out of all of it.'
			},
			{
				target: '[data-tour="meals-week"]',
				title: 'A recipe per day',
				body: 'Or several. A day with nothing on it is a day you have not decided about, not a mistake.'
			},
			{
				target: '[data-tour="meals-shopping"]',
				title: 'To buy, and already have',
				body: 'Split against your inventory, so the list is the walk to the shop rather than the whole cupboard.'
			}
		]
	},

	'/search': {
		label: 'Search',
		steps: [
			{
				title: 'Everything, in one box',
				body: 'Entries, notes, ideas, goals, people, recipes, todos. Grouped by what they are.'
			},
			{
				target: '[data-tour="search-box"]',
				title: 'Type a word you remember',
				body: 'Matching is on the words themselves, so a fragment of a sentence you wrote finds the entry it came from.'
			}
		]
	},

	'/settings/preferences': {
		label: 'Preferences',
		steps: [
			{
				title: 'The app, arranged your way',
				body: 'What the week starts on, what it looks like, which rooms you keep, and what is on the dashboard.'
			},
			{
				target: '[data-tour="prefs-menu"]',
				title: 'Your rooms, your order, your colours',
				body: 'Drag a room up or down, put one away, or give its section a different colour. The bar, the wheel and the search results all follow.'
			},
			{
				target: '[data-tour="prefs-theme"]',
				title: 'Light, dark, or whatever the device says',
				body: 'System follows the phone or the laptop, including when it changes at sunset.'
			}
		]
	},

	'/settings/account': {
		label: 'Account',
		steps: [
			{
				title: 'Your account, and your data',
				body: 'Email, password, the devices you are signed in on, and the two things that move everything at once.'
			},
			{
				target: '[data-tour="account-sessions"]',
				title: 'Every device that is signed in',
				body: 'Sign one out, or all of them at once if something looks wrong.'
			},
			{
				target: '[data-tour="account-export"]',
				title: 'Take it with you',
				body: 'Everything you have written, in one file, whenever you want it. Deleting the account removes all of it and cannot be undone.'
			}
		]
	},

	'/settings/integrations': {
		label: 'Integrations',
		steps: [
			{
				title: 'Letting other things in',
				body: 'Tokens for programs that read or write on your behalf, a calendar link, and the data other apps push in.'
			},
			{
				target: '[data-tour="integrations-tokens"]',
				title: 'A token is shown once',
				body: 'Scoped to what it needs, and revokable from here. Copy it when it appears — it is stored hashed and cannot be shown again.'
			},
			{
				target: '[data-tour="integrations-streams"]',
				title: 'Numbers from elsewhere',
				body: 'A stream is a series something else keeps pushing — a weight, a step count — and it gets a page of its own under Health.'
			}
		]
	}
};

/**
 * The tour for a path, or nothing.
 *
 * Exact first, then the longest registered path this one sits under — so a
 * notebook's own page is toured as Notebooks, while `/diary/people` keeps its
 * own tour rather than falling back to the diary's.
 */
export function tutorialFor(path: string): Tutorial | null {
	if (TUTORIALS[path]) return TUTORIALS[path];

	let best: string | null = null;
	for (const key of Object.keys(TUTORIALS)) {
		if (key === '/') continue;
		if (!path.startsWith(key + '/')) continue;
		if (!best || key.length > best.length) best = key;
	}

	return best ? TUTORIALS[best] : null;
}

export function hasTutorial(path: string): boolean {
	return tutorialFor(path) !== null;
}

/**
 * The screens a tour is owed.
 *
 * Somewhere the navigation can take you, or somewhere with keys of its own —
 * either is a screen somebody arrives at without being told what it is. The
 * settings pages behind the account menu and the administration pages are not
 * on this list: they are read, not learned.
 */
export function screensNeedingTutorials(): string[] {
	return [...new Set([...NAV_PLACES.map((p) => p.href), ...Object.keys(PAGE_SHORTCUTS)])].sort();
}
