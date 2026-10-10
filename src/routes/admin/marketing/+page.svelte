<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { TrendingUp, Copy, Target } from '$lib/icons';
	import { formatPrice } from '$lib/helpers/utils';
	import {
		buildNetworkTemplateUrl,
		buildTrackedUrl,
		hasNetworkMacros
	} from '$lib/helpers/tracked-link';
	import { decide, type MarketingAction } from '$lib/services/marketing/rules';
	import { showError, showSuccess } from '$lib/stores/toasts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let busy = $state<string | null>(null);

	const ACTION_STYLE: Record<MarketingAction, string> = {
		kill: 'background: var(--status-error-bg); color: var(--status-error); border: 1px solid var(--status-error-border);',
		prune:
			'background: var(--status-pending-bg); color: var(--status-pending); border: 1px solid var(--status-pending-border);',
		scale:
			'background: var(--status-success-bg); color: var(--status-success); border: 1px solid var(--status-success-border);',
		hold: 'background: var(--status-info-bg); color: var(--status-info); border: 1px solid var(--status-info-border);'
	};
	const card = 'background: var(--bg-elev-1); border: 1px solid var(--border);';
	const inputStyle =
		'background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 0.5rem;';
	const primaryButton = 'background: var(--btn-primary-gradient); color: #04140c;';
	const ghostButton = 'border: 1px solid var(--border); color: var(--text);';

	const trackedPct = $derived(
		data.report.totals.signups > 0
			? Math.round((data.report.totals.attributedSignups / data.report.totals.signups) * 100)
			: 0
	);
	const spendFor = (source: string, campaign: string) =>
		data.spendByCampaign[`${source}|${campaign}`] ?? 0;

	async function act(label: string, body: Record<string, unknown>, success: string) {
		if (busy) return false;
		busy = label;
		try {
			const response = await fetch('/api/admin/marketing', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok || !result.success) {
				showError('Not saved', result.error || 'The action could not be completed.');
				return false;
			}
			showSuccess(success, '');
			await invalidateAll();
			return true;
		} catch {
			showError('Not saved', 'Check your connection and try again.');
			return false;
		} finally {
			busy = null;
		}
	}

	// Book spend (direct buys)
	const today = new Date().toISOString().slice(0, 10);
	let bookSource = $state('');
	let bookCampaign = $state('');
	let bookPlacement = $state('');
	let bookAmount = $state('');
	let bookStart = $state(today);
	let bookEnd = $state(today);
	async function bookSpend() {
		const ok = await act(
			'book',
			{
				action: 'book_spend',
				channelKey: bookSource,
				campaignKey: bookCampaign,
				placementKey: bookPlacement,
				totalNgn: Number(bookAmount.replace(/[^0-9.]/g, '')),
				startDay: bookStart,
				endDay: bookEnd
			},
			'Spend booked'
		);
		if (ok) bookAmount = '';
	}

	// Channels
	let channelForm = $state({
		key: '',
		name: '',
		kind: 'network',
		status: 'testing',
		targetCacNgn: '',
		dailyCapNgn: '',
		postbackTemplate: '',
		dedupByClickId: false,
		notes: ''
	});
	function editChannel(channel: PageData['channels'][number]) {
		channelForm = {
			key: channel.key,
			name: channel.name,
			kind: channel.kind,
			status: channel.status,
			targetCacNgn: channel.targetCacNgn ? String(channel.targetCacNgn) : '',
			dailyCapNgn: channel.dailyCapNgn ? String(channel.dailyCapNgn) : '',
			postbackTemplate: channel.postbackTemplate ?? '',
			dedupByClickId: channel.dedupByClickId,
			notes: channel.notes ?? ''
		};
	}
	function saveChannel() {
		return act('channel', { action: 'save_channel', ...channelForm }, 'Channel saved');
	}

	// Link builder
	const MEDIUMS = ['forum', 'telegram', 'whatsapp', 'push', 'pop', 'banner', 'blog', 'influencer'];
	let linkPath = $state('/platforms');
	let linkSource = $state('');
	let linkMedium = $state('forum');
	let linkCampaign = $state('');
	let linkContent = $state('');
	const networkLink = $derived(hasNetworkMacros(linkSource));
	const trackedUrl = $derived(
		networkLink
			? buildNetworkTemplateUrl({
					baseUrl: data.siteUrl,
					path: linkPath,
					source: linkSource,
					medium: linkMedium
				})
			: buildTrackedUrl({
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
				What each channel, campaign and placement costs, and the buyers it brings.
			</p>
		</div>
		<div class="flex gap-1 rounded-full p-1" style="border: 1px solid var(--border);">
			{#each data.windows as days (days)}
				<a
					href={`?days=${days}`}
					class="rounded-full px-3 py-1 text-xs font-semibold"
					style={days === data.report.windowDays ? primaryButton : 'color: var(--text-muted);'}
				>
					{days} days
				</a>
			{/each}
		</div>
	</div>

	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		{#each [{ label: 'Signups', value: String(data.report.totals.signups) }, { label: 'From a tracked source', value: `${trackedPct}%` }, { label: 'Became buyers', value: String(data.report.totals.buyers) }, { label: 'Their revenue', value: formatPrice(data.report.totals.revenueNgn) }] as stat (stat.label)}
			<div class="rounded-xl p-4" style={card}>
				<p class="text-xs" style="color: var(--text-dim);">{stat.label}</p>
				<p class="mt-1 text-xl font-bold" style="color: var(--text);">{stat.value}</p>
			</div>
		{/each}
	</div>

	{#if !data.spendTrackingReady}
		<p
			class="rounded-xl p-3 text-xs"
			style="background: var(--status-info-bg); color: var(--status-info); border: 1px solid var(--status-info-border);"
		>
			Spend tracking isn't set up yet (its database update hasn't been applied). Signups and revenue
			below are live; spend, zones and channels appear once it is.
		</p>
	{/if}

	{#if data.heldPostbacks.length > 0}
		<section
			class="rounded-xl p-4"
			style="background: var(--status-pending-bg); border: 1px solid var(--status-pending-border);"
		>
			<h2 class="text-sm font-bold" style="color: var(--text);">
				Sale reports waiting for you ({data.heldPostbacks.length})
			</h2>
			<p class="mt-1 text-xs" style="color: var(--text-muted);">
				The network may already have received these (a timeout or interruption). Send again only if
				its dashboard does not show the conversion; otherwise discard.
			</p>
			<div class="mt-3 space-y-2">
				{#each data.heldPostbacks as held (held.orderId)}
					<div class="flex flex-wrap items-center gap-2 text-xs" style="color: var(--text);">
						<span class="font-semibold">{held.orderNumber}</span>
						<span style="color: var(--text-muted);"
							>{held.channelKey} · {formatPrice(held.netNgn)} · {held.lastResult}</span
						>
						<span class="flex-1"></span>
						{#if data.canManage}
							<button
								type="button"
								disabled={Boolean(busy)}
								onclick={() =>
									act(
										`send-${held.orderId}`,
										{
											action: 'postback_decision',
											orderId: held.orderId,
											channelKey: held.channelKey,
											decision: 'send'
										},
										'Sale report sent'
									)}
								class="rounded-full px-3 py-1 font-semibold disabled:opacity-50"
								style={primaryButton}>Send</button
							>
							<button
								type="button"
								disabled={Boolean(busy)}
								onclick={() =>
									act(
										`discard-${held.orderId}`,
										{
											action: 'postback_decision',
											orderId: held.orderId,
											channelKey: held.channelKey,
											decision: 'discard'
										},
										'Discarded'
									)}
								class="rounded-full px-3 py-1 font-semibold disabled:opacity-50"
								style={ghostButton}>Discard</button
							>
						{/if}
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<section class="rounded-xl p-4" style={card}>
		<h2 class="text-sm font-bold" style="color: var(--text);">Campaigns</h2>
		<p class="mt-1 text-xs" style="color: var(--text-muted);">
			Credited to the first tracked link each new customer used. Target {formatPrice(
				data.thresholds.targetCacNgn
			)} per buyer, ceiling {formatPrice(data.thresholds.ceilingCacNgn)}, stop after {formatPrice(
				data.thresholds.killAtNgn
			)} with no buyers.
		</p>
		{#if data.report.campaigns.length === 0}
			<p class="mt-4 text-sm" style="color: var(--text-muted);">No signups in this window.</p>
		{:else}
			<div class="mt-3 overflow-x-auto">
				<table class="w-full min-w-[720px] text-left text-xs">
					<thead style="color: var(--text-dim);">
						<tr>
							<th class="py-2 pr-3 font-semibold">Source / campaign</th>
							<th class="py-2 pr-3 text-right font-semibold">Signups</th>
							<th class="py-2 pr-3 text-right font-semibold">Buyers</th>
							<th class="py-2 pr-3 text-right font-semibold">Repeat</th>
							<th class="py-2 pr-3 text-right font-semibold">Revenue</th>
							<th class="py-2 pr-3 text-right font-semibold">Spend</th>
							<th class="py-2 font-semibold">Decision</th>
						</tr>
					</thead>
					<tbody>
						{#each data.report.campaigns as row (`${row.source}|${row.campaign}`)}
							{@const spend = spendFor(row.source, row.campaign)}
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
								<td class="py-2 pr-3 text-right">{spend > 0 ? formatPrice(spend) : '—'}</td>
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

	{#if data.placements.length > 0}
		<section class="rounded-xl p-4" style={card}>
			<h2 class="text-sm font-bold" style="color: var(--text);">Zones and placements</h2>
			<p class="mt-1 text-xs" style="color: var(--text-muted);">
				Credited to the last ad click before each purchase (visitors who accepted cookies).
			</p>
			<div class="mt-3 overflow-x-auto">
				<table class="w-full min-w-[760px] text-left text-xs">
					<thead style="color: var(--text-dim);">
						<tr>
							<th class="py-2 pr-3 font-semibold">Channel / campaign / placement</th>
							<th class="py-2 pr-3 text-right font-semibold">Spend</th>
							<th class="py-2 pr-3 text-right font-semibold">Clicks</th>
							<th class="py-2 pr-3 text-right font-semibold">Buyers</th>
							<th class="py-2 pr-3 text-right font-semibold">Revenue</th>
							<th class="py-2 font-semibold">Decision</th>
						</tr>
					</thead>
					<tbody>
						{#each data.placements as row (`${row.channelKey}|${row.campaignKey}|${row.placementKey}`)}
							{@const decision = decide(
								{ spendNgn: row.spendNgn, buyers: row.buyers },
								data.thresholds
							)}
							<tr style="border-top: 1px solid var(--border); color: var(--text);">
								<td class="py-2 pr-3">
									<span class="font-semibold">{row.channelKey}</span>
									<span style="color: var(--text-muted);">
										/ {row.campaignKey || '—'} / {row.placementKey || '—'}</span
									>
								</td>
								<td class="py-2 pr-3 text-right">{formatPrice(row.spendNgn)}</td>
								<td class="py-2 pr-3 text-right">{row.clicks.toLocaleString('en-NG')}</td>
								<td class="py-2 pr-3 text-right">{row.buyers}</td>
								<td class="py-2 pr-3 text-right">{formatPrice(row.revenueNgn)}</td>
								<td class="py-2">
									{#if row.spendNgn > 0}
										<span
											class="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
											style={ACTION_STYLE[decision.action]}>{decision.action}</span
										>
										{#if data.canManage && data.propellerConfigured && row.channelKey === 'propellerads' && row.placementKey && (decision.action === 'kill' || decision.action === 'prune')}
											<button
												type="button"
												disabled={Boolean(busy)}
												onclick={() =>
													act(
														`block-${row.placementKey}`,
														{
															action: 'block_zone',
															campaignKey: row.campaignKey,
															placementKey: row.placementKey,
															reason: decision.reason
														},
														'Zone blocked'
													)}
												class="ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold disabled:opacity-50"
												style={ghostButton}>Block zone</button
											>
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
		</section>
	{/if}

	{#if data.canManage && data.spendTrackingReady}
		<section class="rounded-xl p-4" style={card}>
			<h2 class="text-sm font-bold" style="color: var(--text);">Book spend for a direct buy</h2>
			<p class="mt-1 text-xs" style="color: var(--text-muted);">
				Nairaland boards, Telegram posts, WhatsApp TVs. Use the same source and campaign as the
				tracked link. The amount is spread across the dates. Network spend imports automatically.
			</p>
			<div class="mt-3 grid grid-cols-2 gap-3 text-xs lg:grid-cols-6">
				<label class="flex flex-col gap-1" style="color: var(--text-dim);"
					>Source<input
						bind:value={bookSource}
						placeholder="nairaland"
						class="px-2 py-1.5"
						style={inputStyle}
					/></label
				>
				<label class="flex flex-col gap-1" style="color: var(--text-dim);"
					>Campaign<input
						bind:value={bookCampaign}
						placeholder="sports-oct"
						class="px-2 py-1.5"
						style={inputStyle}
					/></label
				>
				<label class="flex flex-col gap-1" style="color: var(--text-dim);"
					>Placement<input
						bind:value={bookPlacement}
						placeholder="sports-board"
						class="px-2 py-1.5"
						style={inputStyle}
					/></label
				>
				<label class="flex flex-col gap-1" style="color: var(--text-dim);"
					>Amount (₦)<input
						bind:value={bookAmount}
						inputmode="numeric"
						placeholder="11600"
						class="px-2 py-1.5"
						style={inputStyle}
					/></label
				>
				<label class="flex flex-col gap-1" style="color: var(--text-dim);"
					>From<input
						type="date"
						bind:value={bookStart}
						class="px-2 py-1.5"
						style={inputStyle}
					/></label
				>
				<label class="flex flex-col gap-1" style="color: var(--text-dim);"
					>To<input
						type="date"
						bind:value={bookEnd}
						class="px-2 py-1.5"
						style={inputStyle}
					/></label
				>
			</div>
			<button
				type="button"
				disabled={Boolean(busy) || !bookSource || !bookAmount}
				onclick={bookSpend}
				class="mt-3 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50"
				style={primaryButton}>Book spend</button
			>
		</section>
	{/if}

	<section class="rounded-xl p-4" style={card}>
		<h2 class="flex items-center gap-2 text-sm font-bold" style="color: var(--text);">
			<Target class="h-4 w-4" />
			Tracked link builder
		</h2>
		<p class="mt-1 text-xs" style="color: var(--text-muted);">
			One link per placement. For PropellerAds, paste the result as the campaign's destination URL:
			it fills in the campaign, zone and click id automatically.
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
			{#if !networkLink}
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
			{/if}
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
				style={primaryButton}
			>
				<Copy class="h-3.5 w-3.5" />
				Copy
			</button>
		</div>
	</section>

	{#if data.spendTrackingReady}
		<section class="rounded-xl p-4" style={card}>
			<h2 class="text-sm font-bold" style="color: var(--text);">Channels</h2>
			{#if data.channels.length === 0}
				<p class="mt-2 text-xs" style="color: var(--text-muted);">No channels yet.</p>
			{:else}
				<div class="mt-3 overflow-x-auto">
					<table class="w-full min-w-[620px] text-left text-xs">
						<thead style="color: var(--text-dim);">
							<tr>
								<th class="py-2 pr-3 font-semibold">Channel</th>
								<th class="py-2 pr-3 font-semibold">Status</th>
								<th class="py-2 pr-3 text-right font-semibold">Target / buyer</th>
								<th class="py-2 pr-3 font-semibold">Sale reports</th>
								<th class="py-2"></th>
							</tr>
						</thead>
						<tbody>
							{#each data.channels as channel (channel.key)}
								<tr style="border-top: 1px solid var(--border); color: var(--text);">
									<td class="py-2 pr-3"
										><span class="font-semibold">{channel.name}</span>
										<span style="color: var(--text-dim);">({channel.key}, {channel.kind})</span></td
									>
									<td class="py-2 pr-3">{channel.status}</td>
									<td class="py-2 pr-3 text-right"
										>{channel.targetCacNgn ? formatPrice(channel.targetCacNgn) : 'default'}</td
									>
									<td class="py-2 pr-3"
										>{channel.postbackTemplate
											? channel.dedupByClickId
												? 'on (retries allowed)'
												: 'on'
											: 'off'}</td
									>
									<td class="py-2 text-right">
										{#if data.canManage}
											<button
												type="button"
												onclick={() => editChannel(channel)}
												class="rounded-full px-3 py-1 font-semibold"
												style={ghostButton}>Edit</button
											>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			{#if data.canManage}
				<div class="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
					<label class="flex flex-col gap-1" style="color: var(--text-dim);"
						>Key (= link source)<input
							bind:value={channelForm.key}
							placeholder="propellerads"
							class="px-2 py-1.5"
							style={inputStyle}
						/></label
					>
					<label class="flex flex-col gap-1" style="color: var(--text-dim);"
						>Name<input
							bind:value={channelForm.name}
							placeholder="PropellerAds"
							class="px-2 py-1.5"
							style={inputStyle}
						/></label
					>
					<label class="flex flex-col gap-1" style="color: var(--text-dim);"
						>Type<select bind:value={channelForm.kind} class="px-2 py-1.5" style={inputStyle}
							><option value="network">Ad network</option><option value="direct">Direct buy</option
							><option value="affiliate">Affiliate</option><option value="seo">SEO</option></select
						></label
					>
					<label class="flex flex-col gap-1" style="color: var(--text-dim);"
						>Status<select bind:value={channelForm.status} class="px-2 py-1.5" style={inputStyle}
							><option value="testing">Testing</option><option value="scaling">Scaling</option
							><option value="paused">Paused</option><option value="killed">Stopped</option></select
						></label
					>
					<label class="flex flex-col gap-1" style="color: var(--text-dim);"
						>Target per buyer (₦, optional)<input
							bind:value={channelForm.targetCacNgn}
							inputmode="numeric"
							class="px-2 py-1.5"
							style={inputStyle}
						/></label
					>
					<label class="flex flex-col gap-1" style="color: var(--text-dim);"
						>Daily cap (₦, optional)<input
							bind:value={channelForm.dailyCapNgn}
							inputmode="numeric"
							class="px-2 py-1.5"
							style={inputStyle}
						/></label
					>
					<label class="flex flex-col gap-1 sm:col-span-2" style="color: var(--text-dim);"
						>Sale-report (postback) URL, pasted from the network<input
							bind:value={channelForm.postbackTemplate}
							placeholder="http://ad.propellerads.com/conversion.php?aid=…&tid=…&visitor_id=$&#123;SUBID&#125;"
							class="px-2 py-1.5"
							style={inputStyle}
						/></label
					>
				</div>
				<label class="mt-3 flex items-start gap-2 text-xs" style="color: var(--text-muted);">
					<input type="checkbox" bind:checked={channelForm.dedupByClickId} class="mt-0.5" />
					<span
						>This network ignores duplicate sale reports for the same click (only tick if its docs
						say so). When ticked, uncertain reports are retried automatically instead of waiting for
						review.</span
					>
				</label>
				<button
					type="button"
					disabled={Boolean(busy) || !channelForm.key}
					onclick={saveChannel}
					class="mt-3 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50"
					style={primaryButton}>Save channel</button
				>
			{/if}
		</section>
	{/if}

	<div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
		<section class="rounded-xl p-4" style={card}>
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

		<section class="rounded-xl p-4" style={card}>
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
</div>
