<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { guideGeometry, type GuideId, type GuideRegion } from '../preview/guides';

	let {
		guides,
		canvasWidth,
		canvasHeight
	}: { guides: readonly GuideId[]; canvasWidth: number; canvasHeight: number } = $props();

	const geometry = $derived(guideGeometry(guides, canvasWidth, canvasHeight));
	const percent = (value: number) => `${value * 100}%`;

	function regionLabel(region: GuideRegion): string {
		switch (region) {
			case 'topBar':
				return m.video_editor_guides_region_top_bar();
			case 'cropped':
				return m.video_editor_guides_region_cropped();
			case 'actions':
				return m.video_editor_guides_region_actions();
			case 'caption':
				return m.video_editor_guides_region_caption();
		}
	}
</script>

<!-- Drawn over the program monitor only; exports and captured frames read the canvases, not this layer.
     It sits before the on-canvas tools so their handles stay on top. -->
<div class="pointer-events-none absolute inset-0" aria-hidden="true" data-preview-guides>
	{#each geometry.boxes as box, index (index)}
		<div
			class="absolute border border-dashed border-amber-300/70 bg-amber-400/12"
			style:left={percent(box.x)}
			style:top={percent(box.y)}
			style:width={percent(box.w)}
			style:height={percent(box.h)}
		>
			{#if box.region !== 'cropped'}
				<span
					class="absolute top-1 left-1 max-w-[calc(100%-0.5rem)] truncate rounded-sm bg-black/60 px-1 text-[10px] leading-4 text-amber-100"
					>{regionLabel(box.region)}</span
				>
			{/if}
		</div>
	{/each}
	{#each geometry.v as x, index (`v${index}`)}
		<div
			class="absolute top-0 bottom-0 w-px bg-white/55 shadow-[0_0_0_0.5px_oklch(0_0_0_/_0.45)]"
			style:left={percent(x)}
		></div>
	{/each}
	{#each geometry.h as y, index (`h${index}`)}
		<div
			class="absolute right-0 left-0 h-px bg-white/55 shadow-[0_0_0_0.5px_oklch(0_0_0_/_0.45)]"
			style:top={percent(y)}
		></div>
	{/each}
</div>
