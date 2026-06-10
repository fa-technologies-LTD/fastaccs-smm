<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Activity, RefreshCcw } from '$lib/icons';
	import { showError, showSuccess } from '$lib/stores/toasts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let runningJob = $state<string | null>(null);

	function formatDate(value: string | null): string {
		if (!value) return 'Not observed';
		return new Date(value).toLocaleString('en-NG', {
			year: 'numeric',
			month: 'short',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function statusStyle(status: string): string {
		if (status === 'healthy') return 'color: var(--status-success);';
		if (status === 'running') return 'color: var(--status-warning);';
		if (status === 'unhealthy') return 'color: var(--status-error);';
		if (status === 'disabled') return 'color: var(--text-dim);';
		return 'color: var(--text-muted);';
	}

	async function runJob(jobName: string): Promise<void> {
		if (runningJob) return;
		runningJob = jobName;
		try {
			const response = await fetch(`/api/admin/automation/${encodeURIComponent(jobName)}/run`, {
				method: 'POST'
			});
			const result = await response.json();
			if (!response.ok || !result.success) {
				showError('Automation run failed', result.error || 'The job could not be started.');
				return;
			}
			if (result.data?.status === 'skipped_overlap') {
				showError('Job already running', 'This job already has an active execution.');
			} else {
				showSuccess('Automation run complete', `${jobName} completed safely.`);
			}
			await invalidateAll();
		} catch (error) {
			console.error('Manual automation run failed:', error);
			showError('Automation run failed', 'The job could not be completed.');
		} finally {
			runningJob = null;
		}
	}
</script>

<svelte:head>
	<title>Automation Health - FastAccs Admin</title>
</svelte:head>

<div class="space-y-5">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="flex items-center gap-2 text-2xl font-bold" style="color: var(--text);">
				<Activity class="h-6 w-6" />
				Automation Health
			</h1>
			<p class="mt-1 text-sm" style="color: var(--text-muted);">
				Last runs, failures, and safe recovery controls for scheduled work.
			</p>
		</div>
		<button
			type="button"
			onclick={() => invalidateAll()}
			class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
			style="border: 1px solid var(--border); color: var(--text);"
		>
			<RefreshCcw class="h-4 w-4" />
			Refresh
		</button>
	</div>

	<div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
		{#each data.jobs as job (job.name)}
			<section
				class="rounded-xl p-4"
				style="background: var(--bg-elev-1); border: 1px solid var(--border);"
			>
				<div class="flex items-start justify-between gap-3">
					<div>
						<h2 class="text-sm font-bold" style="color: var(--text);">{job.name}</h2>
						<p class="mt-1 text-xs" style="color: var(--text-muted);">
							{job.schedule} · {job.risk}
						</p>
					</div>
					<span class="text-xs font-bold uppercase" style={statusStyle(job.status)}
						>{job.status}</span
					>
				</div>

				<div class="mt-4 grid grid-cols-2 gap-3 text-xs">
					<div>
						<p style="color: var(--text-dim);">Last run</p>
						<p class="mt-1" style="color: var(--text);">{formatDate(job.lastRunAt)}</p>
					</div>
					<div>
						<p style="color: var(--text-dim);">Last success</p>
						<p class="mt-1" style="color: var(--text);">{formatDate(job.lastSuccessAt)}</p>
					</div>
					<div>
						<p style="color: var(--text-dim);">Latest processed</p>
						<p class="mt-1 font-semibold" style="color: var(--text);">{job.latestProcessedCount}</p>
					</div>
					<div>
						<p style="color: var(--text-dim);">Latest failures</p>
						<p class="mt-1 font-semibold" style="color: var(--text);">{job.latestFailureCount}</p>
					</div>
				</div>

				{#if job.latestError}
					<p
						class="mt-3 rounded-lg p-2 text-xs"
						style="background: var(--status-error-bg); color: var(--status-error); border: 1px solid var(--status-error-border);"
					>
						{job.latestError}
					</p>
				{/if}

				{#if data.canRunJobs && job.manualRunAllowed}
					<button
						type="button"
						disabled={Boolean(runningJob)}
						onclick={() => runJob(job.name)}
						class="mt-4 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
						style="background: var(--btn-primary-gradient); color: #04140c;"
					>
						{runningJob === job.name ? 'Running...' : 'Run safely now'}
					</button>
				{/if}
			</section>
		{/each}
	</div>
</div>
