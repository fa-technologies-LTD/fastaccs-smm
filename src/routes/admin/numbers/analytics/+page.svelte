<script lang="ts">
	import { Phone, TrendingUp, AlertTriangle, ShieldCheck } from '$lib/icons';
	import OrderTypeTabs from '$lib/components/admin/OrderTypeTabs.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const a = $derived(data.analytics);
	const lowBalance = $derived(
		data.hubBalanceCents != null && data.hubBalanceCents < data.lowBalanceThresholdCents
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
</script>

<div class="p-6 max-w-6xl mx-auto" style="color: var(--text);">
	<div class="flex items-center justify-between mb-3 flex-wrap gap-3">
		<div class="flex items-center gap-3">
			<Phone class="w-6 h-6" style="color: #38bdf8;" />
			<h1 class="text-2xl font-bold" style="color: var(--text);">Numbers — Orders & Analytics</h1>
		</div>
		<a href="/admin/numbers" class="text-sm hover:underline" style="color: #38bdf8;">Pricing →</a>
	</div>
	<div class="mb-6">
		<OrderTypeTabs active="numbers" />
	</div>

	{#if lowBalance}
		<div
			class="mb-4 p-3 rounded-lg text-sm flex items-center gap-2"
			style="background: rgba(220,38,38,0.10); color: #f87171;"
		>
			<AlertTriangle class="w-4 h-4" />
			hub-man balance is low (${((data.hubBalanceCents ?? 0) / 100).toFixed(2)}) — top up to keep numbers selling.
		</div>
	{/if}

	<!-- KPI cards -->
	<div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
		{#snippet kpi(label: string, value: string, accent = false)}
			<div class="p-4 rounded-lg" style="border: 1px solid var(--border); background: var(--surface);">
				<div class="text-xs" style="color: var(--text-muted);">{label}</div>
				<div class="text-2xl font-bold" style="color: {accent ? '#34d399' : 'var(--text)'};">{value}</div>
			</div>
		{/snippet}
		{@render kpi('Total rents', String(a.overall.total))}
		{@render kpi('Success rate', pct(a.overall.successRatePct))}
		{@render kpi('Revenue', ngn(a.overall.revenueNgn))}
		{@render kpi('Margin', ngn(a.overall.marginNgn), true)}
		<div
			class="p-4 rounded-lg"
			style="border: 1px solid {lowBalance ? '#dc2626' : 'var(--border)'}; background: {lowBalance
				? 'rgba(220,38,38,0.10)'
				: 'var(--surface)'};"
		>
			<div class="text-xs" style="color: var(--text-muted);">hub-man balance</div>
			<div class="text-2xl font-bold" style="color: {lowBalance ? '#f87171' : 'var(--text)'};">
				{data.hubBalanceCents == null ? '—' : `$${(data.hubBalanceCents / 100).toFixed(2)}`}
			</div>
		</div>
	</div>

	<!-- Per service/country -->
	<h2 class="font-semibold mb-2 flex items-center gap-2" style="color: var(--text);">
		<TrendingUp class="w-4 h-4" style="color: var(--text-muted);" /> By service & country
	</h2>
	<div class="overflow-x-auto rounded-lg mb-8" style="border: 1px solid var(--border);">
		<table class="w-full text-sm">
			<thead style="background: var(--bg-elev-1);">
				<tr class="text-left text-xs uppercase" style="color: var(--text-muted);">
					<th class="px-4 py-3">Service</th>
					<th class="px-4 py-3">Country</th>
					<th class="px-4 py-3 text-right">Rents</th>
					<th class="px-4 py-3 text-right">Success</th>
					<th class="px-4 py-3 text-right">Avg OTP</th>
					<th class="px-4 py-3 text-right">Revenue</th>
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
									<AlertTriangle class="inline w-3.5 h-3.5" style="color: #fbbf24;" />
								</span>
							{/if}
						</td>
						<td class="px-4 py-2" style="color: var(--text-muted);">{row.countryName}</td>
						<td class="px-4 py-2 text-right" style="color: var(--text);">{row.total}</td>
						<td
							class="px-4 py-2 text-right"
							style="color: {row.needsAttention ? '#fbbf24' : 'var(--text)'}; font-weight: {row.needsAttention ? 600 : 400};"
						>
							{pct(row.successRatePct)}
						</td>
						<td class="px-4 py-2 text-right" style="color: var(--text-muted);">{secs(row.avgTimeToOtpSec)}</td>
						<td class="px-4 py-2 text-right" style="color: var(--text);">{ngn(row.revenueNgn)}</td>
						<td class="px-4 py-2 text-right" style="color: #34d399;">{ngn(row.marginNgn)}</td>
					</tr>
				{/each}
				{#if a.byService.length === 0}
					<tr style="background: var(--surface);">
						<td colspan="7" class="px-4 py-8 text-center" style="color: var(--text-dim);">No rentals yet.</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>

	<!-- Recent -->
	<h2 class="font-semibold mb-2 flex items-center gap-2" style="color: var(--text);">
		<ShieldCheck class="w-4 h-4" style="color: var(--text-muted);" /> Recent rentals
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
					<th class="px-4 py-3 text-right">Sale</th>
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
						<td class="px-4 py-2 font-medium" style="color: {statusColor(r.status)};">{r.status}</td>
						<td class="px-4 py-2 text-right" style="color: var(--text);">{ngn(r.saleNgn)}</td>
						<td class="px-4 py-2 text-right" style="color: var(--text-muted);">
							{r.costUsd == null ? '—' : `$${r.costUsd.toFixed(2)}`}
						</td>
					</tr>
				{/each}
				{#if a.recent.length === 0}
					<tr style="background: var(--surface);">
						<td colspan="8" class="px-4 py-8 text-center" style="color: var(--text-dim);">No rentals yet.</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>
