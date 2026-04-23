<script lang="ts">
	import type { PageData } from './$types';
	import { addToast } from '$lib/stores/toasts';
	import { formatDate, formatPrice } from '$lib/helpers/utils';

	let { data }: { data: PageData } = $props();
	type PromotionRow = (typeof data.promotions)[number];
	type PlatformRow = (typeof data.platforms)[number];

	let promotions = $state<PromotionRow[]>(data.promotions || []);
	const platforms: PlatformRow[] = data.platforms || [];
	const canManagePromotions = data.canManagePromotions;
	let loading = $state(false);
	let selectedPlatformIds = $state<string[]>([]);

	let form = $state({
		code: '',
		type: 'PERCENT',
		value: 10,
		minOrderValue: 0,
		usageCap: '',
		singleUsePerUser: false,
		startsAt: '',
		endsAt: '',
		isActive: true
	});

	function resetForm() {
		form = {
			code: '',
			type: 'PERCENT',
			value: 10,
			minOrderValue: 0,
			usageCap: '',
			singleUsePerUser: false,
			startsAt: '',
			endsAt: '',
			isActive: true
		};
		selectedPlatformIds = [];
	}

	function togglePlatform(platformId: string) {
		if (selectedPlatformIds.includes(platformId)) {
			selectedPlatformIds = selectedPlatformIds.filter((value) => value !== platformId);
			return;
		}
		selectedPlatformIds = [...selectedPlatformIds, platformId];
	}

	async function createPromotion() {
		if (!canManagePromotions || loading) return;
		loading = true;
		try {
			const response = await fetch('/api/admin/promotions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					code: form.code,
					type: form.type,
					value: form.value,
					minOrderValue: form.minOrderValue,
					usageCap: form.usageCap === '' ? null : Number(form.usageCap),
					singleUsePerUser: form.singleUsePerUser,
					platformIds: selectedPlatformIds,
					startsAt: form.startsAt || null,
					endsAt: form.endsAt || null,
					isActive: form.isActive
				})
			});
			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Failed to create promotion');
			}

			promotions = [result.data, ...promotions];
			addToast({
				type: 'success',
				title: `Promo ${result.data.code} created`,
				duration: 3000
			});
			resetForm();
		} catch (error) {
			addToast({
				type: 'error',
				title: error instanceof Error ? error.message : 'Failed to create promotion',
				duration: 3500
			});
		} finally {
			loading = false;
		}
	}

	async function togglePromotionStatus(id: string, isActive: boolean) {
		if (!canManagePromotions || loading) return;
		loading = true;
		try {
			const response = await fetch(`/api/admin/promotions/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ isActive: !isActive })
			});
			const result = await response.json();
			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Failed to update promotion');
			}
			promotions = promotions.map((item: PromotionRow) => (item.id === id ? result.data : item));
		} catch (error) {
			addToast({
				type: 'error',
				title: error instanceof Error ? error.message : 'Failed to update promotion',
				duration: 3200
			});
		} finally {
			loading = false;
		}
	}

	async function deletePromotion(id: string) {
		if (!canManagePromotions || loading) return;
		loading = true;
		try {
			const response = await fetch(`/api/admin/promotions/${id}`, { method: 'DELETE' });
			const result = await response.json();
			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Failed to delete promotion');
			}
			promotions = promotions.filter((item: PromotionRow) => item.id !== id);
		} catch (error) {
			addToast({
				type: 'error',
				title: error instanceof Error ? error.message : 'Failed to delete promotion',
				duration: 3200
			});
		} finally {
			loading = false;
		}
	}

	function getPlatformNames(platformIds: string[]): string {
		if (!platformIds || platformIds.length === 0) return 'All platforms';
		const names = platformIds
			.map((id) => platforms.find((platform: PlatformRow) => platform.id === id)?.name)
			.filter((name): name is string => Boolean(name));
		return names.length ? names.join(', ') : 'Selected platforms';
	}
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold" style="color: var(--text)">Promotions</h1>
		<p class="mt-1 text-sm" style="color: var(--text-muted);">
			Manage promo codes. Affiliate structure remains untouched for future rollout.
		</p>
	</div>

	<section class="rounded-lg p-6" style="background: var(--bg-elev-1); border: 1px solid var(--border);">
		<h2 class="text-lg font-semibold" style="color: var(--text)">Create Promo Code</h2>
		{#if !canManagePromotions}
			<p class="mt-2 text-sm" style="color: var(--text-muted);">
				You have read-only access for promotions.
			</p>
		{/if}

		<form
			class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2"
			onsubmit={(event) => {
				event.preventDefault();
				void createPromotion();
			}}
		>
			<label class="block text-sm" style="color: var(--text-muted);">
				Code
				<input
					type="text"
					required
					bind:value={form.code}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
					placeholder="WELCOME10"
					disabled={!canManagePromotions}
				/>
			</label>

			<label class="block text-sm" style="color: var(--text-muted);">
				Type
				<select
					bind:value={form.type}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
					disabled={!canManagePromotions}
				>
					<option value="PERCENT">Percent</option>
					<option value="FIXED">Fixed amount</option>
				</select>
			</label>

			<label class="block text-sm" style="color: var(--text-muted);">
				Value
				<input
					type="number"
					step="0.01"
					min="0"
					required
					bind:value={form.value}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
					disabled={!canManagePromotions}
				/>
			</label>

			<label class="block text-sm" style="color: var(--text-muted);">
				Minimum order value
				<input
					type="number"
					step="0.01"
					min="0"
					bind:value={form.minOrderValue}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
					disabled={!canManagePromotions}
				/>
			</label>

			<label class="block text-sm" style="color: var(--text-muted);">
				Usage cap (optional)
				<input
					type="number"
					min="1"
					bind:value={form.usageCap}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
					disabled={!canManagePromotions}
				/>
			</label>

			<label class="block text-sm" style="color: var(--text-muted);">
				Starts at (optional)
				<input
					type="datetime-local"
					bind:value={form.startsAt}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
					disabled={!canManagePromotions}
				/>
			</label>

			<label class="block text-sm" style="color: var(--text-muted);">
				Ends at (optional)
				<input
					type="datetime-local"
					bind:value={form.endsAt}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
					disabled={!canManagePromotions}
				/>
			</label>

			<div class="flex items-end gap-3">
				<label class="inline-flex items-center gap-2 text-sm" style="color: var(--text);">
					<input type="checkbox" bind:checked={form.singleUsePerUser} disabled={!canManagePromotions} />
					Single-use per user
				</label>
				<label class="inline-flex items-center gap-2 text-sm" style="color: var(--text);">
					<input type="checkbox" bind:checked={form.isActive} disabled={!canManagePromotions} />
					Active
				</label>
			</div>

			<div class="md:col-span-2">
				<p class="mb-2 text-sm" style="color: var(--text-muted);">Platform scope (optional)</p>
				<div class="grid grid-cols-2 gap-2 md:grid-cols-4">
					{#each platforms as platform}
						<label
							class="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs"
							style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
						>
							<input
								type="checkbox"
								checked={selectedPlatformIds.includes(platform.id)}
								onchange={() => togglePlatform(platform.id)}
								disabled={!canManagePromotions}
							/>
							<span>{platform.name}</span>
						</label>
					{/each}
				</div>
			</div>

			<div class="md:col-span-2">
				<button
					type="submit"
					class="rounded-full px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
					style="background: var(--btn-primary-gradient)"
					disabled={!canManagePromotions || loading}
				>
					{loading ? 'Saving...' : 'Create promo code'}
				</button>
			</div>
		</form>
	</section>

	<section class="rounded-lg p-6" style="background: var(--bg-elev-1); border: 1px solid var(--border);">
		<h2 class="text-lg font-semibold" style="color: var(--text)">Active & Past Promotions</h2>
		{#if promotions.length === 0}
			<p class="mt-3 text-sm" style="color: var(--text-muted);">No promotions created yet.</p>
		{:else}
			<div class="mt-4 space-y-3">
				{#each promotions as promo}
					<div class="rounded-lg p-4" style="border: 1px solid var(--border); background: var(--bg);">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<div>
								<p class="text-sm font-semibold" style="color: var(--text);">{promo.code}</p>
								<p class="text-xs" style="color: var(--text-muted);">
									{promo.type === 'PERCENT' ? `${promo.value}% off` : formatPrice(promo.value)}
									• Min order: {formatPrice(promo.minOrderValue)}
									• {promo.usageCount}{promo.usageCap ? ` / ${promo.usageCap}` : ''} uses
								</p>
								<p class="mt-1 text-xs" style="color: var(--text-muted);">
									Scope: {getPlatformNames(promo.platformIds || [])}
								</p>
								<p class="mt-1 text-xs" style="color: var(--text-dim);">
									Created: {formatDate(promo.createdAt)}
								</p>
							</div>
							<div class="flex items-center gap-2">
								<span
									class="rounded-full px-2 py-1 text-xs font-semibold"
									style={promo.isActive
										? 'background: var(--status-success-bg); color: var(--status-success); border: 1px solid var(--status-success-border);'
										: 'background: var(--bg-elev-2); color: var(--text-muted); border: 1px solid var(--border);'}
								>
									{promo.isActive ? 'Active' : 'Inactive'}
								</span>
								{#if canManagePromotions}
									<button
										type="button"
										class="rounded-full px-3 py-1 text-xs font-semibold"
										style="background: var(--surface); color: var(--text); border: 1px solid var(--border);"
										onclick={() => void togglePromotionStatus(promo.id, promo.isActive)}
									>
										{promo.isActive ? 'Disable' : 'Enable'}
									</button>
									<button
										type="button"
										class="rounded-full px-3 py-1 text-xs font-semibold"
										style="background: var(--status-error-bg); color: var(--status-error); border: 1px solid var(--status-error-border);"
										onclick={() => void deletePromotion(promo.id)}
									>
										Delete
									</button>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>
