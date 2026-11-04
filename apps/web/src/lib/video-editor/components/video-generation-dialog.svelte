<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { m } from '$lib/paraglide/messages';
	import { ProtectedIcon, ThemeIcon } from '$lib/themes/icons';
	import { mediaPool } from '$lib/video-editor/media/pool.svelte';
	import {
		VIDEO_PROMPT_MAX,
		canStartFrom,
		clampSeconds,
		estimateMicrousd,
		formatUsd,
		isVideoAspectRatio,
		isVideoModelId,
		serverMediaId,
		type VideoGenerationConfig
	} from '$lib/video-editor/media/processing/video-generation/video-generation';
	import { videoGenerationService } from '$lib/video-editor/media/processing/video-generation/video-generation-service.svelte';

	let {
		open = $bindable(false),
		workspaceId,
		projectId,
		onstarted = () => undefined
	}: {
		open?: boolean;
		workspaceId: string;
		projectId: string;
		onstarted?: () => void;
	} = $props();

	let config = $state<VideoGenerationConfig | null>(null);
	let loadError = $state('');
	let prompt = $state('');
	let modelId = $state('');
	let seconds = $state(5);
	let aspect = $state('16:9');
	let audio = $state(false);
	let startMediaId = $state('');
	let working = $state(false);
	let error = $state('');

	const model = $derived(config?.models?.find((entry) => entry.id === modelId) ?? null);
	const startImages = $derived(mediaPool.mediaList.filter(canStartFrom));
	const estimate = $derived(
		model ? formatUsd(estimateMicrousd(model, clampSeconds(model, seconds), audio)) : ''
	);
	const recentRuns = $derived(
		videoGenerationService.runs.filter((run) => run.project_id === projectId).slice(0, 5)
	);

	$effect(() => {
		if (open) void videoGenerationService.refresh().catch(() => undefined);
	});

	$effect(() => {
		if (!open || config) return;
		void videoGenerationService.config().then(
			(loaded) => {
				config = loaded;
				const initial = loaded.models?.find((entry) => entry.id === loaded.default_model);
				modelId = initial?.id ?? loaded.models?.[0]?.id ?? '';
				if (initial) {
					seconds = initial.default_seconds;
					aspect = initial.aspect_ratios?.[0] ?? '16:9';
				}
			},
			(reason: unknown) => {
				loadError = reason instanceof Error ? reason.message : String(reason);
			}
		);
	});

	function chooseModel(id: string): void {
		modelId = id;
		const next = config?.models?.find((entry) => entry.id === id);
		if (!next) return;
		seconds = clampSeconds(next, seconds);
		if (!next.aspect_ratios?.includes(aspect)) aspect = next.aspect_ratios?.[0] ?? '16:9';
		if (!next.audio) audio = false;
	}

	function close(): void {
		if (working) return;
		open = false;
		error = '';
	}

	function stateLabel(state: string): string {
		switch (state) {
			case 'completed':
				return m.video_editor_generate_video_state_done();
			case 'failed':
			case 'unknown':
				return m.video_editor_generate_video_state_failed();
			default:
				return m.video_editor_generate_video_state_running();
		}
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (working || !model || !prompt.trim() || !workspaceId) return;
		const modelChoice = model.id;
		const aspectChoice = aspect;
		if (!isVideoModelId(modelChoice) || !isVideoAspectRatio(aspectChoice)) return;
		working = true;
		error = '';
		const start = startMediaId ? mediaPool.get(startMediaId) : undefined;
		try {
			await videoGenerationService.start({
				workspace_id: workspaceId,
				project_id: projectId,
				prompt: prompt.trim(),
				model: modelChoice,
				duration_seconds: clampSeconds(model, seconds),
				aspect_ratio: aspectChoice,
				generate_audio: model.audio ? audio : undefined,
				source_media_id: start ? (serverMediaId(start) ?? undefined) : undefined
			});
			prompt = '';
			open = false;
			onstarted();
		} catch (reason) {
			error = reason instanceof Error ? reason.message : String(reason);
		} finally {
			working = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="video-editor-theme w-[calc(100%_-_1rem)] max-w-[520px] border-border bg-popover text-popover-foreground sm:max-w-[520px]"
		showCloseButton={!working}
	>
		<form onsubmit={submit}>
			<Dialog.Header>
				<Dialog.Title class="flex items-center gap-2 text-base">
					<ThemeIcon role="sparkles" class="size-4 text-[var(--video-editor-focus)]" />
					{m.video_editor_generate_video()}
				</Dialog.Title>
				<Dialog.Description class="text-xs text-[var(--video-editor-muted)]">
					{m.video_editor_generate_video_description()}
				</Dialog.Description>
			</Dialog.Header>

			{#if loadError || (config && !config.available)}
				<p
					class="mt-4 rounded-md border border-border bg-muted px-3 py-2 text-xs text-[var(--video-editor-muted)]"
					role="status"
				>
					{loadError || m.video_editor_generate_video_unavailable()}
				</p>
			{:else if !config}
				<p class="mt-4 text-xs text-[var(--video-editor-muted)]">
					{m.video_editor_generate_video_loading()}
				</p>
			{:else}
				<div class="mt-4 space-y-3 text-xs">
					<label class="block space-y-1">
						<span class="font-medium">{m.video_editor_generate_video_prompt()}</span>
						<textarea
							class="min-h-24 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
							bind:value={prompt}
							maxlength={VIDEO_PROMPT_MAX}
							placeholder={m.video_editor_generate_video_prompt_placeholder()}
							disabled={working}></textarea>
					</label>
					<div class="grid grid-cols-2 gap-2">
						<label class="space-y-1">
							<span class="font-medium">{m.video_editor_generate_video_model()}</span>
							<select
								class="h-8 w-full rounded-md border border-border bg-background px-2"
								value={modelId}
								disabled={working}
								onchange={(event) => chooseModel(event.currentTarget.value)}
							>
								{#each config.models ?? [] as entry (entry.id)}
									<option value={entry.id}>{entry.name}</option>
								{/each}
							</select>
						</label>
						<label class="space-y-1">
							<span class="font-medium">
								{m.video_editor_generate_video_seconds({
									min: model?.min_seconds ?? 0,
									max: model?.max_seconds ?? 0
								})}
							</span>
							<input
								class="h-8 w-full rounded-md border border-border bg-background px-2"
								type="number"
								min={model?.min_seconds}
								max={model?.max_seconds}
								bind:value={seconds}
								disabled={working}
							/>
						</label>
						<label class="space-y-1">
							<span class="font-medium">{m.video_editor_generate_video_start_image()}</span>
							<select
								class="h-8 w-full rounded-md border border-border bg-background px-2"
								bind:value={startMediaId}
								disabled={working}
							>
								<option value="">{m.video_editor_generate_video_no_start_image()}</option>
								{#each startImages as image (image.id)}
									<option value={image.id}>{image.fileName}</option>
								{/each}
							</select>
						</label>
						<label class="space-y-1">
							<span class="font-medium">{m.video_editor_generate_video_shape()}</span>
							<select
								class="h-8 w-full rounded-md border border-border bg-background px-2"
								bind:value={aspect}
								disabled={working || Boolean(startMediaId)}
								title={startMediaId ? m.video_editor_generate_video_shape_from_image() : undefined}
							>
								{#each model?.aspect_ratios ?? [] as ratio (ratio)}
									<option value={ratio}>{ratio}</option>
								{/each}
							</select>
						</label>
					</div>
					{#if model?.audio}
						<label class="flex items-center gap-2">
							<input type="checkbox" bind:checked={audio} disabled={working} />
							{m.video_editor_generate_video_audio()}
						</label>
					{/if}
					<p class="text-[var(--video-editor-muted)]">
						{m.video_editor_generate_video_estimate({ cost: estimate })}
					</p>
					{#if error}
						<p
							class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive"
							role="alert"
						>
							{error}
						</p>
					{/if}
					{#if recentRuns.length > 0}
						<ul
							class="space-y-1 border-t border-border pt-2"
							aria-label={m.video_editor_generate_video_recent()}
						>
							{#each recentRuns as run (run.id)}
								<li class="flex items-center justify-between gap-2">
									<span class="min-w-0 truncate" title={run.prompt}>{run.prompt}</span>
									<span
										class="shrink-0 text-[var(--video-editor-muted)]"
										title={run.error_message || undefined}
									>
										{stateLabel(run.state)}
									</span>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}

			<Dialog.Footer class="mt-5">
				<Button type="button" variant="ghost" disabled={working} onclick={close}>
					{m.common_cancel()}
				</Button>
				<Button
					type="submit"
					disabled={working || !config?.available || !model || !prompt.trim() || !workspaceId}
				>
					{#if working}<ProtectedIcon
							icon="loading"
							class="size-3.5 animate-spin motion-reduce:animate-none"
						/>{/if}
					{m.video_editor_generate_video_action()}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
