<script lang="ts">
	import { Disclosure as EditorDisclosure } from '$lib/components/editor-density';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { m } from '$lib/paraglide/messages';
	import { timelineStore } from '$lib/video-editor/timeline/stores/timeline-store.svelte';
	import { setSplitEdit, splitEditOf } from '$lib/video-editor/timeline/actions/split-edit';

	let { itemId, onedit }: { itemId: string; onedit: () => void } = $props();

	const current = $derived.by(() => {
		void timelineStore.items;
		return splitEditOf(itemId);
	});
	let lead = $state(0);
	let tail = $state(0);
	let status = $state('');
	$effect(() => {
		lead = current.leadSeconds;
		tail = current.tailSeconds;
	});

	function seconds(value: unknown): number {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? Math.min(10, Math.max(0, parsed)) : 0;
	}

	function apply(next: { leadSeconds: number; tailSeconds: number }): void {
		const result = setSplitEdit(itemId, next);
		if (result.ok) {
			status =
				result.leadSeconds < next.leadSeconds || result.tailSeconds < next.tailSeconds
					? m.video_editor_split_edit_capped()
					: '';
			onedit();
		} else {
			status =
				result.reason === 'no-audio'
					? m.video_editor_split_edit_no_audio()
					: m.video_editor_split_edit_unavailable();
		}
	}
</script>

<section class="border-t border-[var(--video-editor-border)]" data-testid="split-edit-section">
	<EditorDisclosure
		label={m.video_editor_split_edit()}
		summary={current.leadSeconds || current.tailSeconds ? m.video_editor_modified() : undefined}
	>
		<div class="space-y-2 px-2.5 py-2">
			<p class="text-[10px] leading-4 text-[var(--video-editor-muted)]">
				{m.video_editor_split_edit_hint()}
			</p>
			<div class="grid grid-cols-2 gap-2">
				<label class="flex flex-col gap-1 text-[10px] text-[var(--video-editor-muted)]">
					{m.video_editor_split_edit_lead()}
					<Input
						type="number"
						min="0"
						max="10"
						step="0.1"
						inputmode="decimal"
						bind:value={lead}
						class="h-[var(--editor-22,22px)] text-right text-[11px] tabular-nums [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:text-base"
					/>
				</label>
				<label class="flex flex-col gap-1 text-[10px] text-[var(--video-editor-muted)]">
					{m.video_editor_split_edit_tail()}
					<Input
						type="number"
						min="0"
						max="10"
						step="0.1"
						inputmode="decimal"
						bind:value={tail}
						class="h-[var(--editor-22,22px)] text-right text-[11px] tabular-nums [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:text-base"
					/>
				</label>
			</div>
			<div class="flex gap-2">
				<Button
					size="sm"
					variant="secondary"
					class="flex-1 [@media(pointer:coarse)]:h-11"
					onclick={() => apply({ leadSeconds: seconds(lead), tailSeconds: seconds(tail) })}
				>
					{m.video_editor_split_edit_apply()}
				</Button>
				<Button
					size="sm"
					variant="ghost"
					class="[@media(pointer:coarse)]:h-11"
					disabled={!current.leadSeconds && !current.tailSeconds}
					onclick={() => apply({ leadSeconds: 0, tailSeconds: 0 })}
				>
					{m.video_editor_split_edit_clear()}
				</Button>
			</div>
			{#if status}
				<p class="text-[10px] text-[var(--video-editor-muted)]" role="status">{status}</p>
			{/if}
		</div>
	</EditorDisclosure>
</section>
