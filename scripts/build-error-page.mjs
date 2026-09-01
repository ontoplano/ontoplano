/**
 * The page nginx serves when the app is not answering.
 *
 * Everything else in this repo is rendered by the app, which is exactly what
 * has gone wrong by the time somebody sees this. So it is one file with nothing
 * outside it: no stylesheet, no script, no font, no image request — every one of
 * those would be a second request to the process that is already not there, and
 * the visitor would get the browser's own grey error page with a broken layout
 * on top of it.
 *
 * Generated rather than committed, and generated from `mark.png`, because that
 * file is the one copy of the logo. A hand-pasted copy here is a second one that
 * goes stale the first time the mark changes.
 *
 * It lands in the build output, which the deploy already ships, so there is no
 * extra directory on the box and no step anybody has to remember. It is also
 * reachable at `/503.html` while the app is up, which is the only way to look
 * at it without taking the instance down.
 *
 * On what it says: two sentences. The thing is not answering, and the page will
 * keep asking. It promises nothing else — not "our fault", not "your data is
 * safe", because this file is a flat file on a disk and cannot know either. And
 * it names nothing about the machine: no host, no unit, no path, no command.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'build', 'client', '503.html');

/** How big the mark is drawn, in CSS pixels, and at twice that in the file. */
const MARK_PX = 30;

/**
 * The logo, inlined and small.
 *
 * A data URI rather than an `<img src="/icons/…">`: this page is served by
 * nginx off a flat file precisely because the app is not answering, and a
 * request for anything under `/icons/` would go to the app and fail with it.
 *
 * Redrawn at the size it is shown rather than inlined whole. `mark.png` is
 * 1024 square, which is right for a launcher icon and is 660kB — and inlining
 * it made this page 900kB, which is an absurd thing to send somebody whose
 * network or server is already having a bad day.
 *
 * If there is no rasteriser the mark is left off. A wordmark with no logo is a
 * smaller loss than a page that will not arrive.
 */
const mark = await (async () => {
	const png = readFileSync(join(ROOT, 'src/lib/logo/mark.png'));
	const whole = `data:image/png;base64,${png.toString('base64')}`;
	try {
		const { Resvg } = await import('@resvg/resvg-js');
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${MARK_PX * 2}" height="${MARK_PX * 2}"><image width="${MARK_PX * 2}" height="${MARK_PX * 2}" xlink:href="${whole}"/></svg>`;
		const small = new Resvg(svg, { fitTo: { mode: 'width', value: MARK_PX * 2 } }).render().asPng();
		return `data:image/png;base64,${Buffer.from(small).toString('base64')}`;
	} catch {
		return null;
	}
})();

/** How often the page asks again. Long enough not to be a load test. */
const RETRY_SECONDS = 20;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="${RETRY_SECONDS}">
<meta name="robots" content="noindex">
<title>ontoplano is not answering</title>
<style>
:root {
  --ink: #171a1f; --muted: #5b6270; --line: #e2e5ea; --bg: #f6f7f9;
  --card: #ffffff; --bad: #b91c1c;
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root { --ink: #e6e8ec; --muted: #9aa2b1; --line: #2a2f3a; --bg: #0f1319;
          --card: #161b22; --bad: #f87171; }
}
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: flex; align-items: center;
       justify-content: center; padding: 1.5rem;
       background: var(--bg); color: var(--ink); font-family: var(--sans);
       line-height: 1.6; font-size: 16px; }
main { width: 100%; max-width: 30rem; background: var(--card);
       border: 1px solid var(--line); border-top: 3px solid var(--bad);
       padding: 2rem; }
.brand { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.75rem; }
.brand img { width: ${MARK_PX}px; height: ${MARK_PX}px; display: block; }
.brand span { font-weight: 700; letter-spacing: -0.01em; }
h1 { font-size: 1.35rem; letter-spacing: -0.02em; margin: 0 0 0.75rem; }
p { margin: 0.75rem 0; color: var(--muted); }
p.lead { color: var(--ink); }
</style>
</head>
<body>
<main>
  <div class="brand">${mark ? `<img src="${mark}" alt="">` : ''}<span>ontoplano</span></div>
  <h1>Not answering right now</h1>
  <p class="lead">Ontoplano is not responding at this address.</p>
  <p>This page tries again every ${RETRY_SECONDS} seconds, so leaving the tab open is enough.</p>
</main>
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(
	`error page: wrote ${OUT.replace(ROOT + '/', '')} (${Math.round(html.length / 1024)}kB)`
);
