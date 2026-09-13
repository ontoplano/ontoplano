/**
 * Changing tab, as a movement rather than a cut.
 *
 * The only transition in the app. There was a dissolve over every navigation
 * once, tuned three ways, and it never earned its place: a whole-screen effect
 * on every link is something to be sure about, and nobody was. Tabs are the
 * one case where a movement says something true — Ledgers, Bills, Rules and
 * Insights sit in a row, so going right should look like going right.
 *
 * Phone only, and within one room only. On a wide screen the tabs are a row of
 * links a mouse hits directly; there is nothing to orient.
 */

/** How long one tab change takes, out and in together. */
export const TAB_SLIDE_MS = 220;

/** How far the two panes travel, as a fraction of the pane's width. */
export const TAB_SLIDE_TRAVEL = 0.25;

/** The easing both halves use. */
export const TAB_SLIDE_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

/**
 * How far a finger has to go sideways before it is changing tab.
 *
 * Two conditions, not one. The distance keeps a tap that wandered from
 * counting, and the ratio keeps a diagonal scroll from counting: the page's
 * own scroll wins unless the gesture is clearly across it.
 */
export const TAB_SWIPE_MIN_PX = 60;
export const TAB_SWIPE_RATIO = 1.6;
