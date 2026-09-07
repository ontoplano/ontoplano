/**
 * The docs preview, serving them the way the real host does.
 *
 * `python3 -m http.server` used to do this, and every link in the docs 404ed:
 * the pages link to `/interfaces`, the file on disk is `interfaces.html`, and
 * a plain static server has no opinion about the difference. nginx does —
 * `try_files $uri $uri.html $uri/ =404` in `ontoplano-server/bin/docs-setup.sh`
 * — so the preview was showing something nobody would ever be served. This is
 * that rule, in the runtime the repo already needs, which also takes Python
 * off the list of things a contributor must have.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'build-docs');
const port = Number(process.argv[3] ?? 1494);

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2',
	'.txt': 'text/plain; charset=utf-8'
};

/** The first of nginx's candidates that exists, or null. */
function pick(pathname) {
	// `normalize` collapses `..` before the join, so a request cannot climb out
	// of the directory being served.
	const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
	const base = join(root, rel);
	if (!base.startsWith(root)) return null;
	for (const candidate of [base, `${base}.html`, join(base, 'index.html')]) {
		if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
	}
	return null;
}

createServer((req, res) => {
	const pathname = new URL(req.url, 'http://localhost').pathname;
	const file = pick(pathname === '/' ? '/index.html' : pathname);

	if (!file) {
		const notFound = join(root, '404.html');
		const body = existsSync(notFound) ? createReadStream(notFound) : null;
		res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
		if (body) body.pipe(res);
		else res.end('Not found\n');
		return;
	}

	res.writeHead(200, {
		'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
		// A preview is read as it is regenerated; a cached page would be a lie.
		'cache-control': 'no-store'
	});
	createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => {
	console.log(`documentation at http://localhost:${port} — Ctrl-C to stop`);
});
