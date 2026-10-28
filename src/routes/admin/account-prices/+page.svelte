<script lang="ts">
	import type { PageData } from './$types';
	import { addToast } from '$lib/stores/toasts';
	import { tierMarginNotes } from '$lib/helpers/tier-unit-cost';

	/**
	 * Account Prices: what each account type costs you, what it sells for, and what you keep.
	 * Prices change here only; Account Types and Inventory show them read-only.
	 */
	let { data }: { data: PageData } = $props();

	type Row = (typeof data.rows)[number];
	// Saved values; a save updates the row in place until the page next loads.
	let rows = $derived<Row[]>(data.rows.map((row) => ({ ...row })));
	let drafts = $state<Record<string, { price: string; cost: string }>>({});
	let saving = $state<string | null>(null);
	let search = $state('');

	const naira = (value: number) => `₦${Math.round(value).toLocaleString('en-NG')}`;

	function draftOf(row: Row) {
		return (
			drafts[row.id] ?? {
				price: String(row.priceNgn || ''),
				cost: row.costNgn === null ? '' : String(row.costNgn)
			}
		);
	}
	function setDraft(row: Row, field: 'price' | 'cost', value: string) {
		drafts = { ...drafts, [row.id]: { ...draftOf(row), [field]: value } };
	}
	function changed(row: Row): boolean {
		const draft = drafts[row.id];
		if (!draft) return false;
		const costNow = row.costNgn === null ? '' : String(row.costNgn);
		return (
			Number(draft.price) !== row.priceNgn || (data.showCosts && draft.cost.trim() !== costNow)
		);
	}
	function advice(row: Row) {
		const draft = draftOf(row);
		return tierMarginNotes({
			priceNgn: Number(draft.price),
			unitCostNgn: draft.cost,
			affiliateExcluded: row.affiliateExcluded
		});
	}
	function level(row: Row): 'none' | 'loss' | 'thin' | 'ok' | 'hidden' {
		if (!data.showCosts) return 'hidden';
		const result = advice(row);
		if (result.marginPercent === null && result.profitNgn === null) return 'none';
		const flag = result.notes.find((note) => note.level !== 'info')?.level;
		return flag === 'error' ? 'loss' : flag === 'warning' ? 'thin' : 'ok';
	}

	async function save(row: Row) {
		if (saving || !changed(row)) return;
		const draft = draftOf(row);
		const body: Record<string, unknown> = {};
		if (Number(draft.price) !== row.priceNgn) body.basePrice = Number(draft.price);
		const costNow = row.costNgn === null ? '' : String(row.costNgn);
		if (data.showCosts && draft.cost.trim() !== costNow) body.unitCostNgn = draft.cost.trim();
		saving = row.id;
		try {
			const response = await fetch(`/api/admin/account-types/${encodeURIComponent(row.id)}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result.error || 'Not saved.');
			const metadata = (result.data?.metadata ?? {}) as Record<string, unknown>;
			const pricing = (metadata.pricing ?? {}) as Record<string, unknown>;
			rows = rows.map((item) =>
				item.id === row.id
					? {
							...item,
							priceNgn: Number(pricing.base_price ?? item.priceNgn),
							costNgn: data.showCosts
								? metadata.unit_cost_ngn === undefined || metadata.unit_cost_ngn === ''
									? null
									: Number(metadata.unit_cost_ngn)
								: item.costNgn
						}
					: item
			);
			const { [row.id]: _saved, ...rest } = drafts;
			void _saved;
			drafts = rest;
			addToast({ type: 'success', title: `${row.name} saved`, duration: 2500 });
		} catch (error) {
			addToast({
				type: 'error',
				title: `${row.name} not saved`,
				message: error instanceof Error ? error.message : 'Try again.',
				duration: 4000
			});
		} finally {
			saving = null;
		}
	}

	const visible = $derived.by(() => {
		const term = search.trim().toLowerCase();
		return term
			? rows.filter((row) => `${row.name} ${row.platform}`.toLowerCase().includes(term))
			: rows;
	});
	const groups = $derived.by(() => {
		const order: string[] = [];
		const byPlatform: Record<string, Row[]> = {};
		for (const row of visible) {
			if (!byPlatform[row.platform]) {
				byPlatform[row.platform] = [];
				order.push(row.platform);
			}
			byPlatform[row.platform].push(row);
		}
		return order.map((platform) => ({ platform, rows: byPlatform[platform] }));
	});
	const summary = $derived.by(() => {
		if (!data.showCosts) return null;
		const withCost = rows.filter((row) => row.costNgn !== null).length;
		return {
			withCost,
			total: rows.length,
			losing: rows.filter((row) => level(row) === 'loss').length,
			thin: rows.filter((row) => level(row) === 'thin').length
		};
	});
	const LEVEL_TEXT = { none: 'No cost yet', loss: 'Losing money', thin: 'Thin margin', ok: 'OK' };
	const LEVEL_STYLE = {
		none: 'color: var(--text-muted); background: var(--bg-elev-2); border: 1px solid var(--border);',
		loss: 'color: var(--status-error); background: var(--status-error-bg); border: 1px solid var(--status-error-border);',
		thin: 'color: var(--status-warning); background: var(--status-warning-bg); border: 1px solid var(--status-warning-border);',
		ok: 'color: var(--status-success); background: var(--status-success-bg); border: 1px solid var(--status-success-border);'
	};
</script>

<svelte:head><title>Account Prices - Admin Panel</title></svelte:head>

<div class="space-y-4">
	<div>
		<h1 class="text-2xl font-bold" style="color: var(--text);">Account Prices</h1>
		<p class="mt-1 text-sm" style="color: var(--text-muted);">
			What each account type costs you, what it sells for, and what you keep. Prices are saved to
			the nearest ₦50.
		</p>
	</div>

	{#if summary}
		<div
			class="flex flex-wrap gap-x-6 gap-y-1 rounded-lg p-3 text-sm"
			style="background: var(--bg-elev-1); border: 1px solid var(--border); color: var(--text-muted);"
		>
			<span
				>Costs entered: <strong style="color: var(--text);"
					>{summary.withCost} of {summary.total}</strong
				></span
			>
			{#if summary.losing}<span style="color: var(--status-error);"
					>{summary.losing} losing money</span
				>{/if}
			{#if summary.thin}<span style="color: var(--status-warning);">{summary.thin} thin margin</span
				>{/if}
			<span>Margin = profit ÷ price</span>
		</div>
	{/if}

	<label class="block">
		<span class="sr-only">Search account types</span>
		<input
			type="search"
			bind:value={search}
			placeholder="Search account type or platform"
			class="w-full rounded-lg px-3 py-1.5 text-sm sm:max-w-sm"
			style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);"
		/>
	</label>

	{#each groups as group (group.platform)}
		<section
			class="overflow-hidden rounded-lg"
			style="border: 1px solid var(--border); background: var(--bg-elev-1);"
		>
			<h2
				class="px-4 py-2 text-sm font-semibold"
				style="color: var(--text); border-bottom: 1px solid var(--border);"
			>
				{group.platform}
			</h2>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="text-left text-xs uppercase" style="color: var(--text-muted);">
							<th class="px-4 py-2">Account type</th>
							<th class="px-4 py-2">Price (₦)</th>
							{#if data.showCosts}
								<th class="px-4 py-2">Cost (₦)</th>
								<th class="px-4 py-2 text-right">Profit</th>
								<th class="px-4 py-2 text-right">Margin</th>
								<th class="px-4 py-2"></th>
							{/if}
							<th class="px-4 py-2"></th>
						</tr>
					</thead>
					<tbody>
						{#each group.rows as row (row.id)}
							{@const draft = draftOf(row)}
							{@const result = advice(row)}
							{@const rowLevel = level(row)}
							<tr style="border-top: 1px solid var(--border);">
								<td class="px-4 py-2 align-middle" style="color: var(--text);">
									{row.name}
									{#if row.delivery === 'whatsapp'}<span
											class="ml-1 text-xs"
											style="color: var(--text-muted);">· WhatsApp</span
										>{/if}
								</td>
								<td class="px-4 py-2">
									<input
										type="number"
										min="50"
										step="50"
										aria-label={`Price for ${row.name}`}
										value={draft.price}
										oninput={(event) => setDraft(row, 'price', event.currentTarget.value)}
										class="w-28 rounded-md px-2 py-1"
										style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
									/>
								</td>
								{#if data.showCosts}
									<td class="px-4 py-2">
										<input
											type="number"
											min="0"
											step="1"
											placeholder="Not set"
											aria-label={`Cost for ${row.name}`}
											value={draft.cost}
											oninput={(event) => setDraft(row, 'cost', event.currentTarget.value)}
											class="w-28 rounded-md px-2 py-1"
											style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
										/>
									</td>
									<td class="px-4 py-2 text-right tabular-nums" style="color: var(--text);">
										{result.profitNgn === null ? '—' : naira(result.profitNgn)}
									</td>
									<td class="px-4 py-2 text-right tabular-nums" style="color: var(--text);">
										{result.marginPercent === null ? '—' : `${result.marginPercent}%`}
									</td>
									<td class="px-4 py-2">
										{#if rowLevel !== 'hidden'}
											<span
												class="rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
												style={LEVEL_STYLE[rowLevel]}>{LEVEL_TEXT[rowLevel]}</span
											>
										{/if}
									</td>
								{/if}
								<td class="px-4 py-2 text-right">
									<button
										type="button"
										onclick={() => save(row)}
										disabled={!changed(row) || saving !== null}
										class="rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-40"
										style="background: var(--surface); border: 1px solid var(--border); color: var(--text);"
										>{saving === row.id ? 'Saving…' : 'Save'}</button
									>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{:else}
		<p class="text-sm" style="color: var(--text-muted);">
			{search ? 'No account types match that search.' : 'No active account types yet.'}
		</p>
	{/each}
</div>
