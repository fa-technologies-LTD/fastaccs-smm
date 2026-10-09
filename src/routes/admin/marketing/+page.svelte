<script lang="ts">
	import { onMount } from 'svelte';
	import { TrendingUp, Copy, Target } from '$lib/icons';
	import { formatPrice } from '$lib/helpers/utils';
	import { buildTrackedUrl } from '$lib/helpers/tracked-link';
	import { decide, type MarketingAction } from '$lib/services/marketing/rules';
	import { showError, showSuccess } from '$lib/stores/toasts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Typed-in spend lives in this browser until the spend ledger ships with automatic imports.
	const SPEND_STORAGE_KEY = 'fa_marketing_spend_v1';
	let spendByCampaign = $state<Record<string, number>>({});

	onMount(() => {
		try {
			const raw = window.localStorage.getItem(SPEND_STORAGE_KEY);
			const parsed = raw ? JSON.parse(raw) : {};
			if (parsed && typeof parsed === 'object') spendByCampaign = parsed;
		} catch {
			spendByCampaign = {};
		}
	});

	function campaignKey(row: { source: string; campaign: string }): string {
		return `${row.source}|${row.campaign}`;
	}

	function setSpend(key: string, value: string): void {
		const amount = Math.max(0, Number(value.replace(/[^0-9.]/g, '')) || 0);
		spendByCampaign = { ...spendByCampaign, [key]: amount };
		try {
			window.localStorage.setItem(SPEND_STORAGE_KEY, JSON.stringify(spendByCampaign));
		} catch {
			/* storage blocked: the figure still works for this visit */
		}
	}

	const ACTION_STYLE: Record<MarketingAction, string> = {
		kill: 'background: var(--status-error-bg); color: var(--status-error); border: 1px solid var(--status-error-border);',
		prune:
			'background: var(--status-pending-bg); color: var(--status-pending); border: 1px solid var(--status-pending-border);',
		scale:
			'background: var(--status-success-bg); color: var(--status-success); border: 1px solid var(--status-success-border);',
		hold: 'background: var(--status-info-bg); color: var(--status-info); border: 1px solid var(--status-info-border);'
	};

	const trackedPct = $derived(
		data.report.totals.signups > 0
			? Math.round((data.report.totals.attributedSignups / data.report.totals.signups) * 100)
			: 0
	);

	// Link builder
	const MEDIUMS = ['forum', 'telegram', 'whatsapp', 'push', 'pop', 'banner', 'blog', 'influencer'];
	let linkPath = $state('/platforms');
	let linkSource = $state('');
	let linkMedium = $state('forum');
	let linkCampaign = $state('');
	let linkContent = $state('');
	const trackedUrl = $derived(
		buildTrackedUrl({
			baseUrl: data.siteUrl,
			path: linkPath,
			source: linkSource,
			medium: linkMedium,
			campaign: linkCampaign,
			content: linkContent
		})
	);

	async function copyLink(): Promise<void> {
		if (!trackedUrl) return;
		try {
			await navigator.clipboard.writeText(trackedUrl);
			showSuccess('Link copied', 'Use it in exactly one placement so its results stay separate.');
		} catch {
			showError('Copy failed', 'Select the link and copy it manually.');
		}
	}

	const inputStyle =
		'background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 0.5rem;';
</script>

<svelte:head>
	<title>Marketing - FastAccs Admin</title>
</svelte:head>

<div class="space-y-5">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="flex items-center gap-2 text-2xl font-bold" style="color: var(--text);">
				<TrendingUp class="h-6 w-6" />
				Marketing
			</h1>
			<p class="mt-1 text-sm" style="color: var(--text-muted);">
				Which links and campaigns bring buyers. Credited to the first tracked link a customer used.
			</p>
		</div>
		<div class="flex gap-1 rounded-full p-1" style="border: 1px solid var(--border);">
			{#each data.windows as days (days)}
				<a
					href={`?days=${days}`}
					class="rounded-full px-3 py-1 text-xs font-semibold"
					style={days === data.report.windowDays
						? 'background: var(--btn-primary-gradient); color: #04140c;'
						: 'color: var(--text-muted);'}
				>
					{days} days
				</a>
			{/each}
		</div>
	</div>

	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		{#each [{ label: 'Signups', value: String(data.report.totals.signups) }, { label: 'From a tracked source', value: `${trackedPct}%` }, { label: 'Became buyers', value: String(data.report.totals.buyers) }, { label: 'Their revenue', value: formatPrice(data.report.totals.revenueNgn) }] as stat (stat.label)}
			<div
				class="rounded-xl p-4"
				style="background: var(--bg-elev-1); border: 1px solid var(--border);"
			>
				<p class="text-xs" style="color: var(--text-dim);">{stat.label}</p>
				<p class="mt-1 text-xl font-bold" style="color: var(--text);">{stat.value}</p>
			</div>
		{/each}
	</div>

	<section
		class="rounded-xl p-4"
		style="background: var(--bg-elev-1); border: 1px solid var(--border);"
	>
		<h2 class="text-sm font-bold" style="color: var(--text);">Campaigns</h2>
		<p class="mt-1 text-xs" style="color: var(--text-muted);">
			Type what you spent on a campaign to get its cost per buyer and a decision. Target {formatPrice(
				data.thresholds.targetCacNgn
			)} per buyer, ceiling {formatPrice(data.thresholds.ceilingCacNgn)}, stop after {formatPrice(
				data.thresholds.killAtNgn
			)} with no buyers. Pick a window that covers the whole campaign.
		</p>

		{#if data.report.campaigns.length === 0}
			<p class="mt-4 text-sm" style="color: var(--text-muted);">No signups in this window.</p>
		{:else}
			<div class="mt-3 overflow-x-auto">
				<table class="w-full min-w-[760px] text-left text-xs">
					<thead style="color: var(--text-dim);">
						<tr>
							<th class="py-2 pr-3 font-semibold">Source / campaign</th>
							<th class="py-2 pr-3 text-right font-semibold">Signups</th>
							<th class="py-2 pr-3 text-right font-semibold">Buyers</th>
							<th class="py-2 pr-3 text-right font-semibold">Repeat</th>
							<th class="py-2 pr-3 text-right font-semibold">Revenue</th>
							<th class="py-2 pr-3 font-semibold">Spend (₦)</th>
							<th class="py-2 font-semibold">Decision</th>
						</tr>
					</thead>
					<tbody>
						{#each data.report.campaigns as row (campaignKey(row))}
							{@const key = campaignKey(row)}
							{@const spend = spendByCampaign[key] ?? 0}
							{@const decision = decide({ spendNgn: spend, buyers: row.buyers }, data.thresholds)}
							<tr style="border-top: 1px solid var(--border); color: var(--text);">
								<td class="py-2 pr-3">
									<span class="font-semibold">{row.source}</span>
									{#if row.campaign}<span style="color: var(--text-muted);">
											/ {row.campaign}</span
										>{/if}
									{#if row.medium}<span class="block" style="color: var(--text-dim);"
											>{row.medium}</span
										>{/if}
								</td>
								<td class="py-2 pr-3 text-right">{row.signups}</td>
								<td class="py-2 pr-3 text-right">{row.buyers}</td>
								<td class="py-2 pr-3 text-right">{row.repeatBuyers}</td>
								<td class="py-2 pr-3 text-right">{formatPrice(row.revenueNgn)}</td>
								<td class="py-2 pr-3">
									{#if row.source !== 'untracked'}
										<input
											type="text"
											inputmode="numeric"
											aria-label={`Spend for ${row.source} ${row.campaign}`}
											value={spend > 0 ? String(spend) : ''}
											placeholder="0"
											onchange={(event) => setSpend(key, event.currentTarget.value)}
											class="w-24 px-2 py-1"
											style={inputStyle}
										/>
									{/if}
								</td>
								<td class="py-2">
									{#if spend > 0}
										<span
											class="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
											style={ACTION_STYLE[decision.action]}>{decision.action}</span
										>
										{#if decision.cacNgn !== null}
											<span class="ml-1 font-semibold">{formatPrice(decision.cacNgn)}/buyer</span>
										{/if}
										<span class="mt-1 block" style="color: var(--text-muted);"
											>{decision.reason}</span
										>
									{:else}
										<span style="color: var(--text-dim);">—</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<section
		class="rounded-xl p-4"
		style="background: var(--bg-elev-1); border: 1px solid var(--border);"
	>
		<h2 class="flex items-center gap-2 text-sm font-bold" style="color: var(--text);">
			<Target class="h-4 w-4" />
			Tracked link builder
		</h2>
		<p class="mt-1 text-xs" style="color: var(--text-muted);">
			One link per placement (each Nairaland board, Telegram post, WhatsApp TV). Results show up in
			Campaigns above under the source and campaign you enter.
		</p>
		<div class="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-5">
			<label class="flex flex-col gap-1" style="color: var(--text-dim);">
				Landing page
				<select bind:value={linkPath} class="px-2 py-1.5" style={inputStyle}>
					{#each data.landingOptions as option (option.path)}
						<option value={option.path}>{option.label}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1" style="color: var(--text-dim);">
				Source (where it runs)
				<input
					bind:value={linkSource}
					placeholder="nairaland"
					class="px-2 py-1.5"
					style={inputStyle}
				/>
			</label>
			<label class="flex flex-col gap-1" style="color: var(--text-dim);">
				Type
				<select bind:value={linkMedium} class="px-2 py-1.5" style={inputStyle}>
					{#each MEDIUMS as medium (medium)}
						<option value={medium}>{medium}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1" style="color: var(--text-dim);">
				Campaign
				<input
					bind:value={linkCampaign}
					placeholder="sports-oct"
					class="px-2 py-1.5"
					style={inputStyle}
				/>
			</label>
			<label class="flex flex-col gap-1" style="color: var(--text-dim);">
				Placement (optional)
				<input
					bind:value={linkContent}
					placeholder="banner-1"
					class="px-2 py-1.5"
					style={inputStyle}
				/>
			</label>
		</div>
		<div class="mt-3 flex flex-wrap items-center gap-2">
			<code
				class="min-w-0 flex-1 rounded-lg px-3 py-2 text-xs break-all"
				style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
			>
				{trackedUrl ?? 'Enter a source to build the link'}
			</code>
			<button
				type="button"
				disabled={!trackedUrl}
				onclick={copyLink}
				class="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50"
				style="background: var(--btn-primary-gradient); color: #04140c;"
			>
				<Copy class="h-3.5 w-3.5" />
				Copy
			</button>
		</div>
	</section>

	<div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
		<section
			class="rounded-xl p-4"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<h2 class="text-sm font-bold" style="color: var(--text);">First page new customers saw</h2>
			<table class="mt-3 w-full text-left text-xs">
				<thead style="color: var(--text-dim);">
					<tr>
						<th class="py-1.5 pr-3 font-semibold">Page</th>
						<th class="py-1.5 pr-3 text-right font-semibold">Signups</th>
						<th class="py-1.5 pr-3 text-right font-semibold">Buyers</th>
						<th class="py-1.5 text-right font-semibold">Revenue</th>
					</tr>
				</thead>
				<tbody>
					{#each data.report.landings as row (row.landing)}
						<tr style="border-top: 1px solid var(--border); color: var(--text);">
							<td class="py-1.5 pr-3 break-all">{row.landing}</td>
							<td class="py-1.5 pr-3 text-right">{row.signups}</td>
							<td class="py-1.5 pr-3 text-right">{row.buyers}</td>
							<td class="py-1.5 text-right">{formatPrice(row.revenueNgn)}</td>
						</tr>
					{:else}
						<tr><td colspan="4" class="py-2" style="color: var(--text-muted);">No data yet.</td></tr
						>
					{/each}
				</tbody>
			</table>
		</section>

		<section
			class="rounded-xl p-4"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<h2 class="text-sm font-bold" style="color: var(--text);">Most visited pages</h2>
			<table class="mt-3 w-full text-left text-xs">
				<thead style="color: var(--text-dim);">
					<tr>
						<th class="py-1.5 pr-3 font-semibold">Page</th>
						<th class="py-1.5 text-right font-semibold">Views</th>
					</tr>
				</thead>
				<tbody>
					{#each data.report.topPages as page (page.path)}
						<tr style="border-top: 1px solid var(--border); color: var(--text);">
							<td class="py-1.5 pr-3 break-all">{page.path}</td>
							<td class="py-1.5 text-right">{page.views.toLocaleString('en-NG')}</td>
						</tr>
					{:else}
						<tr><td colspan="2" class="py-2" style="color: var(--text-muted);">No data yet.</td></tr
						>
					{/each}
				</tbody>
			</table>
		</section>
	</div>

	<p class="text-xs" style="color: var(--text-dim);">
		Coming next: ad-network spend imported automatically, sales reported back to the networks, and
		consent-based tracking. Until then, spend typed here is saved in this browser only.
	</p>
</div>
