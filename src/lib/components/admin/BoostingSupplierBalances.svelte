<script lang="ts">
	import { onMount } from 'svelte';
	import { RefreshCcw } from '$lib/icons';
	import {
		BOOST_BALANCE_PROVIDERS,
		type BoostBalanceProvider,
		type BoostSupplierBalance
	} from '$lib/helpers/boosting-supplier-balances';
	let { previewOnly = false }: { previewOnly?: boolean } = $props();
	let balances = $state<Record<string, BoostSupplierBalance>>({});
	let pending = $state<Record<string, boolean>>({});
	const requests = new Map<BoostBalanceProvider, AbortController>();
	let disposed = false;
	async function refresh(provider?: BoostBalanceProvider) {
		const targets = BOOST_BALANCE_PROVIDERS.filter((item) => !provider || item.id === provider);
		if (previewOnly || targets.some((item) => pending[item.id])) return;
		const controller = new AbortController();
		for (const item of targets) {
			requests.set(item.id, controller);
			pending[item.id] = true;
		}
		const timeout = setTimeout(() => controller.abort(), 20000);
		function failed(id: BoostBalanceProvider) {
			if (!disposed)
				balances[id] = {
					...(balances[id] ?? {
						id,
						label: id,
						configured: true,
						balance: null,
						currency: null,
						checkedAt: null
					}),
					error: 'Couldn’t refresh · Tap to retry'
				};
		}
		try {
			const response = await fetch(
				`/api/admin/boosting-suppliers/balances${provider ? `?provider=${provider}` : ''}`,
				{ cache: 'no-store', signal: controller.signal }
			);
			const result = await response.json();
			if (!response.ok || !result.success || !Array.isArray(result?.data?.providers))
				throw new Error('Balance unavailable');
			if (disposed || controller.signal.aborted) return;
			for (const item of targets) {
				const record = result.data.providers.find(
					(record: BoostSupplierBalance) => record.id === item.id
				);
				if (
					!record ||
					record.error ||
					(record.balance !== null &&
						(!Number.isFinite(record.balance) ||
							record.balance < 0 ||
							!/^[A-Z]{3}$/.test(record.currency ?? '')))
				)
					failed(item.id);
				else balances[item.id] = record;
			}
		} catch {
			for (const item of targets) failed(item.id);
		} finally {
			clearTimeout(timeout);
			for (const item of targets) {
				if (!disposed) pending[item.id] = false;
				requests.delete(item.id);
			}
		}
	}
	onMount(() => {
		void refresh();
		return () => {
			disposed = true;
			for (const controller of requests.values()) controller.abort();
		};
	});
</script>

<div class="supplier-balances" aria-label="Supplier balances">
	{#each BOOST_BALANCE_PROVIDERS as provider (provider.id)}
		{@const record = balances[provider.id]}
		<button
			type="button"
			aria-label={`Refresh ${provider.label} balance`}
			aria-busy={Boolean(pending[provider.id])}
			disabled={previewOnly || pending[provider.id]}
			onclick={() => refresh(provider.id)}
			title={record?.checkedAt
				? `Last checked ${new Date(record.checkedAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })} · Lagos time. Refresh balance only; pricing drafts are unchanged.`
				: 'Refresh balance only; pricing drafts are unchanged.'}
		>
			<span class="value"
				>{provider.label}<strong
					>{record?.balance == null
						? '—'
						: `${record.currency} ${record.balance.toFixed(2)}`}</strong
				><RefreshCcw size={13} /></span
			>
			<span class="hint" class:failed={Boolean(record?.error)} role="status"
				>{previewOnly
					? 'Unavailable in sample preview'
					: pending[provider.id]
						? 'Refreshing…'
						: record?.error
							? `${record.balance == null ? '' : 'Previous balance · '}${record.error}`
							: record?.configured === false
								? 'Not configured'
								: 'Tap to refresh'}</span
			>
		</button>
	{/each}
</div>

<style>
	.supplier-balances {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	button {
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--surface);
		padding: 10px 13px;
		font-size: 12px;
		color: var(--text-muted);
		text-align: left;
		cursor: pointer;
	}
	button:hover:not(:disabled),
	button:focus-visible {
		border-color: var(--primary);
	}
	button:disabled {
		cursor: default;
	}
	.value {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	strong {
		color: var(--text);
	}
	.hint {
		display: block;
		font-size: 11px;
		margin-top: 4px;
	}
	.failed {
		color: #fbbf24;
	}
</style>
