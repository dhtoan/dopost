import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, getMigrationsToApply } from './migrations';
import { createBlankProject } from './defaults';

describe('project migration registry', () => {
	it('fails closed when a target version has no migration', () => {
		expect(() => getMigrationsToApply(CURRENT_SCHEMA_VERSION, CURRENT_SCHEMA_VERSION + 1)).toThrow(
			`Missing project migration for schema ${CURRENT_SCHEMA_VERSION + 1}`
		);
	});

	it('converts legacy ratio crop keys to source pixels without changing pixel graph edits', () => {
		const project = createBlankProject();
		project.schemaVersion = 5;
		project.timeline!.items = [
			{
				id: 'video',
				trackId: project.timeline!.tracks[0]!.id,
				from: 0,
				durationInFrames: 30,
				label: 'Video',
				type: 'video',
				sourceWidth: 1280,
				sourceHeight: 720,
				keyframes: {
					cropLeft: { frames: [0, 15, 29], values: [0, 0.25, 160] },
					cropSoftness: { frames: [0, 29], values: [-0.5, 12] }
				}
			}
		];

		const migration = getMigrationsToApply(5, 6)[0]!;
		const migrated = migration.migrate(project);

		expect(migrated.timeline!.items[0]?.keyframes?.cropLeft?.values).toEqual([0, 320, 160]);
		expect(migrated.timeline!.items[0]?.keyframes?.cropSoftness?.values).toEqual([-360, 12]);
	});

	it('centres Auto Video scene text that was generated measured from the corner', () => {
		const project = createBlankProject();
		project.schemaVersion = 11;
		const { width, height } = project.metadata;
		const track = project.timeline!.tracks[0]!.id;
		const scene = (id: string, x: number, y: number) => ({
			id,
			trackId: track,
			from: 0,
			durationInFrames: 30,
			label: id,
			type: 'text' as const,
			text: 'Scene',
			transform: { x, y, width: width * 0.82, height: height * 0.56, opacity: 1 }
		});
		project.timeline!.items = [
			scene('scene-1-text', width / 2, height / 2),
			// Moved by hand afterwards, so it keeps its place.
			scene('scene-2-text', 40, -120)
		];

		const migrated = getMigrationsToApply(11, 12)[0]!.migrate(project);

		expect(migrated.timeline!.items.map((item) => [item.transform?.x, item.transform?.y])).toEqual([
			[0, 0],
			[40, -120]
		]);
	});
});
