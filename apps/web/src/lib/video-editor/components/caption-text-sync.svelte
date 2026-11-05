<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import type { TimelineItem } from '../project/types';
	import { captionTextOf, syncCaptionText } from '../transcript/lyric-sync-action';

	let { item, onedit }: { item: TimelineItem; onedit: () => void } = $props();

	let open = $state(false);
	let text = $state('');
	let status = $state('');

	function toggle(): void {
		open = !open;
		if (open) {
			text = captionTextOf(item.id);
			status = '';
		}
	}

	function apply(): void {
		const result = syncCaptionText(item.id, text);
		if (result.ok) {
			status = m.video_editor_caption_text_sync_done({ count: result.cues });
			onedit();
		} else {
			status = m.video_editor_caption_text_sync_failed();
		}
	}
</script>

<section class="space-y-2" aria-labelledby={`caption-text-sync-${item.id}`}>
	<div class="flex items-center gap-2">
		<h3
			id={`caption-text-sync-${item.id}`}
			class="flex-1 text-[10px] font-semibold tracking-wider text-[var(--video-editor-muted)] uppercase"
		>
			{m.video_editor_caption_text_sync()}
		</h3>
		<Button
			size="sm"
			variant="ghost"
			class="h-7 text-xs [@media(pointer:coarse)]:h-11"
			aria-expanded={open}
			onclick={toggle}
		>
			{open ? m.video_editor_caption_text_sync_close() : m.video_editor_caption_text_sync_open()}
		</Button>
	</div>
	{#if open}
		<p class="text-[11px] leading-4 text-[var(--video-editor-muted)]">
			{m.video_editor_caption_text_sync_hint()}
		</p>
		<Textarea
			bind:value={text}
			rows={6}
			aria-label={m.video_editor_caption_text_sync()}
			class="min-h-28 text-xs [@media(pointer:coarse)]:text-base"
		/>
		<Button
			size="sm"
			variant="secondary"
			class="w-full [@media(pointer:coarse)]:h-11"
			disabled={text.trim().length === 0}
			onclick={apply}
		>
			{m.video_editor_caption_text_sync_apply()}
		</Button>
		{#if status}
			<p class="text-[11px] text-[var(--video-editor-muted)]" role="status">{status}</p>
		{/if}
	{/if}
</section>
