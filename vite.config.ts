import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		/**
		 * Listen on every address, not just `localhost`.
		 *
		 * Vite's default binds to `localhost`, which Node may resolve to
		 * `127.0.0.1` alone — while a browser asking for a name like
		 * `ontoplano.localhost` may pick `::1`. Nothing is listening there, so the
		 * connection is refused: intermittently, because which address wins depends
		 * on the resolver's mood. It looks exactly like the server having crashed,
		 * and it is one of the few ways to get `NS_ERROR_CONNECTION_REFUSED` with a
		 * perfectly healthy process and an empty log.
		 */
		host: true,
		/**
		 * And say so rather than silently moving.
		 *
		 * Without this Vite picks the next free port when 5173 is taken, so a
		 * second `yarn dev` in another terminal quietly steals the name and the
		 * first one is talking to nobody.
		 */
		strictPort: true
	}
});
