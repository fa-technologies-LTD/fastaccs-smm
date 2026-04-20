<script lang="ts">
	import { onMount } from 'svelte';
	import { Mail, Send, Users, Eye, Loader2, RefreshCcw, CheckCircle2, AlertTriangle } from '@lucide/svelte';
	import { showError, showSuccess, showWarning } from '$lib/stores/toasts';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	type AudienceOption = {
		value:
			| 'all_verified'
			| 'purchased_30'
			| 'purchased_60'
			| 'purchased_90'
			| 'never_purchased'
			| 'specific_platform_buyers';
		label: string;
		description: string;
	};

	type BroadcastHistoryItem = PageData['history'][number];

	type BroadcastDetails = {
		broadcastId: string;
		subject: string;
		body: string;
		audience: string | null;
		audienceLabel: string;
		createdAt: string;
		total: number;
		sent: number;
		failed: number;
		pending: number;
		status: 'in_progress' | 'completed' | 'failed';
		recipients: Array<{
			id: string;
			email: string;
			name: string | null;
			status: string;
			sentAt: string | null;
			failedAt: string | null;
			errorMessage: string | null;
		}>;
		hasMoreRecipients: boolean;
	};

	let { data }: Props = $props();

	const audienceOptions: AudienceOption[] = [
		{
			value: 'all_verified',
			label: 'All verified users',
			description: 'Everyone with a verified email.'
		},
		{
			value: 'purchased_30',
			label: 'Purchased in last 30 days',
			description: 'Users with successful purchases in the last 30 days.'
		},
		{
			value: 'purchased_60',
			label: 'Purchased in last 60 days',
			description: 'Users with successful purchases in the last 60 days.'
		},
		{
			value: 'purchased_90',
			label: 'Purchased in last 90 days',
			description: 'Users with successful purchases in the last 90 days.'
		},
		{
			value: 'never_purchased',
			label: 'Never purchased',
			description: 'Verified users without successful purchases.'
		},
		{
			value: 'specific_platform_buyers',
			label: 'Specific platform buyers',
			description: 'Users who have bought from selected platforms.'
		}
	];

	let subject = $state('');
	let messageBody = $state('');
	let audience = $state<AudienceOption['value']>('all_verified');
	let selectedPlatformIds = $state<string[]>([]);
	let recipientCount = $state<number>(data.initialAudienceCount || 0);
	let countLoading = $state(false);
	let audienceCountSeq = 0;

	let previewOpen = $state(false);
	let sending = $state(false);
	let activeBroadcastId = $state<string | null>(null);
	let sendProgress = $state({ total: 0, sent: 0, failed: 0, pending: 0 });

	let historyLoading = $state(false);
	let history = $state<BroadcastHistoryItem[]>(data.history || []);

	let detailsLoading = $state(false);
	let selectedDetails = $state<BroadcastDetails | null>(null);

	function isPlatformSelected(platformId: string): boolean {
		return selectedPlatformIds.includes(platformId);
	}

	function togglePlatformSelection(platformId: string): void {
		if (selectedPlatformIds.includes(platformId)) {
			selectedPlatformIds = selectedPlatformIds.filter((id) => id !== platformId);
			return;
		}

		selectedPlatformIds = [...selectedPlatformIds, platformId];
	}

	function formatDate(value: string): string {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return date.toLocaleString('en-NG', {
			year: 'numeric',
			month: 'short',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getHistoryStatusLabel(item: BroadcastHistoryItem): string {
		if (item.status === 'in_progress') return 'In progress';
		if (item.status === 'failed') return 'Failed';
		if (item.failed > 0) return 'Completed (with failures)';
		return 'Completed';
	}

	function getHistoryStatusStyle(item: BroadcastHistoryItem): string {
		if (item.status === 'in_progress') {
			return 'background: rgba(180,144,74,0.18); color: #F5D287; border: 1px solid rgba(180,144,74,0.4);';
		}
		if (item.status === 'failed') {
			return 'background: rgba(181,37,53,0.18); color: #FF8F99; border: 1px solid rgba(181,37,53,0.45);';
		}
		if (item.failed > 0) {
			return 'background: rgba(180,144,74,0.18); color: #F5D287; border: 1px solid rgba(180,144,74,0.4);';
		}
		return 'background: rgba(37,181,112,0.2); color: #7FF7B8; border: 1px solid rgba(37,181,112,0.45);';
	}

	function renderPreviewParagraphs(text: string): string[] {
		return text
			.trim()
			.split(/\n{2,}/)
			.map((segment) => segment.trim())
			.filter(Boolean);
	}

	async function refreshAudienceCount(): Promise<void> {
		const sequenceId = ++audienceCountSeq;
		const currentAudience = audience;
		const currentPlatformIds = [...selectedPlatformIds];

		if (currentAudience === 'specific_platform_buyers' && currentPlatformIds.length === 0) {
			recipientCount = 0;
			countLoading = false;
			return;
		}

		countLoading = true;
		try {
			const query = new URLSearchParams({ audience: currentAudience });
			if (currentPlatformIds.length > 0) {
				query.set('platformIds', currentPlatformIds.join(','));
			}

			const response = await fetch(`/api/admin/broadcast/audience?${query.toString()}`);
			const result = await response.json();
			if (sequenceId !== audienceCountSeq) return;

			if (!response.ok || !result.success) {
				recipientCount = 0;
				return;
			}

			recipientCount = Number(result.data?.count || 0);
		} catch (error) {
			console.error('Failed to refresh audience count:', error);
			if (sequenceId === audienceCountSeq) {
				recipientCount = 0;
			}
		} finally {
			if (sequenceId === audienceCountSeq) {
				countLoading = false;
			}
		}
	}

	async function refreshHistory(): Promise<void> {
		historyLoading = true;
		try {
			const response = await fetch('/api/admin/broadcast/history?limit=30');
			const result = await response.json();
			if (!response.ok || !result.success) {
				showError('Broadcast history', result.error || 'Failed to refresh broadcast history.');
				return;
			}
			history = Array.isArray(result.data) ? result.data : [];
		} catch (error) {
			console.error('Failed to refresh history:', error);
			showError('Broadcast history', 'Failed to refresh broadcast history.');
		} finally {
			historyLoading = false;
		}
	}

	async function loadBroadcastDetails(broadcastId: string): Promise<void> {
		detailsLoading = true;
		try {
			const response = await fetch(`/api/admin/broadcast/${encodeURIComponent(broadcastId)}?limit=250`);
			const result = await response.json();
			if (!response.ok || !result.success) {
				showError('Broadcast details', result.error || 'Failed to load broadcast details.');
				return;
			}
			selectedDetails = result.data as BroadcastDetails;
		} catch (error) {
			console.error('Failed to load details:', error);
			showError('Broadcast details', 'Failed to load broadcast details.');
		} finally {
			detailsLoading = false;
		}
	}

	function sleep(ms: number): Promise<void> {
		return new Promise((resolve) => {
			setTimeout(resolve, ms);
		});
	}

	async function processBroadcastUntilDone(
		broadcastId: string,
		delayMs: number,
		reloadDetails = false
	): Promise<void> {
		let done = false;
		while (!done && sending) {
			const response = await fetch(`/api/admin/broadcast/${encodeURIComponent(broadcastId)}/process`, {
				method: 'POST'
			});
			const result = await response.json();
			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Failed while sending broadcast');
			}

			const progress = result.data?.progress;
			sendProgress = {
				total: Number(progress?.total || sendProgress.total),
				sent: Number(progress?.sent || 0),
				failed: Number(progress?.failed || 0),
				pending: Number(progress?.pending || 0)
			};

			done = Boolean(result.data?.done);
			if (reloadDetails && selectedDetails?.broadcastId === broadcastId) {
				await loadBroadcastDetails(broadcastId);
			}

			if (!done) {
				await sleep(Math.max(delayMs, 200));
			}
		}
	}

	async function sendBroadcast(): Promise<void> {
		if (sending) return;
		const trimmedSubject = subject.trim();
		const trimmedBody = messageBody.trim();

		if (!trimmedSubject) {
			showWarning('Subject required', 'Add a subject before sending.');
			return;
		}
		if (!trimmedBody) {
			showWarning('Message required', 'Add a message body before sending.');
			return;
		}
		if (audience === 'specific_platform_buyers' && selectedPlatformIds.length === 0) {
			showWarning('Select platforms', 'Choose at least one platform for this audience.');
			return;
		}
		if (recipientCount <= 0) {
			showWarning('No recipients', 'No users currently match this audience.');
			return;
		}

		const confirmed = window.confirm(
			`You're about to email ${recipientCount} users. This cannot be undone. Continue?`
		);
		if (!confirmed) return;

		sending = true;
		try {
			const response = await fetch('/api/admin/broadcast/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					subject: trimmedSubject,
					body: trimmedBody,
					audience,
					platformIds: selectedPlatformIds
				})
			});
			const result = await response.json();
			if (!response.ok || !result.success) {
				showError('Broadcast failed', result.error || 'Unable to queue this broadcast.');
				return;
			}

			const broadcastId = String(result.data?.broadcastId || '');
			if (!broadcastId) {
				throw new Error('Broadcast id was not returned by the server.');
			}

			activeBroadcastId = broadcastId;
			sendProgress = {
				total: Number(result.data?.total || recipientCount),
				sent: 0,
				failed: 0,
				pending: Number(result.data?.total || recipientCount)
			};

			const delayMs = Number(result.data?.batchConfig?.delayMs || 1000);
			await processBroadcastUntilDone(broadcastId, delayMs, true);

			showSuccess('Broadcast completed', 'Email broadcast processing has completed.');
			subject = '';
			messageBody = '';
			previewOpen = false;
			await refreshAudienceCount();
			await refreshHistory();
			if (selectedDetails?.broadcastId === broadcastId) {
				await loadBroadcastDetails(broadcastId);
			}
		} catch (error) {
			console.error('Broadcast send failed:', error);
			showError(
				'Broadcast failed',
				error instanceof Error ? error.message : 'Broadcast send failed unexpectedly.'
			);
		} finally {
			sending = false;
		}
	}

	async function resumeBroadcast(item: BroadcastHistoryItem): Promise<void> {
		if (sending || item.pending <= 0) return;
		sending = true;
		activeBroadcastId = item.broadcastId;
		sendProgress = {
			total: item.total,
			sent: item.sent,
			failed: item.failed,
			pending: item.pending
		};

		try {
			await processBroadcastUntilDone(item.broadcastId, 1000, true);
			showSuccess('Broadcast completed', 'Pending recipients have been processed.');
			await refreshHistory();
			if (selectedDetails?.broadcastId === item.broadcastId) {
				await loadBroadcastDetails(item.broadcastId);
			}
		} catch (error) {
			console.error('Failed to resume broadcast:', error);
			showError('Broadcast failed', 'Could not resume this broadcast right now.');
		} finally {
			sending = false;
		}
	}

	$effect(() => {
		void refreshAudienceCount();
	});

	onMount(() => {
		if (history.length > 0 && !selectedDetails) {
			void loadBroadcastDetails(history[0].broadcastId);
		}
	});
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-2xl font-bold" style="color: var(--text);">Email Broadcast</h1>
			<p class="mt-1 text-sm" style="color: var(--text-muted);">
				Compose and send campaigns to verified user audiences.
			</p>
		</div>
		<button
			type="button"
			onclick={refreshHistory}
			disabled={historyLoading || sending}
			class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60"
			style="border: 1px solid var(--border); color: var(--text);"
		>
			<RefreshCcw class={`h-4 w-4 ${historyLoading ? 'animate-spin' : ''}`} />
			Refresh
		</button>
	</div>

	<div
		class="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr,0.8fr]"
	>
		<section
			class="space-y-5 rounded-2xl p-5"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<div>
				<label for="broadcast-subject" class="mb-2 block text-sm font-semibold" style="color: var(--text);"
					>Subject</label
				>
				<input
					id="broadcast-subject"
					type="text"
					bind:value={subject}
					placeholder="Email subject line"
					class="w-full rounded-lg px-3 py-2.5"
					style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
				/>
			</div>

			<div>
				<label for="broadcast-body" class="mb-2 block text-sm font-semibold" style="color: var(--text);"
					>Message Body</label
				>
				<textarea
					id="broadcast-body"
					bind:value={messageBody}
					rows={8}
					placeholder="Write your message..."
					class="w-full rounded-lg px-3 py-2.5"
					style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
				></textarea>
				<p class="mt-1 text-xs" style="color: var(--text-dim);">
					Basic markdown supported (`**bold**`, `[link](https://...)`, and line breaks).
				</p>
			</div>

			<div>
				<h2 class="mb-2 text-sm font-semibold" style="color: var(--text);">Audience</h2>
				<div class="space-y-2">
					{#each audienceOptions as option}
						<label
							class="flex cursor-pointer items-start gap-3 rounded-lg p-3"
							style={`border: 1px solid var(--border); background: ${audience === option.value ? 'var(--bg)' : 'transparent'};`}
						>
							<input
								type="radio"
								name="broadcast-audience"
								checked={audience === option.value}
								onchange={() => {
									audience = option.value;
									if (option.value !== 'specific_platform_buyers') {
										selectedPlatformIds = [];
									}
								}}
							/>
							<span>
								<span class="block text-sm font-medium" style="color: var(--text);">{option.label}</span>
								<span class="block text-xs" style="color: var(--text-muted);">{option.description}</span>
							</span>
						</label>
					{/each}
				</div>
			</div>

			{#if audience === 'specific_platform_buyers'}
				<div>
					<h3 class="mb-2 text-sm font-semibold" style="color: var(--text);">Select platforms</h3>
					<div class="max-h-44 space-y-2 overflow-auto rounded-lg p-3" style="background: var(--bg); border: 1px solid var(--border);">
						{#if data.platforms.length === 0}
							<p class="text-sm" style="color: var(--text-muted);">No active platforms found.</p>
						{:else}
							{#each data.platforms as platform}
								<label class="flex cursor-pointer items-center gap-2 text-sm" style="color: var(--text);">
									<input
										type="checkbox"
										checked={isPlatformSelected(platform.id)}
										onchange={() => togglePlatformSelection(platform.id)}
									/>
									<span>{platform.name}</span>
								</label>
							{/each}
						{/if}
					</div>
				</div>
			{/if}

			<div class="rounded-lg px-4 py-3" style="background: var(--bg); border: 1px solid var(--border);">
				<div class="flex items-center justify-between gap-3">
					<div class="inline-flex items-center gap-2 text-sm" style="color: var(--text-muted);">
						<Users class="h-4 w-4" />
						<span>This will be sent to</span>
					</div>
					<div class="text-lg font-bold" style="color: var(--text);">
						{#if countLoading}
							<Loader2 class="h-4 w-4 animate-spin" />
						{:else}
							{recipientCount}
						{/if}
					</div>
				</div>
			</div>

			<div class="flex flex-wrap gap-3">
				<button
					type="button"
					onclick={() => (previewOpen = !previewOpen)}
					class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all"
					style="border: 1px solid var(--border); color: var(--text);"
				>
					<Eye class="h-4 w-4" />
					{previewOpen ? 'Hide preview' : 'Preview'}
				</button>

				<button
					type="button"
					onclick={sendBroadcast}
					disabled={sending || countLoading}
					class="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60"
					style="background: var(--btn-primary-gradient); color: #04140C;"
				>
					{#if sending}
						<Loader2 class="h-4 w-4 animate-spin" />
						Sending...
					{:else}
						<Send class="h-4 w-4" />
						Send to {recipientCount} users
					{/if}
				</button>
			</div>

			{#if sending && sendProgress.total > 0}
				<div class="space-y-2 rounded-lg p-3" style="background: var(--bg); border: 1px solid var(--border);">
					<div class="flex items-center justify-between text-sm" style="color: var(--text-muted);">
						<span>Sending progress</span>
						<span>{sendProgress.sent + sendProgress.failed}/{sendProgress.total}</span>
					</div>
					<div class="h-2 w-full overflow-hidden rounded-full" style="background: var(--bg-elev-2);">
						<div
							class="h-full"
							style={`width: ${Math.min(((sendProgress.sent + sendProgress.failed) / sendProgress.total) * 100, 100)}%; background: var(--btn-primary-gradient);`}
						></div>
					</div>
					<div class="flex items-center gap-4 text-xs" style="color: var(--text-dim);">
						<span>Sent: {sendProgress.sent}</span>
						<span>Failed: {sendProgress.failed}</span>
						<span>Pending: {sendProgress.pending}</span>
					</div>
				</div>
			{/if}
		</section>

		<section class="space-y-5">
			{#if previewOpen}
				<div class="rounded-2xl p-5" style="background: var(--bg-elev-1); border: 1px solid var(--border);">
					<div class="mb-3 inline-flex items-center gap-2 text-sm font-semibold" style="color: var(--text);">
						<Mail class="h-4 w-4" />
						Template Preview
					</div>
					<div class="rounded-xl p-4" style="background: #141414; border: 1px solid #232323;">
						<p class="text-sm font-bold" style="color: #ffffff;">FAST ACCOUNTS</p>
						<div class="my-3 h-px" style="background: #232323;"></div>
						<h3 class="text-sm font-semibold" style="color: #ffffff;">{subject || '(No subject yet)'}</h3>
						<div class="mt-2 space-y-3 text-sm" style="color: #cccccc;">
							{#if messageBody.trim()}
								{#each renderPreviewParagraphs(messageBody) as paragraph}
									<p>{paragraph}</p>
								{/each}
							{:else}
								<p>(Message preview appears here)</p>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<div class="rounded-2xl p-5" style="background: var(--bg-elev-1); border: 1px solid var(--border);">
				<div class="mb-3 flex items-center justify-between gap-3">
					<h2 class="text-base font-semibold" style="color: var(--text);">Broadcast History</h2>
					{#if historyLoading}
						<Loader2 class="h-4 w-4 animate-spin" style="color: var(--text-muted);" />
					{/if}
				</div>

				<div class="space-y-3">
					{#if history.length === 0}
						<p class="text-sm" style="color: var(--text-muted);">No broadcast history yet.</p>
					{:else}
						{#each history as item}
							<div class="rounded-lg p-3" style="border: 1px solid var(--border); background: var(--bg);">
								<div class="flex items-start justify-between gap-3">
									<div>
										<p class="text-sm font-semibold" style="color: var(--text);">{item.subject}</p>
										<p class="mt-0.5 text-xs" style="color: var(--text-muted);">{item.audienceLabel}</p>
										<p class="mt-1 text-xs" style="color: var(--text-dim);">{formatDate(item.createdAt)}</p>
									</div>
									<span class="rounded-full px-2 py-1 text-[11px] font-semibold" style={getHistoryStatusStyle(item)}>
										{getHistoryStatusLabel(item)}
									</span>
								</div>
								<div class="mt-2 text-xs" style="color: var(--text-muted);">
									Sent: {item.sent}/{item.total} · Failed: {item.failed} · Pending: {item.pending}
								</div>
								<div class="mt-3 flex flex-wrap gap-2">
									<button
										type="button"
										onclick={() => loadBroadcastDetails(item.broadcastId)}
										class="rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
										style="border: 1px solid var(--border); color: var(--text);"
									>
										View details
									</button>
									{#if item.pending > 0}
										<button
											type="button"
											onclick={() => resumeBroadcast(item)}
											disabled={sending}
											class="rounded-full px-3 py-1.5 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60"
											style="background: var(--btn-primary-gradient); color: #04140C;"
										>
											Resume
										</button>
									{/if}
								</div>
							</div>
						{/each}
					{/if}
				</div>
			</div>
		</section>
	</div>

	<section class="rounded-2xl p-5" style="background: var(--bg-elev-1); border: 1px solid var(--border);">
		<div class="mb-3 flex items-center gap-2" style="color: var(--text);">
			<CheckCircle2 class="h-4 w-4" />
			<h2 class="text-base font-semibold">Broadcast Details</h2>
		</div>

		{#if detailsLoading}
			<div class="flex items-center gap-2 text-sm" style="color: var(--text-muted);">
				<Loader2 class="h-4 w-4 animate-spin" />
				Loading details...
			</div>
		{:else if selectedDetails}
			<div class="space-y-4">
				<div class="rounded-lg p-3" style="background: var(--bg); border: 1px solid var(--border);">
					<p class="text-sm font-semibold" style="color: var(--text);">{selectedDetails.subject}</p>
					<p class="mt-1 text-xs" style="color: var(--text-muted);">{selectedDetails.audienceLabel}</p>
					<p class="mt-1 text-xs" style="color: var(--text-dim);">{formatDate(selectedDetails.createdAt)}</p>
				</div>

				<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
					<div class="rounded-lg p-3" style="background: var(--bg); border: 1px solid var(--border);">
						<p class="text-xs" style="color: var(--text-muted);">Total</p>
						<p class="text-lg font-bold" style="color: var(--text);">{selectedDetails.total}</p>
					</div>
					<div class="rounded-lg p-3" style="background: var(--bg); border: 1px solid var(--border);">
						<p class="text-xs" style="color: var(--text-muted);">Sent</p>
						<p class="text-lg font-bold" style="color: var(--status-success);">{selectedDetails.sent}</p>
					</div>
					<div class="rounded-lg p-3" style="background: var(--bg); border: 1px solid var(--border);">
						<p class="text-xs" style="color: var(--text-muted);">Failed</p>
						<p class="text-lg font-bold" style="color: var(--status-error);">{selectedDetails.failed}</p>
					</div>
					<div class="rounded-lg p-3" style="background: var(--bg); border: 1px solid var(--border);">
						<p class="text-xs" style="color: var(--text-muted);">Pending</p>
						<p class="text-lg font-bold" style="color: var(--status-warning);">{selectedDetails.pending}</p>
					</div>
				</div>

				<div class="rounded-lg p-3" style="background: var(--bg); border: 1px solid var(--border);">
					<p class="mb-2 text-sm font-semibold" style="color: var(--text);">Message</p>
					<p class="text-sm whitespace-pre-wrap" style="color: var(--text-muted);">{selectedDetails.body}</p>
				</div>

				<div class="rounded-lg p-3" style="background: var(--bg); border: 1px solid var(--border);">
					<p class="mb-2 text-sm font-semibold" style="color: var(--text);">Recipients</p>
					<div class="max-h-64 space-y-2 overflow-auto pr-1">
						{#if selectedDetails.recipients.length === 0}
							<p class="text-sm" style="color: var(--text-muted);">No recipients loaded.</p>
						{:else}
							{#each selectedDetails.recipients as recipient}
								<div class="rounded-lg px-3 py-2 text-xs" style="background: var(--bg-elev-2); border: 1px solid var(--border);">
									<div class="flex items-center justify-between gap-2">
										<span style="color: var(--text);">{recipient.email}</span>
										<span style={`color: ${recipient.status === 'sent' ? 'var(--status-success)' : recipient.status === 'failed' ? 'var(--status-error)' : 'var(--status-warning)'};`}>
											{recipient.status}
										</span>
									</div>
									{#if recipient.name}
										<p class="mt-1" style="color: var(--text-dim);">{recipient.name}</p>
									{/if}
									{#if recipient.errorMessage}
										<p class="mt-1 flex items-center gap-1" style="color: var(--status-error);">
											<AlertTriangle class="h-3 w-3" />
											{recipient.errorMessage}
										</p>
									{/if}
								</div>
							{/each}
						{/if}
					</div>
					{#if selectedDetails.hasMoreRecipients}
						<p class="mt-2 text-xs" style="color: var(--text-dim);">
							Showing first {selectedDetails.recipients.length} recipients.
						</p>
					{/if}
				</div>
			</div>
		{:else}
			<p class="text-sm" style="color: var(--text-muted);">Select a broadcast from history to view details.</p>
		{/if}
	</section>
</div>
