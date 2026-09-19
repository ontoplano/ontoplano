import { describe, expect, test } from 'vitest';
import { pictureMarkdown, splitPictures } from './picture-markdown';

describe('writing a picture into somebody’s writing', () => {
	test('is ordinary markdown, so a plain renderer still shows it', () => {
		expect(pictureMarkdown(12, 'a cake')).toBe('![a cake](/media/12)');
	});

	test('survives a filename with brackets in it', () => {
		expect(pictureMarkdown(12, 'shot [2].png')).toBe('![shot  2 .png](/media/12)');
	});

	test('falls back to something rather than an empty label', () => {
		expect(pictureMarkdown(12, '   ')).toBe('![picture 12](/media/12)');
	});
});

describe('taking them back out', () => {
	test('leaves writing with no picture in it exactly as it was', () => {
		expect(splitPictures('ring the plumber')).toEqual({
			text: 'ring the plumber',
			pictures: []
		});
	});

	test('lifts the picture out and keeps the sentence around it', () => {
		expect(splitPictures('this screen is wrong\n\n![shot](/media/12)\n\nfix the header')).toEqual({
			text: 'this screen is wrong\n\nfix the header',
			pictures: [12]
		});
	});

	test('keeps several, in the order they were written, without repeats', () => {
		const { pictures } = splitPictures('![a](/media/3) ![b](/media/9) ![a again](/media/3)');
		expect(pictures).toEqual([3, 9]);
	});

	/*
	 * The two paths overlap — a recording is `/media/audio/40` and a picture is
	 * `/media/12` — so a looser pattern would eat the recording link and leave
	 * an audio id where a picture id should be.
	 */
	test('leaves a recording alone', () => {
		const spoken = '[ring the plumber](/media/audio/40)';
		expect(splitPictures(spoken)).toEqual({ text: spoken, pictures: [] });
	});

	test('leaves a plain link to a picture as a link', () => {
		const linked = 'see [the shot](/media/12)';
		expect(splitPictures(linked)).toEqual({ text: linked, pictures: [] });
	});

	test('a picture and nothing else leaves no text behind', () => {
		expect(splitPictures('![shot](/media/12)')).toEqual({ text: '', pictures: [12] });
	});
});
