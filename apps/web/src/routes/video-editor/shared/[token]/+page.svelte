<!-- Read-only share view: anyone with the link watches the project; nothing is saved. -->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import { ProtectedIcon } from '$lib/themes/icons';
	import PreviewPlayer from '$lib/video-editor/components/preview-player.svelte';
	import { editorSession } from '$lib/video-editor/editor.svelte';
	import { sequenceStore } from '$lib/video-editor/sequences/sequence-store.svelte';
	import { timelineStore } from '$lib/video-editor/timeline/stores/timeline-store.svelte';
	import { setCurrentFrame } from '$lib/video-editor/timeline/actions/items';
	import { formatTimelinePreviewTimecode } from '$lib/video-editor/preview/timeline-preview-scrub';

	const token = $derived(page.params.token ?? '');
	let name = $state('');
	let missing = $state(false);
	let selectedItemId = $state<string | null>(null);
	let selectedItemIds = $state<string[]>([]);

	$effect(() => {
		const current = token;
		missing = false;
		void editorSession.loadShared(current).then((result) => {
			if (current !== token) return;
			name = result.name;
			missing = result.missing;
		});
	});

	onDestroy(() => editorSession.pausePlayback());

	const fps = $derived(timelineStore.fps);
	const totalFrames = $derived(Math.max(1, sequenceStore.activeDurationInFrames));
	const playing = $derived(editorSession.isPlaying);
	const ready = $derived(
		!editorSession.loading && !editorSession.loadError && editorSession.project
	);

	function togglePlayback(): void {
		if (playing) editorSession.pausePlayback();
		else editorSession.startPlayback({ start: 0, end: totalFrames, loop: false });
	}

	function onkeydown(event: KeyboardEvent): void {
		if (event.key !== ' ' || !ready) return;
		const target = event.target;
		if (target instanceof Element && target.closest('input, button, select, textarea')) return;
		event.preventDefault();
		togglePlayback();
	}
</script>

<svelte:head>
	<title>{name ? `${name} · dopost` : 'dopost'}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<svelte:window {onkeydown} />

<div
	class="video-editor-theme flex h-dvh flex-col bg-[var(--video-editor-canvas)] text-[var(--video-editor-text)]"
>
	<header
		class="flex min-h-12 shrink-0 items-center gap-3 border-b border-[var(--video-editor-border)] px-4"
	>
		<h1 class="min-w-0 flex-1 truncate text-sm font-semibold">
			{name || m.video_editor_share_view_title()}
		</h1>
		<span
			class="shrink-0 rounded-full border border-[var(--video-editor-border)] px-2 py-0.5 text-xs text-[var(--video-editor-muted)]"
		>
			{m.video_editor_share_view_only()}
		</span>
	</header>

	{#if editorSession.loading}
		<p class="m-auto text-sm text-[var(--video-editor-muted)]" role="status">
			{m.video_editor_share_view_loading()}
		</p>
	{:else if missing}
		<div class="m-auto max-w-sm px-4 text-center">
			<h2 class="text-base font-semibold">{m.video_editor_share_view_missing_title()}</h2>
			<p class="mt-2 text-sm text-[var(--video-editor-muted)]">
				{m.video_editor_share_view_missing_body()}
			</p>
		</div>
	{:else if editorSession.loadError}
		<p class="m-auto max-w-sm px-4 text-center text-sm" role="alert">
			{m.video_editor_share_view_error()}
		</p>
	{:else if ready}
		<main class="relative flex min-h-0 flex-1 flex-col">
			<div class="relative flex min-h-0 flex-1 flex-col">
				{#key sequenceStore.activeTimelineKey}
					<PreviewPlayer
						bind:selectedItemId
						bind:selectedItemIds
						showTransformControls={false}
						ondeselect={() => {
							selectedItemId = null;
							selectedItemIds = [];
						}}
						onedit={() => undefined}
					/>
				{/key}
			</div>
			<div
				class="flex shrink-0 items-center gap-3 border-t border-[var(--video-editor-border)] px-4 py-2"
			>
				<Button
					size="icon"
					variant="ghost"
					aria-label={playing ? m.video_editor_pause() : m.video_editor_play()}
					onclick={togglePlayback}
				>
					{#if playing}<ProtectedIcon icon="pause" />{:else}<ProtectedIcon icon="play" />{/if}
				</Button>
				<input
					type="range"
					class="min-w-0 flex-1 accent-[var(--video-editor-primary)]"
					min="0"
					max={totalFrames}
					step="1"
					value={timelineStore.currentFrame}
					aria-label={m.video_editor_share_view_position()}
					oninput={(event) => setCurrentFrame(Number(event.currentTarget.value))}
				/>
				<span class="shrink-0 font-mono text-xs text-[var(--video-editor-muted)] tabular-nums">
					{formatTimelinePreviewTimecode(timelineStore.currentFrame, fps)} / {formatTimelinePreviewTimecode(
						totalFrames,
						fps
					)}
				</span>
			</div>
		</main>
	{/if}
</div>
