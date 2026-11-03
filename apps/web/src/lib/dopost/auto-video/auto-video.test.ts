import { afterEach, describe, expect, it, vi } from 'vitest';
import { compileStoryboardToProject } from './compiler';
import { AUTO_VIDEO_FORMAT_SCENES } from './formats';
import {
	normalizedAutoVideoOwnership,
	ownedItemIdsForCategory,
	replaceOwnershipCategory,
	replaceSceneOwnershipCategory
} from './ownership';
import {
	documentaryManifest,
	fromRemote,
	loadAutoVideoSidecar,
	loadAutoVideoSidecarRemote,
	saveAutoVideoSidecar,
	saveAutoVideoSidecarRemote,
	type RemoteSidecar
} from './sidecar';
import { buildStarterStoryboard } from './storyboard';
import type { AutoVideoFormat, AutoVideoSidecar, AutoVideoSource } from './types';

const textSource: AutoVideoSource = {
	id: 'source-1',
	kind: 'text',
	label: 'Notes',
	value: 'Fast to set up. Battery lasts two days! Costs less than rivals.'
};

function sidecar(overrides: Partial<AutoVideoSidecar> = {}): AutoVideoSidecar {
	const storyboard = buildStarterStoryboard({
		format: 'review',
		language: 'en-US',
		targetDurationSeconds: 30,
		source: textSource
	});
	return {
		version: 1,
		projectId: 'project-1',
		generationVersion: 1,
		createdAt: 1,
		updatedAt: 1,
		source: textSource,
		storyboard,
		providerManifest: {},
		...overrides
	};
}

describe('buildStarterStoryboard', () => {
	it.each(Object.keys(AUTO_VIDEO_FORMAT_SCENES) as AutoVideoFormat[])(
		'%s follows its scene template',
		(format) => {
			const storyboard = buildStarterStoryboard({
				format,
				language: 'en-US',
				targetDurationSeconds: 40,
				source: textSource
			});
			const template = AUTO_VIDEO_FORMAT_SCENES[format];
			expect(storyboard.scenes.map((scene) => scene.role)).toEqual(
				template.map((scene) => scene.role)
			);
			expect(new Set(storyboard.scenes.map((scene) => scene.id)).size).toBe(template.length);
			expect(storyboard.scenes.every((scene) => scene.sourceIds[0] === 'source-1')).toBe(true);
		}
	);

	it('keeps the length between 10 and 180 seconds and every scene at least 2 seconds', () => {
		const short = buildStarterStoryboard({
			format: 'top-n',
			language: 'en-US',
			targetDurationSeconds: 1,
			source: textSource
		});
		expect(short.targetDurationSeconds).toBe(10);
		expect(short.scenes.every((scene) => scene.durationSeconds >= 2)).toBe(true);
		const long = buildStarterStoryboard({
			format: 'review',
			language: 'en-US',
			targetDurationSeconds: 999,
			source: textSource
		});
		expect(long.targetDurationSeconds).toBe(180);
	});

	it('opens on the first source sentence and titles a URL by its host', () => {
		const storyboard = buildStarterStoryboard({
			format: 'news',
			language: 'en-US',
			targetDurationSeconds: 30,
			source: { id: 'u', kind: 'url', label: 'Web', value: '', url: 'https://www.example.com/a' }
		});
		expect(storyboard.title).toBe('example.com');
		expect(storyboard.scenes[0]!.voice).toBe('Add your key point here.');
		expect(sidecar().storyboard.scenes[0]!.voice).toBe('Fast to set up.');
	});
});

describe('compileStoryboardToProject', () => {
	it('lays scenes end to end with a background, text, marker and crossfade each', () => {
		const { storyboard } = sidecar();
		const project = compileStoryboardToProject(storyboard, 'vertical');
		const timeline = project.timeline!;
		const fps = 30;
		const frames = storyboard.scenes.map((scene) =>
			Math.max(fps * 2, Math.round(scene.durationSeconds * fps))
		);
		expect(timeline.outPoint).toBe(frames.reduce((sum, value) => sum + value, 0));
		expect(project.duration).toBeCloseTo(timeline.outPoint! / fps, 5);
		expect(timeline.items).toHaveLength(storyboard.scenes.length * 2);
		expect(timeline.markers).toHaveLength(storyboard.scenes.length);
		expect(timeline.transitions).toHaveLength(storyboard.scenes.length - 1);
		let cursor = 0;
		storyboard.scenes.forEach((scene, index) => {
			const background = timeline.items.find((item) => item.id === `${scene.id}-background`)!;
			const text = timeline.items.find((item) => item.id === `${scene.id}-text`)!;
			expect(background).toMatchObject({ from: cursor, durationInFrames: frames[index] });
			expect(text).toMatchObject({ from: cursor, text: `${scene.title}\n${scene.voice}` });
			cursor += frames[index]!;
		});
		expect(timeline.tracks.map((track) => track.id)).toContain('track-auno-music');
	});

	it('uses the canvas the person picked', () => {
		const { storyboard } = sidecar();
		expect(compileStoryboardToProject(storyboard, 'landscape')).toMatchObject({
			metadata: { width: 1920, height: 1080 }
		});
		expect(compileStoryboardToProject(storyboard, 'square')).toMatchObject({
			metadata: { width: 1080, height: 1080 }
		});
	});
});

describe('ownership', () => {
	const legacy = sidecar({
		generationGraph: {
			version: 1,
			blocks: [
				{
					sceneId: 's1',
					ownedItemIds: ['s1-text', 's1-motion-composition'],
					userModifiedItemIds: []
				}
			],
			media: {
				voices: [
					{
						sceneId: 's1',
						itemId: 'voice-1',
						mediaId: 'm',
						durationSeconds: 2,
						engine: 'kokoro',
						voice: 'af'
					}
				],
				captions: { itemId: 'captions' },
				music: { itemId: 'music' }
			}
		} as unknown as AutoVideoSidecar['generationGraph']
	});

	it('reads ownership from sidecars written before ownedItems existed', () => {
		expect(normalizedAutoVideoOwnership(legacy)).toEqual([
			{ itemId: 's1-text', sceneId: 's1', category: 'visual' },
			{ itemId: 's1-motion-composition', sceneId: 's1', category: 'motion' },
			{ itemId: 'voice-1', sceneId: 's1', category: 'voice' },
			{ itemId: 'captions', category: 'caption' },
			{ itemId: 'music', category: 'music' }
		]);
	});

	it('replaces one category, or one scene of it, and leaves the rest', () => {
		const replaced = replaceOwnershipCategory(legacy, 'voice', [
			{ itemId: 'voice-2', sceneId: 's1', category: 'voice' },
			{ itemId: 'stray', category: 'music' }
		]);
		expect(replaced.filter((item) => item.category === 'voice')).toEqual([
			{ itemId: 'voice-2', sceneId: 's1', category: 'voice' }
		]);
		expect(replaced.filter((item) => item.category === 'music')).toEqual([
			{ itemId: 'music', category: 'music' }
		]);
		const withScenes = sidecar({
			generationGraph: { version: 1, blocks: [], ownedItems: replaced }
		});
		const scene = replaceSceneOwnershipCategory(withScenes, 'voice', 's2', [
			{ itemId: 'voice-s2', sceneId: 's2', category: 'voice' }
		]);
		expect(
			ownedItemIdsForCategory(
				sidecar({ generationGraph: { version: 1, blocks: [], ownedItems: scene } }),
				'voice'
			)
		).toEqual(['voice-2', 'voice-s2']);
		expect(
			ownedItemIdsForCategory(
				sidecar({ generationGraph: { version: 1, blocks: [], ownedItems: scene } }),
				'voice',
				's2'
			)
		).toEqual(['voice-s2']);
	});
});

describe('sidecar storage', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	function memoryStorage(overrides: Partial<Storage> = {}): Storage {
		const values = new Map<string, string>();
		return {
			get length() {
				return values.size;
			},
			clear: () => values.clear(),
			key: (index) => [...values.keys()][index] ?? null,
			getItem: (key) => values.get(key) ?? null,
			setItem: (key, value) => void values.set(key, value),
			removeItem: (key) => void values.delete(key),
			...overrides
		};
	}

	it('keeps a local copy and reads back only the matching project', () => {
		vi.stubGlobal('localStorage', memoryStorage());
		expect(saveAutoVideoSidecar(sidecar())).toBe(true);
		expect(loadAutoVideoSidecar('project-1')?.projectId).toBe('project-1');
		expect(loadAutoVideoSidecar('other')).toBeNull();
	});

	it('survives a browser that refuses storage', () => {
		vi.stubGlobal(
			'localStorage',
			memoryStorage({
				setItem: () => {
					throw new DOMException('full', 'QuotaExceededError');
				},
				getItem: () => {
					throw new DOMException('denied', 'SecurityError');
				}
			})
		);
		expect(saveAutoVideoSidecar(sidecar())).toBe(false);
		expect(loadAutoVideoSidecar('project-1')).toBeNull();
	});

	it('reports where a save landed', async () => {
		vi.stubGlobal('localStorage', memoryStorage());
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		expect(await saveAutoVideoSidecarRemote('', sidecar())).toBe('local');
		fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
		expect(await saveAutoVideoSidecarRemote('ws', sidecar())).toBe('saved');
		fetchMock.mockResolvedValueOnce(new Response('{}', { status: 409 }));
		expect(await saveAutoVideoSidecarRemote('ws', sidecar())).toBe('conflict');
		fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }));
		expect(await saveAutoVideoSidecarRemote('ws', sidecar())).toBe('local');
		fetchMock.mockRejectedValueOnce(new TypeError('offline'));
		expect(await saveAutoVideoSidecarRemote('ws', sidecar())).toBe('local');
	});

	it("never serves a cached copy of another workspace's project", async () => {
		vi.stubGlobal('localStorage', memoryStorage());
		saveAutoVideoSidecar(sidecar());
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		fetchMock.mockResolvedValueOnce(new Response('{}', { status: 403 }));
		expect(await loadAutoVideoSidecarRemote('ws', 'project-1')).toBeNull();
		// Not on the server yet (a save that stayed local): the local copy still counts.
		fetchMock.mockResolvedValueOnce(new Response('{}', { status: 404 }));
		expect((await loadAutoVideoSidecarRemote('ws', 'project-1'))?.projectId).toBe('project-1');
	});

	it('reads server records and refuses malformed ones', () => {
		const local = sidecar();
		const remote: RemoteSidecar = {
			project_id: 'project-1',
			workspace_id: 'ws',
			generation_version: 4,
			source_manifest: { source: textSource },
			storyboard: local.storyboard,
			provider_manifest: { planner: 'fixture' },
			created_at: '2026-11-01T00:00:00Z',
			updated_at: 'not a date'
		};
		expect(fromRemote(remote)).toMatchObject({
			projectId: 'project-1',
			generationVersion: 4,
			createdAt: Date.parse('2026-11-01T00:00:00Z'),
			providerManifest: { planner: 'fixture' }
		});
		expect(fromRemote({ ...remote, source_manifest: {} })).toBeNull();
		expect(
			fromRemote({ ...remote, storyboard: { ...local.storyboard, version: 2 as 1 } })
		).toBeNull();
	});

	it('recognises a documentary sidecar only when its manifest is complete', () => {
		expect(documentaryManifest(sidecar())).toBeNull();
		const documentary = {
			runId: 'run',
			beatIds: ['b1'],
			style: 'vox'
		} as unknown as NonNullable<NonNullable<AutoVideoSidecar['generationGraph']>['documentary']>;
		expect(
			documentaryManifest(sidecar({ generationGraph: { version: 1, blocks: [], documentary } }))
		).toEqual(documentary);
		expect(
			documentaryManifest(
				sidecar({
					generationGraph: { version: 1, blocks: [], documentary: { ...documentary, runId: '' } }
				})
			)
		).toBeNull();
	});
});
