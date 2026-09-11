/**
 * Serve the local build the way its shell would.
 *
 * Capacitor, or any static host, serves files and answers unknown paths with
 * the fallback page — that is the whole contract. This does the same, for
 * the e2e suite and for looking at the thing: `make local-preview`.
 */
import { createServer } from 'node:http';
import sirv from 'sirv';

const port = Number(process.env.PORT || 4180);
const serve = sirv('build-local', { single: 'index.html', dev: true });

createServer((req, res) => serve(req, res)).listen(port, () => {
	console.log(`local build on http://localhost:${port}`);
});
