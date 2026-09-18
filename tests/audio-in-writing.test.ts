import { describe, expect, it } from 'vitest';
import { audioMarkdown, audioReferencedIn, splitAudio } from '../src/lib/audio-markdown';
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

/**
 * And where the writing is drawn as writing rather than as markdown.
 *
 * An idea and a note about somebody are a sentence, not a document, so they
 * are printed as typed — which put `[my great idea, in audio](/media/audio/40)`
 * in the middle of somebody's own words. `splitAudio` takes the link out and
 * names the recording, to be drawn under the text as a player.
 */
describe('a recording taken out of the text it is written in', () => {
	it('leaves the writing and names the recording', () => {
		const written = `My greatest idea of all\n${audioMarkdown(40, 'in audio')}`;
		expect(splitAudio(written)).toEqual({ text: 'My greatest idea of all', audios: [40] });
	});

	it('closes the hole the line leaves behind', () => {
		const written = `before\n\n${audioMarkdown(7, 'a recording')}\n\nafter`;
		expect(splitAudio(written).text).toBe('before\n\nafter');
	});

	it('names each recording once, in the order they are mentioned', () => {
		const written = `${audioMarkdown(9, 'second')} ${audioMarkdown(4, 'first')} ${audioMarkdown(9, 'again')}`;
		expect(splitAudio(written).audios).toEqual([9, 4]);
	});

	it('leaves writing with no recording in it exactly as it was', () => {
		expect(splitAudio('nothing to hear here')).toEqual({
			text: 'nothing to hear here',
			audios: []
		});
	});

	/** Somebody else's address is a link, not a recording — the renderer's rule. */
	it('leaves a link to somewhere else alone', () => {
		const written = 'see [the talk](https://example.invalid/media/audio/40)';
		expect(splitAudio(written)).toEqual({ text: written, audios: [] });
	});
});
