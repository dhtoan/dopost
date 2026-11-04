import { describe, expect, it } from 'vitest';
import type { AutoVideoVisualIssue } from '$lib/dopost/auto-video/types';
import type { AutoVideoStoryboard } from '$lib/dopost/auto-video/types';
import type { TimelineItem } from '$lib/video-editor/project/types';
import { inspectDopostMotionVisualQA, mergeVisualDiagnostics } from './visual-qa';

describe('mergeVisualDiagnostics', () => {
	it('deduplicates the same measurable issue while preserving error severity', () => {
		const authored: AutoVideoVisualIssue[] = [
			{
				code: 'visual.text_clipped',
				severity: 'warning',
				sceneId: 'scene-1',
				itemId: 'scene-1-text',
				message: 'Static safe-area warning.'
			}
		];
		const runtime: AutoVideoVisualIssue[] = [
			{
				code: 'visual.text_clipped',
				severity: 'error',
				sceneId: 'scene-1',
				itemId: 'scene-1-text',
				message: 'Measured text bounds leave the stage safe area.'
			}
		];

		expect(mergeVisualDiagnostics(authored, runtime)).toEqual([
			{
				code: 'visual.text_clipped',
				severity: 'error',
				sceneId: 'scene-1',
				itemId: 'scene-1-text',
				message: 'Measured text bounds leave the stage safe area.'
			}
		]);
	});

	it('keeps unrelated diagnostics in stable input order', () => {
		const authored: AutoVideoVisualIssue[] = [
			{ code: 'visual.blank_scene', severity: 'error', sceneId: 'a', message: 'blank' }
		];
		const runtime: AutoVideoVisualIssue[] = [
			{
				code: 'visual.low_contrast',
				severity: 'warning',
				sceneId: 'b',
				itemId: 'label',
				message: 'contrast'
			}
		];

		expect(mergeVisualDiagnostics(authored, runtime)).toEqual([...authored, ...runtime]);
	});
});

describe('inspectDopostMotionVisualQA safe area', () => {
	const storyboard = {
		version: 1,
		id: 'board',
		format: 'review',
		title: 'Board',
		language: 'en-US',
		targetDurationSeconds: 10,
		scenes: [
			{
				id: 'scene-1',
				role: 'hook',
				title: 'Hook',
				voice: 'Hello',
				visualIntent: 'product',
				durationSeconds: 5,
				sourceIds: []
			}
		]
	} as AutoVideoStoryboard;
	const text = (x: number, y: number): TimelineItem => ({
		id: 'scene-1-text',
		trackId: 'track',
		from: 0,
		durationInFrames: 150,
		label: 'Hook',
		type: 'text',
		text: 'Hello',
		transform: { x, y, width: 885.6, height: 1075.2, opacity: 1 }
	});
	const clipped = (items: TimelineItem[]) =>
		inspectDopostMotionVisualQA({ storyboard, items, width: 1080, height: 1920 }).filter(
			(issue) => issue.code === 'visual.text_clipped'
		);

	it('passes text centred on the stage (offset 0, 0)', () => {
		expect(clipped([text(0, 0)])).toEqual([]);
	});

	it('flags text pushed half a stage off-centre', () => {
		expect(clipped([text(540, 960)])).toHaveLength(1);
	});
});
