import { describe, expect, it } from 'vitest';
import { audioMarkdown, audioReferencedIn } from '../src/lib/audio-markdown';
import { renderMarkdown } from '../src/lib/markdown';

/**
 * A recording inside something written.
 *
 * Three places have to agree about one shape: the endpoint that stores a
 * recording and hands back the line, the button that writes that line into a
 * textarea, and the renderer that turns it back into a player. Spelled
 * slightly differently in any of them and a recording renders as a link to a
 * file — which works, and is not what anybody meant.
 *
 * The other half is the rule the pictures already have: only this app's own
 * address becomes a player. An arbitrary one would fetch from a third party
 * every time somebody opened the entry, telling that host who is reading and
 * when.
 */
describe('the line a recording is written as', () => {
	it('is what the renderer turns back into a player', () => {
		const html = renderMarkdown(audioMarkdown(12, 'a thing I said'));

		expect(html).toContain('<audio');
		expect(html).toContain('src="/media/audio/12"');
		expect(html).toContain('controls');
		// Nothing is fetched until somebody presses it.
		expect(html).toContain('preload="none"');
	});

	it('survives a name that would close the link early', () => {
		const line = audioMarkdown(3, 'note [draft] two');
		expect(line).toBe('[note  draft  two](/media/audio/3)');
		expect(renderMarkdown(line)).toContain('src="/media/audio/3"');
	});

	it('falls back to naming the row when there is no name', () => {
		expect(audioMarkdown(7, '   ')).toBe('[recording 7](/media/audio/7)');
	});

	it('is found again in the text that carries it', () => {
		const written = `First.\n\n${audioMarkdown(4, 'one')}\n\nThen ${audioMarkdown(9, 'two')} and ${audioMarkdown(4, 'one again')}.`;
		expect(audioReferencedIn(written)).toEqual([4, 9]);
		expect(audioReferencedIn('nothing here')).toEqual([]);
	});
});

describe('what does not become a player', () => {
	it('leaves somebody else’s address as an ordinary link', () => {
		const html = renderMarkdown('[listen](https://example.com/media/audio/1)');
		expect(html).not.toContain('<audio');
		expect(html).toContain('<a href="https://example.com/media/audio/1"');
	});

	it('does not read a picture as a recording', () => {
		const html = renderMarkdown('![a photo](/media/12)');
		expect(html).toContain('<img');
		expect(html).not.toContain('<audio');
	});
});
