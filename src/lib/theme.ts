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
