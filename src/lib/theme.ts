/**
 * Theme vocabulary, shared by the client.
 *
 * `system` defers to `prefers-color-scheme`; the resolution happens in CSS
 * (see `layout.css`), because the server cannot know a device's setting and a
 * client-side guess would paint the wrong theme first.
 *
 * The server-side reader and writer live in `$lib/server/settings.ts`.
 */
export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/**
 * The word for each theme, short enough for a row of three.
 *
 * Here rather than in the menu that draws them, because two screens offer the
 * same choice — the account menu and the welcome walk — and one of them was
 * printing the identifier itself with `capitalize` on it, so every language
 * but English read "system light dark".
 */
export const THEME_LABELS: Record<Theme, 'app.system' | 'app.light' | 'app.dark'> = {
	system: 'app.system',
	light: 'app.light',
	dark: 'app.dark'
};
