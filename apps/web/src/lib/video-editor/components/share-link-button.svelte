<!-- Share: turn a read-only link to this cloud project on or off and copy it. -->
<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import { ThemeIcon } from '$lib/themes/icons';
	import {
		disableVideoProjectShare,
		enableVideoProjectShare,
		getVideoProjectShare,
		shareLinkURL,
		type VideoProjectShare
	} from '$lib/video-editor/cloud/share-links';

	let { workspaceId, projectId }: { workspaceId: string; projectId: string } = $props();

	let open = $state(false);
	let share = $state<VideoProjectShare | null>(null);
	let busy = $state(false);
	let status = $state('');
	const link = $derived(share ? shareLinkURL(share.token) : '');

	async function run(action: () => Promise<void>, failure: string): Promise<void> {
		busy = true;
		status = '';
		try {
			await action();
		} catch {
			status = failure;
		} finally {
			busy = false;
		}
	}

	function refresh(): void {
		void run(async () => {
			share = await getVideoProjectShare(workspaceId, projectId);
		}, m.video_editor_share_load_failed());
	}

	function turnOn(): void {
		void run(async () => {
			share = await enableVideoProjectShare(workspaceId, projectId);
			await copy();
		}, m.video_editor_share_update_failed());
	}

	function turnOff(): void {
		void run(async () => {
			await disableVideoProjectShare(workspaceId, projectId);
			share = null;
			status = m.video_editor_share_turned_off();
		}, m.video_editor_share_update_failed());
	}

	async function copy(): Promise<void> {
		if (!link) return;
		try {
			await navigator.clipboard.writeText(link);
			status = m.video_editor_share_copied();
		} catch {
			status = m.video_editor_share_copy_manually();
		}
	}
</script>

<Popover.Root
	bind:open
	onOpenChange={(next) => {
		if (next) refresh();
	}}
>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="icon-sm"
				class="lg:w-auto lg:px-2 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
				aria-label={m.video_editor_share()}
				title={m.video_editor_share()}
			>
				<ThemeIcon role="link" class="size-3.5" />
				<span class="hidden lg:inline">{m.video_editor_share()}</span>
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content align="end" class="video-editor-theme w-80 space-y-3 p-3">
		<div>
			<h2 class="text-sm font-semibold">{m.video_editor_share_title()}</h2>
			<p class="mt-1 text-xs text-[var(--video-editor-muted)]">
				{share ? m.video_editor_share_on_hint() : m.video_editor_share_off_hint()}
			</p>
		</div>
		{#if share}
			<div class="flex gap-1">
				<input
					class="h-8 min-w-0 flex-1 rounded border border-[var(--video-editor-border)] bg-[var(--video-editor-panel)] px-2 text-xs"
					readonly
					value={link}
					aria-label={m.video_editor_share_link()}
					onfocus={(event) => event.currentTarget.select()}
				/>
				<Button size="sm" variant="outline" disabled={busy} onclick={() => void copy()}>
					<ThemeIcon role="copy" class="size-3.5" />{m.video_editor_share_copy()}
				</Button>
			</div>
			<Button size="sm" variant="ghost" class="w-full" disabled={busy} onclick={turnOff}>
				<ThemeIcon role="unlink" class="size-3.5" />{m.video_editor_share_turn_off()}
			</Button>
		{:else}
			<Button size="sm" class="w-full" disabled={busy} onclick={turnOn}>
				<ThemeIcon role="link" class="size-3.5" />{m.video_editor_share_turn_on()}
			</Button>
		{/if}
		{#if status}
			<p class="text-xs text-[var(--video-editor-muted)]" role="status">{status}</p>
		{/if}
	</Popover.Content>
</Popover.Root>
