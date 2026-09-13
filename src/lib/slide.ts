/**
 * Moving between screens, as a movement rather than a cut.
 *
 * The only transition in the app. There was a dissolve over every navigation
 * once, tuned three ways, and it never earned its place. What is left is the
 * one thing a movement can say truthfully: these screens sit in a row, and you
 * went that way along it.
 *
 * Two rows, and the same movement over both — the tabs inside a room, in the
 * order the strip shows them, and the rooms themselves, in the order they sit
 * in the menu. Which way it goes is which way you moved along the row.
 *
 * Phone only. On a wide screen every tab and every room is a link a mouse hits
 * directly; there is no row to be oriented in.
 */

/** How long one change of screen takes, out and in together. */
export const SLIDE_MS = 260;

/**
 * How far the two screens travel, as a fraction of the pane's width.
 *
 * The whole way, and a little past it. A quarter of the width with a fade was
 * the first attempt and it read as a wobble — the screen never left, so
 * nothing was replaced; it just moved a little and changed. What an app does
 * here is take the old screen off the edge and bring the new one on from the
 * other, and the reason it is convincing is that it is the whole distance.
 *
 * The extra is margin rather than decoration: a screen that stops exactly on
 * the edge is a screen with a sliver of itself still showing, and it shows
 * until the copy is taken away a frame later — which is the piece that used to
 * stand in the corner after the new screen had arrived.
 */
export const SLIDE_TRAVEL = 1.08;

/** The easing both halves use. */
export const SLIDE_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

/**
 * How far off level a screen is at the end of a room change, in degrees.
 *
 * A room change is a turn of the menu, and a turn of a wheel is not a straight
 * line. The screens travel along the top of a circle far below them, so one
 * leaving to the right also sinks and tilts as it goes and the one arriving
 * rises into place — the same movement, bent.
 *
 * The angle rather than the wheel's radius, because the radius that gives a
 * gentle arc on a phone gives an eighteen-degree lurch on a laptop: the
 * distance travelled is the width of the screen, and that is what changes. Fix
 * the angle and the radius follows from the width, so it looks the same
 * everywhere. Four degrees is an arc you feel rather than one you look at.
 *
 * A room's tabs are a straight row and stay one. The difference is the point:
 * a swipe along the tabs has a finger behind it going in a straight line, and
 * a room comes off a wheel.
 */
export const ARC_DEGREES = 12;

/**
 * How far a finger has to go sideways before it is changing screen.
 *
 * Two conditions, not one. The distance keeps a tap that wandered from
 * counting, and the ratio keeps a diagonal scroll from counting: the page's
 * own scroll wins unless the gesture is clearly across it.
 */
export const SWIPE_MIN_PX = 60;
export const SWIPE_RATIO = 1.6;

/**
 * Put a screen back on view without moving it.
 *
 * For the navigation that never arrives — one abandoned, or superseded by
 * another — where the screen was hidden for a movement that is not going to
 * finish. Nothing here should be able to leave the app looking at nothing.
 */
export function stopHiding(pane: HTMLElement | undefined): void {
	if (!pane) return;
	pane.style.visibility = '';
	pane.style.transform = '';
	pane.style.willChange = '';
}

/** Whether this screen gets the movement at all. */
export function slidesHere(): boolean {
	return (
		typeof window !== 'undefined' &&
		window.matchMedia('(pointer: coarse)').matches &&
		!window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

/**
 * Lay a copy of the screen that is leaving over the frame, and slide it off.
 *
 * SvelteKit swaps the content the moment the new page is ready, so by the time
 * anything could animate the old screen it is already gone. The copy goes into
 * a container the framework renders and never puts anything in: the runtime
 * places its own nodes by their neighbours, and an element it did not create
 * sitting among them is how that goes wrong.
 */
/**
 * Where the wheel's centre is for this screen, as a `transform-origin`.
 *
 * Rotation about a point far below is the whole trick: one number moves the
 * screen sideways, sinks it and tilts it, and the path it takes between here
 * and there is the arc rather than a diagonal.
 *
 * The radius is set from the *lowest* part of the screen anybody can see, not
 * from its centre. On a wheel, how far a point travels depends on how far it
 * is from the hub — and the hub is below, so the bottom of the screen moves
 * least. Sized from the centre, the bottom fell short of the edge by the
 * difference and a wedge of the old screen stood in the corner until its copy
 * was taken away. Sized from the bottom, everything above it travels further
 * and the whole screen clears.
 *
 * Capped at the window: a room whose page is three screens tall has its bottom
 * far below anything on view, and correcting for a part nobody can see only
 * makes the movement longer.
 */
function hub(pane: HTMLElement): string {
	const travel = pane.offsetWidth * SLIDE_TRAVEL;
	const onView = Math.min(pane.offsetHeight, window.innerHeight);
	const radius = travel / Math.sin((ARC_DEGREES * Math.PI) / 180) + onView / 2;
	// Measured from the element's top edge, so its own half-height comes first.
	return `50% ${pane.offsetHeight / 2 + radius}px`;
}

/**
 * Lay a copy of the screen that is leaving over the frame, and slide it off.
 *
 * SvelteKit swaps the content the moment the new page is ready, so by the time
 * anything could animate the old screen it is already gone. The copy goes into
 * a container the framework renders and never puts anything in: the runtime
 * places its own nodes by their neighbours, and an element it did not create
 * sitting among them is how that goes wrong.
 *
 * `arc` bends the path: straight for a room's tabs, round the wheel for the
 * rooms themselves.
 */
export function slideAway(
	stage: HTMLElement,
	pane: HTMLElement,
	direction: number,
	arc = false
): void {
	/*
	 * And the original goes out of sight while its copy travels.
	 *
	 * Without this the copy slides off over a screen that is identical to it
	 * and has not moved, so nothing appears to happen — and then the new page
	 * arrives and slides in, which reads as the whole movement waiting for the
	 * load. It is the other way round: the screen leaves the moment you ask it
	 * to, and what is behind it is the wait.
	 */
	pane.style.visibility = 'hidden';

	const leaving = pane.cloneNode(true) as HTMLElement;
	leaving.setAttribute('aria-hidden', 'true');
	/*
	 * `will-change` puts it on a layer of its own before the first frame rather
	 * than during it. Without that the browser discovers halfway through that
	 * this thing is moving, promotes it then, and the promotion itself is a
	 * frame or two — on a screen the size of a page, that is the stutter.
	 */
	leaving.style.cssText =
		`position:absolute;inset:0;pointer-events:none;` +
		`width:${pane.offsetWidth}px;will-change:transform`;
	if (arc) leaving.style.transformOrigin = hub(pane);

	const level = arc ? 'rotate(0deg)' : 'translateX(0%)';
	const gone = arc
		? `rotate(${-direction * ARC_DEGREES}deg)`
		: `translateX(${-direction * SLIDE_TRAVEL * 100}%)`;

	// Where it starts, before it is in the document: a copy appended without
	// this is painted once at rest and then jumps, which is the flick.
	leaving.style.transform = level;
	stage.append(leaving);

	leaving
		.animate([{ transform: level }, { transform: gone }], {
			duration: SLIDE_MS,
			easing: SLIDE_EASING,
			fill: 'forwards'
		})
		.addEventListener('finish', () => leaving.remove());
}

/** And bring the one that arrived on from the other side. */
export function slideOn(pane: HTMLElement, direction: number, arc = false): void {
	if (arc) pane.style.transformOrigin = hub(pane);

	// Explicit rather than `none`: an animation whose last keyframe is `none`
	// resolves to no transform at all, and there is then nothing to read back
	// while it runs.
	const level = arc ? 'rotate(0deg)' : 'translateX(0%)';
	const from = arc
		? `rotate(${direction * ARC_DEGREES}deg)`
		: `translateX(${direction * SLIDE_TRAVEL * 100}%)`;

	/*
	 * Placed where it starts, and only then shown.
	 *
	 * An animation's first frame is the next frame, and the screen was being
	 * made visible in this one — so the browser painted it once at its resting
	 * place before jumping it to the edge to come in. That single wrong frame
	 * is the flick. Setting the transform and the visibility together means
	 * the first time it is seen, it is already where it starts from.
	 */
	pane.style.willChange = 'transform';
	pane.style.transform = from;
	pane.style.visibility = '';

	const arriving = pane.animate([{ transform: from }, { transform: level }], {
		duration: SLIDE_MS,
		easing: SLIDE_EASING
	});

	// The inline transform is only there to hold the first frame; the animation
	// owns it after that, and a layer nobody is animating costs memory.
	arriving.addEventListener('finish', () => {
		pane.style.transform = '';
		pane.style.willChange = '';
	});
	arriving.addEventListener('cancel', () => {
		pane.style.transform = '';
		pane.style.willChange = '';
	});
}
