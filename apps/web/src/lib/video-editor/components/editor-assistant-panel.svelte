<script lang="ts">
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';
	import HostedChatPanel from '$lib/editor-agent/hosted-chat-panel.svelte';
	import LocalAiPanel from './local-ai-panel.svelte';
	import DopostAutoVideoPanel from './dopost-auto-video-panel.svelte';
	import type { TextVoiceRequest } from '$lib/video-editor/local-ai/types';
	import type { ProjectAssetImporter } from '$lib/video-editor/media/types';
	import { workspaceCtx } from '$lib/stores/workspace.svelte';

	type AssistantMode = 'assistant' | 'generate' | 'dopost';

	let {
		projectId,
		sessionId,
		oninserted,
		textVoiceRequest = null,
		importProjectAsset,
		onautosave
	}: {
		projectId: string;
		sessionId: string | null;
		oninserted: (itemId: string) => void;
		textVoiceRequest?: TextVoiceRequest | null;
		importProjectAsset?: ProjectAssetImporter;
		onautosave: () => void;
	} = $props();

	let mode = $state<AssistantMode>(
		page.url.searchParams.get('dopost') === 'auto-video' ? 'dopost' : 'assistant'
	);
	let generatePanelMounted = $state(false);
	let handledTextVoiceRequestId = $state<string | null>(null);
	let assistantTab: HTMLButtonElement | undefined = $state(undefined);
	let generateTab: HTMLButtonElement | undefined = $state(undefined);
	let dopostTab: HTMLButtonElement | undefined = $state(undefined);
	const modes: readonly AssistantMode[] = ['assistant', 'generate', 'dopost'];

	$effect(() => {
		if (!textVoiceRequest || textVoiceRequest.id === handledTextVoiceRequestId) return;
		handledTextVoiceRequestId = textVoiceRequest.id;
		mode = 'generate';
	});

	$effect(() => {
		if (mode === 'generate') generatePanelMounted = true;
	});

	function handleSwitcherKeydown(event: KeyboardEvent): void {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		const current = modes.indexOf(mode);
		let next: AssistantMode;
		if (event.key === 'Home') next = modes[0];
		else if (event.key === 'End') next = modes[modes.length - 1];
		else if (event.key === 'ArrowLeft') next = modes[(current - 1 + modes.length) % modes.length];
		else next = modes[(current + 1) % modes.length];
		mode = next;
		queueMicrotask(() => tabFor(next)?.focus());
	}

	function tabFor(next: AssistantMode): HTMLButtonElement | undefined {
		if (next === 'assistant') return assistantTab;
		if (next === 'generate') return generateTab;
		return dopostTab;
	}
</script>

<div class="flex h-full min-h-0 flex-col" data-testid="editor-assistant-panel">
	<div class="shrink-0 border-b border-[var(--video-editor-border)] p-2">
		<div
			role="tablist"
			tabindex="-1"
			aria-label={m.video_editor_agent_mode_label()}
			class="grid grid-cols-3 gap-1 rounded-md bg-[var(--video-editor-control)] p-1"
			onkeydown={handleSwitcherKeydown}
		>
			<button
				bind:this={assistantTab}
				role="tab"
				id="assistant-tab"
				aria-selected={mode === 'assistant'}
				aria-controls="assistant-panel"
				tabindex={mode === 'assistant' ? 0 : -1}
				type="button"
				class="min-h-11 rounded px-2 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--video-editor-focus)] md:min-h-9 {mode ===
				'assistant'
					? 'bg-[var(--video-editor-selection)] text-[var(--video-editor-selection-text)]'
					: 'text-[var(--video-editor-muted)] hover:text-[var(--video-editor-text)]'}"
				onclick={() => (mode = 'assistant')}
			>
				{m.video_editor_agent_assistant()}
			</button>
			<button
				bind:this={generateTab}
				role="tab"
				id="generate-tab"
				aria-selected={mode === 'generate'}
				aria-controls="generate-panel"
				tabindex={mode === 'generate' ? 0 : -1}
				type="button"
				class="min-h-11 rounded px-2 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--video-editor-focus)] md:min-h-9 {mode ===
				'generate'
					? 'bg-[var(--video-editor-selection)] text-[var(--video-editor-selection-text)]'
					: 'text-[var(--video-editor-muted)] hover:text-[var(--video-editor-text)]'}"
				onclick={() => (mode = 'generate')}
			>
				{m.video_editor_agent_generate()}
			</button>
			<button
				bind:this={dopostTab}
				role="tab"
				id="dopost-tab"
				aria-selected={mode === 'dopost'}
				aria-controls="dopost-panel"
				tabindex={mode === 'dopost' ? 0 : -1}
				type="button"
				class="min-h-11 rounded px-2 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--video-editor-focus)] md:min-h-9 {mode ===
				'dopost'
					? 'bg-[var(--video-editor-selection)] text-[var(--video-editor-selection-text)]'
					: 'text-[var(--video-editor-muted)] hover:text-[var(--video-editor-text)]'}"
				onclick={() => (mode = 'dopost')}
			>
				dopost AI
			</button>
		</div>
		{#if mode === 'dopost'}
			<p class="mt-1.5 text-[11px] leading-relaxed text-[var(--video-editor-muted)]">
				Regenerate Auto Video scenes while preserving native timeline edits.
			</p>
		{/if}
	</div>
	<div class="min-h-0 flex-1 overflow-hidden">
		<div
			role="tabpanel"
			id="assistant-panel"
			aria-labelledby="assistant-tab"
			class="h-full min-h-0"
			hidden={mode !== 'assistant'}
			inert={mode !== 'assistant'}
		>
			<HostedChatPanel
				workspaceId={workspaceCtx.currentWorkspace?.id ?? ''}
				{projectId}
				{sessionId}
			/>
		</div>
		{#if generatePanelMounted}
			<div
				role="tabpanel"
				id="generate-panel"
				aria-labelledby="generate-tab"
				class="h-full min-h-0 overflow-y-auto"
				hidden={mode !== 'generate'}
				inert={mode !== 'generate'}
			>
				<LocalAiPanel {projectId} {oninserted} {textVoiceRequest} {importProjectAsset} />
			</div>
		{/if}
		{#if mode === 'dopost'}
			<div role="tabpanel" id="dopost-panel" aria-labelledby="dopost-tab" class="h-full min-h-0">
				<DopostAutoVideoPanel {projectId} {onautosave} />
			</div>
		{/if}
	</div>
</div>
