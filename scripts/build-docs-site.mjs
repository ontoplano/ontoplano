/**
 * The wiki, as a site somebody can read without a git checkout.
 *
 * `build-docs.mjs` produces markdown in `docs/wiki/`, which is the right shape
 * for a repository — reviewable in a diff, greppable, and checked for drift by
 * `yarn docs:check`. It is the wrong shape for reading on a phone, so this
 * turns the same files into static HTML for docs.ontoplano.com.
 *
 * Deliberately not a static site generator. What is needed here is a nav, a
 * heading scale and a table that scrolls — and every generator that does those
 * three things also brings a config format, a theme system and a Python or
 * framework toolchain into the deploy path of a project that has neither. If
 * this ever needs search, versioned docs or i18n, that is the moment to adopt
 * MkDocs Material or Starlight and delete this file. It is a hundred lines; it
 * is meant to be deletable.
 *
 * Output is self-contained: one stylesheet inline, no fonts fetched, no
 * scripts. It is served by nginx as plain files.
 *
 *   node scripts/build-docs-site.mjs [outdir]     # default: build-docs/
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

import { anchor } from './lib/anchor.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WIKI = join(ROOT, 'docs', 'wiki');
const OUT = join(ROOT, process.argv[2] ?? 'build-docs');

if (!existsSync(WIKI)) {
	console.error('No docs/wiki — run `yarn docs` first.');
	process.exit(1);
}

/** The order the index puts them in, which is the order to read them in. */
function navOrder(index) {
	const links = [...index.matchAll(/\]\(([\w-]+\.md)\)/g)].map((m) => m[1]);
	return [...new Set(links)];
}

const index = readFileSync(join(WIKI, 'README.md'), 'utf8');
const files = readdirSync(WIKI).filter((f) => f.endsWith('.md') && f !== 'README.md');
const ordered = [
	...navOrder(index).filter((f) => files.includes(f)),
	...files.filter((f) => !navOrder(index).includes(f))
];

/** A page's own title: its first heading, or the filename. */
function titleOf(markdown, file) {
	return /^#\s+(.+)$/m.exec(markdown)?.[1] ?? file.replace(/\.md$/, '');
}

const pages = [
	{ file: 'README.md', href: 'index.html', link: '/', markdown: index },
	...ordered.map((file) => ({
		file,
		href: file.replace(/\.md$/, '.html'),
		// The address it is linked by, which is not the filename it is written to.
		link: `/${file.replace(/\.md$/, '')}`,
		markdown: readFileSync(join(WIKI, file), 'utf8')
	}))
].map((p) => ({ ...p, title: titleOf(p.markdown, p.file) }));

const STYLE = `
:root {
  --ink: #171a1f; --muted: #5b6270; --line: #e2e5ea; --bg: #ffffff;
  --soft: #f6f7f9; --link: #1d4ed8;
  --sans: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, monospace;
}
@media (prefers-color-scheme: dark) {
  :root { --ink: #e6e8ec; --muted: #9aa2b1; --line: #2a2f3a; --bg: #12151a;
          --soft: #1a1e26; --link: #93b4ff; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--sans);
       line-height: 1.6; font-size: 16px; }
a { color: var(--link); }
.wrap { display: flex; align-items: flex-start; gap: 3rem; max-width: 76rem;
        margin: 0 auto; padding: 2rem 1.25rem 6rem; }
nav { position: sticky; top: 2rem; flex: 0 0 15rem; font-size: 0.9rem; }
nav .brand { font-weight: 700; letter-spacing: -0.01em; margin-bottom: 1rem; display: block;
             color: var(--ink); text-decoration: none; font-size: 1.05rem; }
nav ul { list-style: none; margin: 0; padding: 0; }
nav li { margin: 0.15rem 0; }
nav a { display: block; padding: 0.25rem 0.5rem; text-decoration: none; color: var(--muted);
        border-left: 2px solid transparent; }
nav a:hover { color: var(--ink); }
nav a[aria-current] { color: var(--ink); border-left-color: var(--ink); font-weight: 600; }
main { min-width: 0; flex: 1; }
h1 { font-size: 2rem; letter-spacing: -0.02em; margin: 0 0 1rem; }
h2 { font-size: 1.3rem; margin: 2.5rem 0 0.75rem; padding-top: 0.5rem;
     border-top: 1px solid var(--line); }
h3 { font-size: 1.05rem; margin: 1.75rem 0 0.5rem; }
p, ul, ol { margin: 0.75rem 0; }
code { font-family: var(--mono); font-size: 0.86em; background: var(--soft);
       border: 1px solid var(--line); padding: 0.05em 0.3em; }
pre { overflow-x: auto; background: var(--soft); border: 1px solid var(--line);
      padding: 0.75rem 1rem; }
pre code { background: none; border: 0; padding: 0; }
/* Wide tables scroll inside themselves; the page never does. */
.table { overflow-x: auto; margin: 1rem 0; border: 1px solid var(--line); }
table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
th, td { text-align: left; padding: 0.45rem 0.75rem; border-bottom: 1px solid var(--line);
         vertical-align: top; }
th { font-weight: 600; background: var(--soft); white-space: nowrap; }
tr:last-child td { border-bottom: 0; }
blockquote { margin: 1rem 0; padding-left: 1rem; border-left: 3px solid var(--line);
             color: var(--muted); }
kbd { font-family: var(--mono); font-size: 0.8em; border: 1px solid var(--line);
      background: var(--soft); padding: 0.05em 0.35em; }
footer { margin-top: 4rem; padding-top: 1rem; border-top: 1px solid var(--line);
         color: var(--muted); font-size: 0.85rem; }
@media (max-width: 60rem) {
  .wrap { display: block; padding-top: 1.25rem; }
  nav { position: static; margin-bottom: 2rem; }
}
`.trim();

const escape = (text) =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Links between wiki pages are `.md` in the repo and bare paths here.
 *
 * `/the-plan` rather than `/the-plan.html`: the vhost resolves both, and the
 * address somebody copies out of the bar should not carry an implementation
 * detail of how the page is stored.
 */
function rewriteLinks(html) {
	return html.replace(
		/href="([\w-]+)\.md(#[^"]*)?"/g,
		(_, name, hash) => `href="${name === 'README' ? '/' : `/${name}`}${hash ?? ''}"`
	);
}

/**
 * Every heading gets the anchor its own table of contents links to.
 *
 * marked stopped adding heading ids, so `data-model#recurring_tasks` landed on the
 * page and scrolled nowhere — the link was there, the target was not. The slug
 * comes from `build-docs.mjs` so the markdown in the repo and the page on the
 * site cannot disagree about it.
 */
marked.use({
	renderer: {
		heading({ tokens, depth }) {
			const text = this.parser.parseInline(tokens);
			const id = anchor(this.parser.parseInline(tokens, this.parser.textRenderer));
			return `<h${depth} id="${id}">${text}</h${depth}>\n`;
		}
	}
});

function render(page) {
	const body = rewriteLinks(marked.parse(page.markdown, { async: false }))
		// Every table gets its own scroll container, so a wide data model does
		// not make the whole page scroll sideways on a phone.
		.replace(/<table>/g, '<div class="table"><table>')
		.replace(/<\/table>/g, '</table></div>');

	const nav = pages
		.map(
			(p) =>
				`<li><a href="${p.link}"${p.href === page.href ? ' aria-current="page"' : ''}>${escape(
					p.title
				)}</a></li>`
		)
		.join('\n        ');

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(page.title)} · ontoplano docs</title>
<meta name="description" content="How ontoplano works: ${escape(page.title)}.">
<style>${STYLE}</style>
</head>
<body>
  <div class="wrap">
    <nav>
      <a class="brand" href="/">ontoplano docs</a>
      <ul>
        ${nav}
      </ul>
    </nav>
    <main>
${body}
      <footer>
        Generated from <a href="https://github.com/ontoplano/ontoplano">the ontoplano source</a>.
      </footer>
    </main>
  </div>
</body>
</html>
`;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const page of pages) writeFileSync(join(OUT, page.href), render(page));

/*
 * A page for the addresses that are not pages.
 *
 * Without one, nginx answers with its own — white, serif, "404 Not Found", and
 * no way back into the documentation. It is the same wiki chrome as every
 * other page here, with the nav, because the useful thing to offer somebody
 * who mistyped a URL is the list of what does exist.
 *
 * It renders through the same `render()` as the rest, so it cannot drift from
 * them, and the vhost points `error_page 404` at it.
 */
writeFileSync(
	join(OUT, '404.html'),
	render({
		title: 'Not found',
		href: '404.html',
		link: '/404',
		markdown: [
			'# Not found',
			'',
			'There is no page at that address. The documentation is in the list beside',
			'this one — or start from [the beginning](/).',
			'',
			'If you followed a link from somewhere in the app and it brought you here,',
			'that is a bug worth reporting.'
		].join('\n')
	})
);

console.log(`docs site: wrote ${pages.length} pages and a 404 to ${OUT.replace(ROOT + '/', '')}/`);
