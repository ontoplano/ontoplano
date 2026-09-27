import { describe, expect, test } from 'vitest';
import {
	allFolders,
	movedFolder,
	normaliseFolder,
	notebookPath,
	parentFolder,
	shelfOf,
	splitLegacyTitle
} from './notebook-path';

describe('folder paths', () => {
	test('are tidied to segments joined by one slash', () => {
		expect(normaliseFolder(' Home / Kitchen//')).toBe('Home/Kitchen');
		expect(normaliseFolder('   ')).toBe('');
		expect(parentFolder('Home/Kitchen')).toBe('Home');
		expect(parentFolder('Home')).toBe('');
	});

	test('move by prefix, and only inside the folder named', () => {
		expect(movedFolder('Home/Kitchen', 'Home', 'Flat')).toBe('Flat/Kitchen');
		expect(movedFolder('Home', 'Home', '')).toBe('');
		expect(movedFolder('Homeware', 'Home', 'Flat')).toBeNull();
	});

	test('a picker names a notebook by its whole path', () => {
		expect(notebookPath({ title: 'Sink', folder: 'Home/Kitchen' })).toBe('Home/Kitchen/Sink');
		expect(notebookPath({ title: 'Sink', folder: '' })).toBe('Sink');
	});

	test('an old dashed title splits into a folder and a name', () => {
		expect(splitLegacyTitle('Home — Kitchen — Sink')).toEqual({
			folder: 'Home/Kitchen',
			title: 'Sink'
		});
		expect(splitLegacyTitle('Plain')).toEqual({ folder: '', title: 'Plain' });
		expect(splitLegacyTitle('Trip — ')).toEqual({ folder: '', title: 'Trip — ' });
	});
});

describe('the shelf', () => {
	const books = [
		{ id: 1, folder: '' },
		{ id: 2, folder: 'Home' },
		{ id: 3, folder: 'Home/Kitchen' },
		{ id: 4, folder: 'Trips/2026' }
	];

	test('groups notebooks under their folders, nested, folders first', () => {
		const shelf = shelfOf(books);
		expect(shelf.notebooks.map((n) => n.id)).toEqual([1]);
		expect(shelf.folders.map((f) => f.path)).toEqual(['Home', 'Trips']);

		const home = shelf.folders[0];
		expect(home.notebooks.map((n) => n.id)).toEqual([2]);
		expect(home.folders.map((f) => f.name)).toEqual(['Kitchen']);
		// A folder counts what is in it at any depth.
		expect(home.count).toBe(2);

		// A folder with nothing but another folder in it is still there.
		const trips = shelf.folders[1];
		expect(trips.notebooks).toEqual([]);
		expect(trips.folders[0].notebooks.map((n) => n.id)).toEqual([4]);
		expect(trips.count).toBe(1);
	});

	test('offers every folder, ancestors included, for suggestions', () => {
		expect(allFolders(books)).toEqual(['Home', 'Home/Kitchen', 'Trips', 'Trips/2026']);
	});
});
