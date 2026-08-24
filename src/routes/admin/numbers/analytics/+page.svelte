<script lang="ts">
	import { Phone, TrendingUp, AlertTriangle, ShieldCheck } from '$lib/icons';
	import OrderTypeTabs from '$lib/components/admin/OrderTypeTabs.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const a = $derived(data.analytics);
	const lowBalance = $derived(
		data.hubBalanceCents != null && data.hubBalanceCents < data.lowBalanceThresholdCents
	);
	const lowPvapinsBalance = $derived(
		data.pvapinsBalanceCents != null && data.pvapinsBalanceCents < data.lowBalanceThresholdCents
	);

	function ngn(n: number): string {
		return '₦' + Math.round(n).toLocaleString();
	}
	function pct(n: number | null): string {
		return n == null ? '—' : `${n}%`;
	}
	function secs(n: number | null): string {
		return n == null ? '—' : n < 60 ? `${n}s` : `${Math.round(n / 60)}m`;
	}
	function statusColor(s: string): string {
		if (s === 'received') return '#34d399';
		if (['refunded', 'expired', 'cancelled', 'failed'].includes(s)) return '#fbbf24';
		return '#38bdf8';
	}
	function probeCount(status: string): number {
		return Number(data.probeSummary?.byStatus?.[status] ?? 0);
	}
	function probeStatusColor(status: string): string {
		if (status === 'delivery_proven') return '#34d399';
		if (status === 'rentable') return '#38bdf8';
		if (status === 'release_failed') return '#f87171';
		return 'var(--text-muted)';
	}
</script>

{#snippet kpi(label: string, value: string, accent = false)}
	<div class="rounded-lg p-4" style="border: 1px solid var(--border); background: var(--surface);">
		<div class="text-xs" style="color: var(--text-muted);">{label}</div>
		<div class="text-2xl font-bold" style="color: {accent ? '#34d399' : 'var(--text)'};">
			{value}
		</div>
	</div>
{/snippet}

<div class="mx-auto max-w-6xl p-6" style="color: var(--text);">
	<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-center gap-3">
			<Phone class="h-6 w-6" style="color: #38bdf8;" />
			<h1 class="text-2xl font-bold" style="color: var(--text);">Numbers — Orders & Analytics</h1>
		</div>
		<a href="/admin/numbers" class="text-sm hover:underline" style="color: #38bdf8;">Pricing →</a>
	</div>
	<div class="mb-6">
		<OrderTypeTabs active="numbers" />
	</div>

	{#if lowBalance}
		<div
			class="mb-4 flex items-center gap-2 rounded-lg p-3 text-sm"
			style="background: rgba(220,38,38,0.10); color: #f87171;"
		>
			<AlertTriangle class="h-4 w-4" />
			hub-man balance is low (${((data.hubBalanceCents ?? 0) / 100).toFixed(2)}) — top up to keep
			numbers selling.
		</div>
	{/if}
	{#if lowPvapinsBalance}
		<div
			class="mb-4 flex items-center gap-2 rounded-lg p-3 text-sm"
			style="background: rgba(220,38,38,0.10); color: #f87171;"
		>
			<AlertTriangle class="h-4 w-4" />
			PVAPins balance is low (${((data.pvapinsBalanceCents ?? 0) / 100).toFixed(2)}) — top up to
			keep its successful OTPs available.
		</div>
	{/if}

	<!-- KPI cards -->
	<div class="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
		{@render kpi('Total rents', String(a.overall.total))}
		{@render kpi('Success rate', pct(a.overall.successRatePct))}
		{@render kpi('Net sales', ngn(a.overall.revenueNgn))}
		{@render kpi('Margin', ngn(a.overall.marginNgn), true)}
		<div
			class="rounded-lg p-4"
			style="border: 1px solid {lowBalance ? '#dc2626' : 'var(--border)'}; background: {lowBalance
				? 'rgba(220,38,38,0.10)'
				: 'var(--surface)'};"
		>
			<div class="text-xs" style="color: var(--text-muted);">hub-man balance</div>
			<div class="text-2xl font-bold" style="color: {lowBalance ? '#f87171' : 'var(--text)'};">
				{data.hubBalanceCents == null ? '—' : `$${(data.hubBalanceCents / 100).toFixed(2)}`}
			</div>
		</div>
		<div
			class="rounded-lg p-4"
			style="border: 1px solid {lowPvapinsBalance
				? '#dc2626'
				: 'var(--border)'}; background: {lowPvapinsBalance
				? 'rgba(220,38,38,0.10)'
				: 'var(--surface)'};"
		>
			<div class="text-xs" style="color: var(--text-muted);">PVAPins balance</div>
			<div
				class="text-2xl font-bold"
				style="color: {lowPvapinsBalance ? '#f87171' : 'var(--text)'};"
			>
				{data.pvapinsBalanceCents == null ? '—' : `$${(data.pvapinsBalanceCents / 100).toFixed(2)}`}
			</div>
		</div>
	</div>

	<!-- Controlled catalogue discovery -->
	<h2 class="mb-2 flex items-center gap-2 font-semibold" style="color: var(--text);">
		<ShieldCheck class="h-4 w-4" style="color: var(--text-muted);" /> Catalogue discovery
	</h2>
	<div
		class="mb-8 rounded-lg p-4"
		style="border: 1px solid var(--border); background: var(--surface);"
	>
		<p class="mb-3 text-sm" style="color: var(--text-muted);">
			Idle checks can prove a PVAPins combination rentable; only real buyer OTPs prove delivery.
			Nothing here is published automatically.
		</p>
		{#if data.probeSummary}
			<div class="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
				{@render kpi('Discovered', String(probeCount('discovered')))}
				{@render kpi('Rentable', String(probeCount('rentable')))}
				{@render kpi('Delivery proven', String(probeCount('delivery_proven')), true)}
				{@render kpi('Unreliable', String(probeCount('unreliable')))}
				{@render kpi('Release review', String(probeCount('release_failed')))}
			</div>
			{#if data.probeSummary.recent.length > 0}
				<div class="overflow-x-auto rounded-lg" style="border: 1px solid var(--border);">
					<table class="w-full text-sm">
						<thead style="background: var(--bg-elev-1);">
							<tr class="text-left text-xs uppercase" style="color: var(--text-muted);">
								<th class="px-3 py-2">Service</th>
								<th class="px-3 py-2">Country</th>
								<th class="px-3 py-2">PVAPins variant</th>
								<th class="px-3 py-2">Evidence</th>
								<th class="px-3 py-2">Last checked</th>
							</tr>
						</thead>
						<tbody>
							{#each data.probeSummary.recent as probe (probe.providerServiceRef + probe.countryName)}
								<tr style="border-top: 1px solid var(--border);">
									<td class="px-3 py-2" style="color: var(--text);">{probe.serviceName}</td>
									<td class="px-3 py-2" style="color: var(--text-muted);">{probe.countryName}</td>
									<td class="px-3 py-2 font-mono" style="color: var(--text-muted);"
										>{probe.providerServiceRef}</td
									>
									<td class="px-3 py-2 font-medium" style="color: {probeStatusColor(probe.status)};"
										>{probe.status.replaceAll('_', ' ')}</td
									>
									<td class="px-3 py-2 whitespace-nowrap" style="color: var(--text-muted);"
										>{probe.lastProbedAt ? new Date(probe.lastProbedAt).toLocaleString() : '—'}</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{:else}
			<p class="text-sm" style="color: var(--text-dim);">
				Discovery records will appear after the additive migration is applied.
			</p>
		{/if}
	</div>

	<!-- Measured catalogue demand -->
	<h2 class="mb-2 flex items-center gap-2 font-semibold" style="color: var(--text);">
		<TrendingUp class="h-4 w-4" style="color: var(--text-muted);" /> Catalogue demand — 30 days
	</h2>
	<div class="mb-8 overflow-x-auto rounded-lg" style="border: 1px solid var(--border);">
		<table class="w-full text-sm">
			<thead style="background: var(--bg-elev-1);">
				<tr class="text-left text-xs uppercase" style="color: var(--text-muted);">
					<th class="px-4 py-3">Service</th>
					<th class="px-4 py-3 text-right">Opened</th>
					<th class="px-4 py-3 text-right">Paid orders</th>
					<th class="px-4 py-3 text-right">Codes delivered</th>
				</tr>
			</thead>
			<tbody>
				{#each a.demand30d as row (row.serviceId)}
					<tr style="border-top: 1px solid var(--border); background: var(--surface);">
						<td class="px-4 py-2 font-medium" style="color: var(--text);">{row.serviceName}</td>
						<td class="px-4 py-2 text-right" style="color: var(--text-muted);">{row.opens}</td>
						<td class="px-4 py-2 text-right" style="color: var(--text);">{row.purchases}</td>
						<td class="px-4 py-2 text-right" style="color: #34d399;">{row.deliveries}</td>
					</tr>
				{/each}
				{#if a.demand30d.length === 0}
					<tr style="background: var(--surface);">
						<td colspan="4" class="px-4 py-8 text-center" style="color: var(--text-dim);">
							Demand data will appear after customers use the expanded catalogue.
						</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>

	<!-- Per service/country -->
	<h2 class="mb-2 flex items-center gap-2 font-semibold" style="color: var(--text);">
		<TrendingUp class="h-4 w-4" style="color: var(--text-muted);" /> By service & country
	</h2>
	<div class="mb-8 overflow-x-auto rounded-lg" style="border: 1px solid var(--border);">
		<table class="w-full text-sm">
			<thead style="background: var(--bg-elev-1);">
				<tr class="text-left text-xs uppercase" style="color: var(--text-muted);">
					<th class="px-4 py-3">Service</th>
					<th class="px-4 py-3">Country</th>
					<th class="px-4 py-3 text-right">Rents</th>
					<th class="px-4 py-3 text-right">Success</th>
					<th class="px-4 py-3 text-right">Avg OTP</th>
					<th class="px-4 py-3 text-right">Net sales</th>
					<th class="px-4 py-3 text-right">Margin</th>
				</tr>
			</thead>
			<tbody>
				{#each a.byService as row (row.serviceName + row.countryName)}
					<tr
						style="border-top: 1px solid var(--border); background: {row.needsAttention
							? 'rgba(245,158,11,0.08)'
							: 'var(--surface)'};"
					>
						<td class="px-4 py-2 font-medium" style="color: var(--text);">
							{row.serviceName}
							{#if row.needsAttention}
								<span title="High failure rate — users having issues here">
									<AlertTriangle class="inline h-3.5 w-3.5" style="color: #fbbf24;" />
								</span>
							{/if}
						</td>
						<td class="px-4 py-2" style="color: var(--text-muted);">{row.countryName}</td>
						<td class="px-4 py-2 text-right" style="color: var(--text);">{row.total}</td>
						<td
							class="px-4 py-2 text-right"
							style="color: {row.needsAttention
								? '#fbbf24'
								: 'var(--text)'}; font-weight: {row.needsAttention ? 600 : 400};"
						>
							{pct(row.successRatePct)}
						</td>
						<td class="px-4 py-2 text-right" style="color: var(--text-muted);"
							>{secs(row.avgTimeToOtpSec)}</td
						>
						<td class="px-4 py-2 text-right" style="color: var(--text);">{ngn(row.revenueNgn)}</td>
						<td class="px-4 py-2 text-right" style="color: #34d399;">{ngn(row.marginNgn)}</td>
					</tr>
				{/each}
				{#if a.byService.length === 0}
					<tr style="background: var(--surface);">
						<td colspan="7" class="px-4 py-8 text-center" style="color: var(--text-dim);"
							>No rentals yet.</td
						>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>

	<!-- Recent -->
	<h2 class="mb-2 flex items-center gap-2 font-semibold" style="color: var(--text);">
		<ShieldCheck class="h-4 w-4" style="color: var(--text-muted);" /> Recent rentals
	</h2>
	<div class="overflow-x-auto rounded-lg" style="border: 1px solid var(--border);">
		<table class="w-full text-sm">
			<thead style="background: var(--bg-elev-1);">
				<tr class="text-left text-xs uppercase" style="color: var(--text-muted);">
					<th class="px-4 py-3">When</th>
					<th class="px-4 py-3">Buyer</th>
					<th class="px-4 py-3">Service</th>
					<th class="px-4 py-3">Source</th>
					<th class="px-4 py-3">Number</th>
					<th class="px-4 py-3">Status</th>
					<th class="px-4 py-3 text-right">Net sale</th>
					<th class="px-4 py-3 text-right">Cost</th>
				</tr>
			</thead>
			<tbody>
				{#each a.recent as r (r.createdAt + (r.phoneNumber ?? ''))}
					<tr style="border-top: 1px solid var(--border); background: var(--surface);">
						<td class="px-4 py-2 whitespace-nowrap" style="color: var(--text-muted);">
							{new Date(r.createdAt).toLocaleString()}
						</td>
						<td class="px-4 py-2" style="color: var(--text);">
							{#if r.buyer}
								<a
									href="/admin/users?q={encodeURIComponent(r.buyer)}"
									class="hover:underline"
									style="color: #38bdf8;">{r.buyer}</a
								>
							{:else}
								<span style="color: var(--text-dim);">guest</span>
							{/if}
						</td>
						<td class="px-4 py-2" style="color: var(--text);">{r.serviceName} — {r.countryName}</td>
						<td class="px-4 py-2">
							<span
								class="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
								style={r.provider === 'pvapins'
									? 'background: rgba(167,139,250,0.14); color: #a78bfa; border: 1px solid rgba(167,139,250,0.3);'
									: 'background: rgba(56,189,248,0.12); color: #38bdf8; border: 1px solid rgba(56,189,248,0.28);'}
								>{r.provider === 'pvapins' ? 'pvapins' : 'hub-man'}</span
							>
						</td>
						<td class="px-4 py-2 font-mono" style="color: var(--text);">{r.phoneNumber ?? '—'}</td>
						<td class="px-4 py-2 font-medium" style="color: {statusColor(r.status)};">{r.status}</td
						>
						<td class="px-4 py-2 text-right" style="color: var(--text);">{ngn(r.saleNgn)}</td>
						<td class="px-4 py-2 text-right" style="color: var(--text-muted);">
							{r.costUsd == null ? '—' : `$${r.costUsd.toFixed(2)}`}
						</td>
					</tr>
				{/each}
				{#if a.recent.length === 0}
					<tr style="background: var(--surface);">
						<td colspan="8" class="px-4 py-8 text-center" style="color: var(--text-dim);"
							>No rentals yet.</td
						>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>
