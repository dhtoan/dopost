import type { ColorStats } from './color-match';

/** The graded frame other clips match to, measured once when it is chosen. */
export interface ColorMatchReference {
	itemId: string;
	label: string;
	stats: ColorStats;
}

let reference = $state<ColorMatchReference | null>(null);

export const colorMatchReference = {
	get current(): ColorMatchReference | null {
		return reference;
	},
	set(next: ColorMatchReference): void {
		reference = next;
	},
	clear(): void {
		reference = null;
	}
};
