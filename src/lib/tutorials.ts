import type { PlainKey } from '$lib/i18n/keys';
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
	/**
	 * What the step says, as message keys.
	 *
	 * A tour is a list of sentences and this module has no language: it is
	 * imported by the shell, by a test and by the docs generator, none of which
	 * shares a translator. `Tutorial.svelte` has one and calls it.
	 */
	title: PlainKey;
	body: PlainKey;
};

export type Tutorial = {
	/** What this screen is called, shown above the step counter. */
	label: PlainKey;
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
 *
 * Two of them, because help is not in the same place on the two shapes of
 * screen: the corner dock on a laptop, and on a phone the button in the bar
 * that fans out account, tour, documentation and the way to say something is
 * wrong. `Tutorial.svelte` takes the first whose target is actually on screen,
 * and drops any earlier step pointing at the same thing.
 */
export const CLOSING_STEPS: TutorialStep[] = [
	{
		target: '[data-tour="tutorial"]',
		title: 'tour.clickHereIfYouEver',
		body: 'tour.itOpensTheTourFor'
	},
	{
		target: '[data-tour="menu"]',
		title: 'tour.pressHereIfYouEver',
		body: 'tour.itFansOutYourAccount'
	}
];

export const TUTORIALS: Record<string, Tutorial> = {
	/*
	 * The dashboard's tour is also the app's.
	 *
	 * It is where a new account lands after first run, so this is the one that
	 * runs unasked — and the only one that has to explain the shell rather than
	 * the page. Half of these steps point at things that are on every screen.
	 */
	'/': {
		label: 'tour.ontoplano',
		steps: [
			{
				title: 'tour.thisIsOntoplano',
				body: 'tour.yourWeekYourGoalsAnd'
			},
			{
				target: '[data-tour="nav"]',
				title: 'tour.oneRoomPerKindOf',
				body: 'tour.tasksHoldYourWeekNotebooks'
			},
			{
				target: '[data-tour="mobile-bar"]',
				title: 'tour.theBar',
				body: 'tour.yourAccountSearchTheRooms'
			},
			{
				target: '[data-tour="rooms"]',
				title: 'tour.holdThisThenLetGo',
				body: 'tour.theRoomsOpenAroundYour'
			},
			{
				target: '[data-tour="capture"]',
				title: 'tour.beforeItEvaporates',
				body: 'tour.theSameGestureForA'
			},
			{
				target: '[data-tour="search"]',
				title: 'tour.everythingYouHaveWritten',
				body: 'tour.entriesGoalsPeopleRecipesIdeas'
			},
			{
				target: '[data-tour="dash-cards"]',
				title: 'tour.whatTodayLooksLike',
				body: 'tour.eachCardIsOneRoom'
			},
			{
				target: '[data-tour="menu"]',
				title: 'tour.yoursToChange',
				body: 'tour.themeTheDayYourWeek'
			}
		]
	},

	'/tasks/plan': {
		label: 'tour.plan',
		steps: [
			{
				title: 'tour.theShapeOfANormal',
				body: 'tour.notACalendarOfAppointments'
			},
			{
				target: '[data-tour="planner-tabs"]',
				title: 'tour.sixViewsOfTheSame',
				body: 'tour.planIsTheShapeOf'
			},
			{
				target: '[data-tour="plan-grid"]',
				title: 'tour.dragToMakeABlock',
				body: 'tour.pullDownAnEmptyStretch'
			},
			{
				target: '[data-tour="plan-toolbar"]',
				title: 'tour.whereYouAreAndWhat',
				body: 'tour.theWeekAndTheArrows'
			},
			{
				target: '[data-tour="plan-week-start"]',
				title: 'tour.whereYourWeekBegins',
				body: 'tour.theArrowsStepAWholeWeek'
			},
			{
				target: '[data-tour="plan-schemes"]',
				title: 'tour.aWeekYouCanLay',
				body: 'tour.saveTheShapeYouAre'
			}
		]
	},

	'/tasks/board': {
		label: 'tour.board',
		steps: [
			{
				title: 'tour.todayAsCards',
				body: 'tour.theSameBlocksAsThe'
			},
			{
				target: '[data-tour="board-tabs"]',
				title: 'tour.todayOrEverythingElse',
				body: 'tour.todayIsTheDayIn'
			},
			{
				target: '[data-tour="board-columns"]',
				title: 'tour.dragACardOrCarry',
				body: 'tour.hJKLMove'
			},
			{
				target: '[data-tour="board-ratings"]',
				title: 'tour.urgencyEaseInterest',
				body: 'tour.threeOptionalNumbersOnEvery'
			}
		]
	},

	'/tasks/todo': {
		label: 'tour.toDo',
		steps: [
			{
				title: 'tour.theThingsWithoutADay',
				body: 'tour.anythingYouWroteDownAnd'
			},
			{
				target: '[data-tour="todo-new"]',
				title: 'tour.oneLineIsEnough',
				body: 'tour.aTitleAndNothingElse'
			},
			{
				target: '[data-tour="todo-list"]',
				title: 'tour.jAndKMoveE',
				body: 'tour.handOffATodoWith'
			}
		]
	},

	'/tasks/activities': {
		label: 'tour.activities',
		steps: [
			{
				title: 'tour.theNamedThingsYouKeep',
				body: 'tour.gymRussianReadABlock'
			},
			{
				target: '[data-tour="activity-categories"]',
				title: 'tour.categoriesAreTheColours',
				body: 'tour.workHealthWhateverDividesYour'
			},
			{
				target: '[data-tour="activity-list"]',
				title: 'tour.retireOneWithoutLosingIt',
				body: 'tour.anActivityYouHaveStopped'
			}
		]
	},

	'/tasks/review': {
		label: 'tour.review',
		steps: [
			{
				title: 'tour.closingAWeek',
				body: 'tour.aFewLinesAboutThe'
			},
			{
				target: '[data-tour="review-lines"]',
				title: 'tour.sayItInYourOwn',
				body: 'tour.whatWentWellWhatDid'
			},
			{
				target: '[data-tour="review-loose"]',
				title: 'tour.nothingCarriesItselfOver',
				body: 'tour.everythingYouPlannedAndDid'
			}
		]
	},

	'/goals': {
		label: 'tour.goals',
		steps: [
			{
				title: 'tour.whatTheWeekIsFor',
				body: 'tour.aGoalHasAHorizon'
			},
			{
				target: '[data-tour="goal-areas"]',
				title: 'tour.areasGroupThem',
				body: 'tour.yourOwnDivisionsWithYour'
			},
			{
				target: '[data-tour="goal-new"]',
				title: 'tour.giveItANumberIf',
				body: 'tour.booksKilosEurosAnything'
			},
			{
				target: '[data-tour="goal-list"]',
				title: 'tour.linkTheWorkToThe',
				body: 'tour.attachTheBlocksAndTodos'
			}
		]
	},

	'/notebooks/diary': {
		label: 'tour.diary',
		steps: [
			{
				title: 'tour.whatHappenedInYourWords',
				body: 'tour.oneEntryADayOr'
			},
			{
				target: '[data-tour="diary-new"]',
				title: 'tour.tagsAndPeopleAsYou',
				body: 'tour.tagsAreFreeFormInvent'
			},
			{
				target: '[data-tour="diary-wins"]',
				title: 'tour.threeWins',
				body: 'tour.threeGoodThingsAboutThe'
			},
			{
				target: '[data-tour="diary-list"]',
				title: 'tour.findItAgainByTag',
				body: 'tour.everyTagOnAnEntry'
			}
		]
	},

	'/notebooks/tags': {
		label: 'tour.tags',
		steps: [
			{
				title: 'tour.oneSetOfLabelsFor',
				body: 'tour.theSameWordOnA'
			},
			{
				target: '[data-tour="tag-list"]',
				title: 'tour.renameOneAndItChanges',
				body: 'tour.renamingOntoALabelYou'
			}
		]
	},

	'/notebooks/people': {
		label: 'tour.people',
		steps: [
			{
				title: 'tour.aPersonIsNotA',
				body: 'tour.theyHaveANameA'
			},
			{
				target: '[data-tour="people-new"]',
				title: 'tour.aNameIsEnoughTo',
				body: 'tour.theRestFillsInAs'
			},
			{
				target: '[data-tour="people-list"]',
				title: 'tour.everyMentionInOnePlace',
				body: 'tour.openAPersonToSee'
			}
		]
	},

	'/notebooks': {
		label: 'tour.notebooks',
		steps: [
			{
				title: 'tour.forTheThingsThatAre',
				body: 'tour.aRenovationATripA'
			},
			{
				target: '[data-tour="notebook-new"]',
				title: 'tour.oneNotebookPerSubject',
				body: 'tour.diaryEntriesAreWhatHappened'
			},
			{
				target: '[data-tour="notebook-shelf"]',
				title: 'tour.aShelfOfSubjects',
				body: 'tour.everyNotebookIsACover'
			},
			{
				// Skipped until a notebook is open, which is right: there are no
				// tabs to point at on an empty shelf.
				target: '[data-tour="notebook-tabs"]',
				title: 'tour.notJustNotesAndTasks',
				body: 'tour.aNotebookCanHoldWhatever'
			}
		]
	},

	'/notebooks/ideas': {
		label: 'tour.ideas',
		steps: [
			{
				title: 'tour.catchItNowJudgeIt',
				body: 'tour.anythingYouThoughtOfAnd'
			},
			{
				target: '[data-tour="idea-new"]',
				title: 'tour.aSentenceIsAComplete',
				body: 'tour.writeItAndMoveOn'
			},
			{
				target: '[data-tour="idea-list"]',
				title: 'tour.starItOrMarkIt',
				body: 'tour.fKeepsTheGoodOnes'
			}
		]
	},

	'/health/workouts': {
		label: 'tour.workouts',
		steps: [
			{
				title: 'tour.workoutsPlannedLikeMeals',
				body: 'tour.aWorkoutIsAName'
			},
			{
				title: 'tour.doneAndPutAway',
				body: 'tour.markASessionDoneTo'
			}
		]
	},
	'/health/habits': {
		label: 'tour.habits',
		steps: [
			{
				title: 'tour.theThingsYouDoAnd',
				body: 'tour.aHabitIsEitherOne'
			},
			{
				target: '[data-tour="habit-new"]',
				title: 'tour.sayWhichKindItIs',
				body: 'tour.aGoodHabitCountsThe'
			},
			{
				target: '[data-tour="habit-list"]',
				title: 'tour.theCalendarIsThePoint',
				body: 'tour.aYearOfAHabit'
			}
		]
	},

	'/finance/ledgers': {
		label: 'tour.ledgers',
		steps: [
			{
				title: 'tour.oneLedgerPerPlaceMoney',
				body: 'tour.aCurrentAccountIsOne'
			},
			{
				title: 'tour.theStatementIsTheRecord',
				body: 'tour.importTheBankU2019sOwnExport'
			},
			{
				title: 'tour.rulesDoTheSorting',
				body: 'tour.categoriesWashTheRowIn'
			}
		]
	},
	'/inventory/stock': {
		label: 'tour.shopping',
		steps: [
			{
				title: 'tour.twoListsOnePage',
				body: 'tour.inventoryIsWhatRunsOut'
			},
			{
				target: '[data-tour="inventory-new"]',
				title: 'tour.whichListAndWhereIt',
				body: 'tour.aCategoryFridgeBathroom'
			},
			{
				target: '[data-tour="inventory-list"]',
				title: 'tour.boughtAndBackAgain',
				body: 'tour.tickingSomethingOffInventoryStarts'
			}
		]
	},

	'/media/audios': {
		label: 'tour.recordings',
		steps: [
			{
				title: 'tour.sayItInsteadOfTyping',
				body: 'tour.pressRecordAndTalk'
			},
			{
				title: 'tour.hearItBeforeYouKeep',
				body: 'tour.playItBackAndScrub'
			},
			{
				title: 'tour.aNameOrTheMoment',
				body: 'tour.leaveTheNameAloneAnd'
			}
		]
	},

	'/media/gallery': {
		label: 'tour.gallery',
		steps: [
			{
				title: 'tour.albumsNotFolders',
				body: 'tour.picturesLiveInAlbumsPutting'
			},
			{
				title: 'tour.movingAndSharing',
				body: 'tour.dragAPictureOntoAnother'
			},
			{
				title: 'tour.tagsCutAcross',
				body: 'tour.aTagOnAPicture'
			}
		]
	},

	'/reminders': {
		label: 'tour.reminders',
		steps: [
			{
				title: 'tour.everythingWithATimeOn',
				body: 'tour.blocksYouAskedToBe'
			},
			{
				target: '[data-tour="set-alarm"]',
				title: 'tour.andOneAboutNothing',
				body: 'tour.aDayAndASentence'
			},
			{
				target: '[data-tour="reminder-sounds"]',
				title: 'tour.whatIsWorthHearing',
				body: 'tour.everythingShowsNothingMakesA'
			}
		]
	},

	'/health/recipes': {
		label: 'tour.recipes',
		steps: [
			{
				title: 'tour.recipesAndWhatTheyCost',
				body: 'tour.ingredientsStepsAndACook'
			},
			{
				target: '[data-tour="recipe-new"]',
				title: 'tour.pasteThePageIn',
				body: 'tour.copyARecipeFromWherever'
			},
			{
				target: '[data-tour="recipe-pictures"]',
				title: 'tour.andWhatItLooksLike',
				body: 'tour.upToSixPicturesPer'
			},
			{
				target: '[data-tour="recipe-list"]',
				title: 'tour.anIngredientIsAShopping',
				body: 'tour.putARecipeOnThe'
			},
			{
				target: '[data-tour="recipe-list"]',
				title: 'tour.theCalendarButtonPutsIt',
				body: 'tour.itBecomesABlockOn'
			}
		]
	},

	'/search': {
		label: 'tour.search',
		steps: [
			{
				title: 'tour.everythingInOneBox',
				body: 'tour.entriesNotesIdeasGoalsPeople'
			},
			{
				target: '[data-tour="search-box"]',
				title: 'tour.typeAWordYouRemember',
				body: 'tour.matchingIsOnTheWords'
			}
		]
	},

	'/settings/preferences': {
		label: 'tour.preferences',
		steps: [
			{
				title: 'tour.theAppArrangedYourWay',
				body: 'tour.whatTheWeekStartsOn'
			},
			{
				target: '[data-tour="prefs-menu"]',
				title: 'tour.yourRoomsYourOrderYour',
				body: 'tour.dragARoomUpOr'
			},
			{
				target: '[data-tour="prefs-theme"]',
				title: 'tour.lightDarkOrWhateverThe',
				body: 'tour.systemFollowsThePhoneOr'
			}
		]
	},

	'/settings/account': {
		label: 'tour.account',
		steps: [
			{
				title: 'tour.yourAccountAndYourData',
				body: 'tour.emailPasswordTheDevicesYou'
			},
			{
				target: '[data-tour="account-sessions"]',
				title: 'tour.everyDeviceThatIsSigned',
				body: 'tour.signOneOutOrAll'
			},
			{
				target: '[data-tour="account-export"]',
				title: 'tour.takeItWithYou',
				body: 'tour.everythingYouHaveWrittenIn'
			}
		]
	},

	'/settings/integrations/connections': {
		label: 'tour.integrations',
		steps: [
			{
				title: 'tour.lettingOtherThingsIn',
				body: 'tour.tokensForProgramsThatRead'
			},
			{
				target: '[data-tour="integrations-tokens"]',
				title: 'tour.aTokenIsShownOnce',
				body: 'tour.scopedToWhatItNeeds'
			},
			{
				target: '[data-tour="integrations-streams"]',
				title: 'tour.numbersFromElsewhere',
				body: 'tour.aStreamIsASeries'
			}
		]
	}
};

/**
 * The tour for a path, or nothing.
 *
 * Exact first, then the longest registered path this one sits under — so a
 * notebook's own page is toured as Notebooks, while `/notebooks/people` keeps its
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
