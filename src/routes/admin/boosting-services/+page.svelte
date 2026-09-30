<script lang="ts">
	import {
		Plus,
		Edit,
		Trash2,
		Archive,
		Zap,
		RefreshCcw,
		AlertTriangle,
		ChevronDown,
		ChevronUp,
		Layers,
		ShieldCheck,
		Wallet,
		Target
	} from '$lib/icons';
	import { createCategory, updateCategory, deleteCategory } from '$lib/services/categories';
	import { showSuccess, showError } from '$lib/stores/toasts';
	import type { CategoryMetadata, CategoryInsert, CategoryUpdate } from '$lib/services/categories';
	import {
		applyBoostingServiceConfigSanitization,
		getBoostingServiceConfig,
		BOOSTING_PLATFORM_LABELS,
		BOOSTING_ACTION_LABELS
	} from '$lib/helpers/boosting-service-config';
	import type { BoostingPlatform, BoostingActionType } from '$lib/helpers/social-link-validator';
	import type { PageData } from './$types';
	import BoostingServiceCreateModal from '$lib/components/modals/BoostingServiceCreateModal.svelte';
	import BoostingServiceEditModal from '$lib/components/modals/BoostingServiceEditModal.svelte';
	import BoostingServiceDeleteModal from '$lib/components/modals/BoostingServiceDeleteModal.svelte';

	interface BoostingServiceFormMetadata {
		boosting_platform: BoostingPlatform;
		boosting_action_type: BoostingActionType;
		boosting_min_quantity: number;
		boosting_step_quantity: number;
		boosting_price_per_step: number;
		boosting_refill_available: boolean;
		boosting_refill_days: number;
	}

	interface Props {
		data: PageData;
	}

	type SupplierId = 'smm_raja' | 'bulk_follows';
	interface SupplierSummary {
		id: SupplierId;
		label: string;
		configured: boolean;
		status: 'ready' | 'not_configured' | 'unavailable';
		fetchedAt: string | null;
		durationMs: number | null;
		balance: number | null;
		currency: string | null;
		totalServices: number;
		readyForReview: number;
		needsClassification: number;
		quarantined: number;
		error: string | null;
	}
	interface CoverageCell {
		platform: string;
		outcome: string;
		total: number;
		readyForReview: number;
		byProvider: Record<SupplierId, number>;
	}
	interface SupplierDiscovery {
		fetchedAt: string;
		providers: SupplierSummary[];
		coverage: CoverageCell[];
	}

	let { data }: Props = $props();
	let services = $state<CategoryMetadata[]>(data.services);
	let loading = $state(false);
	let showCreateModal = $state(false);
	let showEditModal = $state(false);
	let showDeleteModal = $state(false);
	let selectedService = $state<CategoryMetadata | null>(null);
	let serviceToDelete = $state<CategoryMetadata | null>(null);
	let busyServiceAction = $state<string | null>(null);
	let statusFilter = $state<'active' | 'archived' | 'all'>('active');
	let supplierDiscovery = $state<SupplierDiscovery | null>(null);
	let supplierLoading = $state(false);
	let supplierSyncing = $state(false);
	let supplierError = $state('');
	let showSupplierCoverage = $state(true);

	const COVERAGE_PLATFORMS = [
		['instagram', 'Instagram'],
		['tiktok', 'TikTok'],
		['youtube', 'YouTube'],
		['facebook', 'Facebook'],
		['x', 'X'],
		['spotify', 'Spotify'],
		['telegram', 'Telegram']
	] as const;
	const OUTCOME_ORDER = [
		'followers',
		'subscribers',
		'members',
		'views',
		'streams',
		'monthly_listeners',
		'likes',
		'reactions',
		'shares',
		'reposts',
		'comments',
		'saves',
		'watch_time'
	];

	if (data.error) {
		showError('Failed to load boosting services', data.error);
	}

	function isServiceActive(service: CategoryMetadata): boolean {
		return service.isActive !== false;
	}

	const activeCount = $derived(services.filter(isServiceActive).length);
	const archivedCount = $derived(services.filter((s) => !isServiceActive(s)).length);
	const visibleServices = $derived.by(() => {
		if (statusFilter === 'archived') return services.filter((s) => !isServiceActive(s));
		if (statusFilter === 'all') return services;
		return services.filter(isServiceActive);
	});
	const sortedVisibleServices = $derived.by(() =>
		[...visibleServices].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
	);
	const coverageRows = $derived(
		COVERAGE_PLATFORMS.map(([id, label]) => ({
			id,
			label,
			cells: (supplierDiscovery?.coverage || [])
				.filter((cell) => cell.platform === id)
				.sort(
					(left, right) =>
						OUTCOME_ORDER.indexOf(left.outcome) - OUTCOME_ORDER.indexOf(right.outcome)
				)
		})).filter((row) => row.cells.length > 0)
	);

	function outcomeLabel(value: string): string {
		return value
			.split('_')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	function providerCoverageLabel(cell: CoverageCell): string {
		const sources = Object.values(cell.byProvider).filter((count) => count > 0).length;
		return sources === 2 ? 'Both' : '1 source';
	}

	function formatSupplierBalance(provider: SupplierSummary): string {
		if (provider.balance === null || !provider.currency) return 'Balance unavailable';
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: provider.currency,
			maximumFractionDigits: 2
		}).format(provider.balance);
	}

	function formatDiscoveryTime(value: string): string {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return new Intl.DateTimeFormat('en-NG', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		}).format(date);
	}

	async function loadSupplierDiscovery() {
		if (supplierLoading) return;
		supplierLoading = true;
		supplierError = '';
		try {
			const response = await fetch('/api/admin/boosting-suppliers/discovery');
			const payload = await response.json();
			if (!response.ok || !payload?.success) {
				throw new Error(payload?.error || 'Supplier coverage could not be loaded.');
			}
			supplierDiscovery = payload.data as SupplierDiscovery;
			showSupplierCoverage = true;
		} catch (error) {
			supplierError =
				error instanceof Error ? error.message : 'Supplier coverage could not be loaded.';
			showError('Could not check supplier coverage', supplierError);
		} finally {
			supplierLoading = false;
		}
	}

	async function syncSupplierCatalogues() {
		if (supplierSyncing || supplierLoading) return;
		supplierSyncing = true;
		try {
			const response = await fetch('/api/admin/boosting-suppliers/sync', { method: 'POST' });
			const payload = await response.json();
			if (!response.ok || !payload?.success) {
				throw new Error(payload?.error || 'Supplier catalogues could not be saved.');
			}
			const seen = (payload.data?.results || []).reduce(
				(total: number, result: { servicesSeen?: number }) =>
					total + Number(result.servicesSeen || 0),
				0
			);
			showSuccess(
				'Supplier snapshot saved',
				`${seen.toLocaleString()} services are ready for internal review. No orders were submitted.`
			);
		} catch (error) {
			showError(
				'Could not save supplier snapshot',
				error instanceof Error ? error.message : 'Please try again.'
			);
		} finally {
			supplierSyncing = false;
		}
	}

	function defaultMetadata(): BoostingServiceFormMetadata {
		return {
			boosting_platform: 'instagram',
			boosting_action_type: 'followers',
			boosting_min_quantity: 500,
			boosting_step_quantity: 500,
			boosting_price_per_step: 0,
			boosting_refill_available: false,
			boosting_refill_days: 30
		};
	}

	let serviceForm = $state({
		name: '',
		slug: '',
		description: '',
		metadata: defaultMetadata()
	});

	const generateSlug = (name: string) =>
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');

	$effect(() => {
		if (serviceForm.name && !serviceForm.slug) {
			serviceForm.slug = generateSlug(serviceForm.name);
		}
	});

	function resetForm() {
		serviceForm = {
			name: '',
			slug: '',
			description: '',
			metadata: defaultMetadata()
		};
	}

	function openCreateModal() {
		resetForm();
		showCreateModal = true;
	}

	function openEditModal(service: CategoryMetadata) {
		selectedService = service;
		const config = getBoostingServiceConfig(service.metadata);
		serviceForm = {
			name: String(service.name || ''),
			slug: String(service.slug || ''),
			description: String(service.description || ''),
			metadata: {
				boosting_platform: config.platform,
				boosting_action_type: config.actionType,
				boosting_min_quantity: config.minQuantity,
				boosting_step_quantity: config.stepQuantity,
				boosting_price_per_step: config.pricePerStep,
				boosting_refill_available: config.refillAvailable,
				boosting_refill_days: config.refillDays ?? 30
			}
		};
		showEditModal = true;
	}

	async function handleCreate() {
		loading = true;
		try {
			const cleanedMetadata = applyBoostingServiceConfigSanitization(serviceForm.metadata);
			const newService: CategoryInsert = {
				name: serviceForm.name,
				slug: serviceForm.slug,
				description: serviceForm.description || null,
				categoryType: 'boosting_service',
				metadata: cleanedMetadata,
				isActive: true,
				sortOrder: services.length + 1
			};

			const result = await createCategory(newService);
			if (result.error) {
				showError('Failed to create boosting service', result.error);
			} else {
				services = [...services, result.data!];
				showCreateModal = false;
				showSuccess(
					'Boosting service created',
					`${serviceForm.name} is now live on the Boosting Services page`
				);
				resetForm();
			}
		} catch (error) {
			console.error('Failed to create boosting service:', error);
			showError('Failed to create boosting service', 'An unexpected error occurred');
		} finally {
			loading = false;
		}
	}

	async function handleUpdate() {
		if (!selectedService) return;

		loading = true;
		try {
			const cleanedMetadata = applyBoostingServiceConfigSanitization(serviceForm.metadata);
			const updates: CategoryUpdate = {
				name: serviceForm.name,
				slug: serviceForm.slug,
				description: serviceForm.description || null,
				metadata: cleanedMetadata
			};

			const result = await updateCategory(selectedService.id as string, updates);
			if (result.error) {
				showError('Failed to update boosting service', result.error);
			} else {
				services = services.map((s) => (s.id === selectedService!.id ? result.data! : s));
				showEditModal = false;
				showSuccess('Boosting service updated', `${serviceForm.name} has been updated`);
				selectedService = null;
			}
		} catch (error) {
			console.error('Failed to update boosting service:', error);
			showError('Failed to update boosting service', 'An unexpected error occurred');
		} finally {
			loading = false;
		}
	}

	async function toggleActive(service: CategoryMetadata): Promise<void> {
		const serviceId = String(service.id || '');
		if (!serviceId) return;

		const nextActive = !isServiceActive(service);
		busyServiceAction = `toggle:${serviceId}`;
		try {
			const result = await updateCategory(serviceId, { isActive: nextActive });
			if (result.error) {
				showError(
					nextActive ? 'Failed to restore service' : 'Failed to archive service',
					result.error
				);
			} else {
				services = services.map((s) => (s.id === serviceId ? result.data! : s));
				showSuccess(
					nextActive ? 'Service restored' : 'Service archived',
					nextActive
						? `${service.name} is visible to customers again`
						: `${service.name} is hidden from customers`
				);
			}
		} catch (error) {
			console.error('Failed to toggle boosting service status:', error);
			showError('Action failed', 'An unexpected error occurred');
		} finally {
			busyServiceAction = null;
		}
	}

	function openDeleteModal(service: CategoryMetadata) {
		serviceToDelete = service;
		showDeleteModal = true;
	}

	function closeDeleteModal() {
		showDeleteModal = false;
		serviceToDelete = null;
	}

	async function confirmDelete() {
		if (!serviceToDelete) return;

		loading = true;
		try {
			const result = await deleteCategory(serviceToDelete.id as string);
			if (result.error) {
				showError('Failed to delete boosting service', result.error);
			} else {
				services = services.filter((s) => s.id !== serviceToDelete!.id);
				showSuccess('Boosting service deleted', `${serviceToDelete.name} has been removed`);
				closeDeleteModal();
			}
		} catch (error) {
			console.error('Failed to delete boosting service:', error);
			showError('Failed to delete boosting service', 'An unexpected error occurred');
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Boosting Services | Admin</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h1 class="flex items-center gap-2 text-2xl font-bold" style="color: var(--text);">
				<Zap class="h-6 w-6" style="color: var(--primary);" />
				Boosting catalogue
			</h1>
			<p class="mt-1 text-sm" style="color: var(--text-muted);">
				Shape simple customer offers while keeping supplier complexity behind the scenes.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<a
				href="/admin/boosting-mappings"
				class="flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold"
				style="border-color: var(--border); color: var(--text); background: var(--bg-elev-1);"
			>
				<Target size={16} />
				Map supplier routes
			</a>
			<button
				onclick={openCreateModal}
				class="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
				style="background: var(--primary); color: #000;"
			>
				<Plus size={16} />
				Add customer offer
			</button>
		</div>
	</div>

	<section
		class="overflow-hidden rounded-2xl"
		style="border: 1px solid var(--border); background: color-mix(in srgb, var(--surface) 72%, transparent);"
	>
		<div class="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
			<div class="flex min-w-0 items-start gap-3">
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
					style="background: rgba(139, 92, 246, 0.13); color: #a78bfa;"
				>
					<Layers size={20} />
				</div>
				<div class="min-w-0">
					<h2 class="font-semibold" style="color: var(--text);">Hidden supplier coverage</h2>
					<p class="mt-0.5 max-w-2xl text-sm" style="color: var(--text-muted);">
						Read-only catalogue check. It never submits an order or makes a service customer-facing.
					</p>
				</div>
			</div>
			<div class="flex flex-wrap gap-2">
				{#if supplierDiscovery}
					<button
						onclick={syncSupplierCatalogues}
						disabled={supplierSyncing || supplierLoading}
						class="flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold disabled:opacity-60"
						style="border-color: var(--border); color: var(--text); background: var(--bg-elev-1);"
					>
						<ShieldCheck size={15} />
						{supplierSyncing ? 'Saving…' : 'Save for review'}
					</button>
				{/if}
				<button
					onclick={loadSupplierDiscovery}
					disabled={supplierLoading || supplierSyncing}
					class="flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-60"
					style="background: var(--primary); color: #00130a;"
				>
					<RefreshCcw size={15} class={supplierLoading ? 'animate-spin' : ''} />
					{supplierLoading
						? 'Checking both…'
						: supplierDiscovery
							? 'Check again'
							: 'Check both suppliers'}
				</button>
			</div>
		</div>

		{#if supplierError}
			<div
				class="mx-4 mb-4 flex items-start gap-2 rounded-xl p-3 text-sm sm:mx-5"
				style="background: rgba(239, 68, 68, 0.09); color: #fca5a5;"
			>
				<AlertTriangle size={17} class="mt-0.5 shrink-0" />
				<span>{supplierError}</span>
			</div>
		{/if}

		{#if supplierDiscovery}
			<div class="grid gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-5 sm:pb-5">
				{#each supplierDiscovery.providers as provider (provider.id)}
					<article
						class="rounded-xl p-4"
						style="border: 1px solid var(--border); background: rgba(4, 12, 12, 0.5);"
					>
						<div class="flex items-start justify-between gap-3">
							<div>
								<div class="flex items-center gap-2 font-semibold" style="color: var(--text);">
									{#if provider.status === 'ready'}
										<ShieldCheck size={17} style="color: var(--primary);" />
									{:else}
										<AlertTriangle size={17} style="color: #f59e0b;" />
									{/if}
									{provider.label}
								</div>
								<p class="mt-1 flex items-center gap-1.5 text-xs" style="color: var(--text-muted);">
									<Wallet size={14} />
									{formatSupplierBalance(provider)}
								</p>
							</div>
							<span
								class="rounded-full px-2 py-1 text-[11px] font-semibold"
								style={provider.status === 'ready'
									? 'background: rgba(5, 212, 113, 0.12); color: var(--primary);'
									: 'background: rgba(245, 158, 11, 0.12); color: #fbbf24;'}
							>
								{provider.status === 'ready'
									? 'Connected'
									: provider.status === 'not_configured'
										? 'Not configured'
										: 'Unavailable'}
							</span>
						</div>
						{#if provider.status === 'ready'}
							<div class="mt-4 grid grid-cols-3 gap-2 text-center">
								<div class="rounded-lg p-2" style="background: rgba(255,255,255,0.025);">
									<div class="text-lg font-bold" style="color: var(--text);">
										{provider.totalServices.toLocaleString()}
									</div>
									<div
										class="text-[10px] tracking-wide uppercase"
										style="color: var(--text-muted);"
									>
										Found
									</div>
								</div>
								<div class="rounded-lg p-2" style="background: rgba(5,212,113,0.05);">
									<div class="text-lg font-bold" style="color: var(--primary);">
										{provider.readyForReview.toLocaleString()}
									</div>
									<div
										class="text-[10px] tracking-wide uppercase"
										style="color: var(--text-muted);"
									>
										Reviewable
									</div>
								</div>
								<div class="rounded-lg p-2" style="background: rgba(245,158,11,0.05);">
									<div class="text-lg font-bold" style="color: #fbbf24;">
										{(provider.needsClassification + provider.quarantined).toLocaleString()}
									</div>
									<div
										class="text-[10px] tracking-wide uppercase"
										style="color: var(--text-muted);"
									>
										Needs work
									</div>
								</div>
							</div>
						{:else if provider.error}
							<p class="mt-3 text-xs" style="color: #fca5a5;">{provider.error}</p>
						{/if}
					</article>
				{/each}
			</div>

			<div style="border-top: 1px solid var(--border);">
				<button
					onclick={() => (showSupplierCoverage = !showSupplierCoverage)}
					class="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-sm font-semibold sm:px-5"
					style="color: var(--text);"
					aria-expanded={showSupplierCoverage}
				>
					<span>
						Coverage by platform
						<span class="ml-2 font-normal" style="color: var(--text-muted);">
							Checked {formatDiscoveryTime(supplierDiscovery.fetchedAt)}
						</span>
					</span>
					{#if showSupplierCoverage}<ChevronUp size={17} />{:else}<ChevronDown size={17} />{/if}
				</button>
				{#if showSupplierCoverage}
					<div class="grid gap-2 px-4 pb-4 sm:px-5 sm:pb-5">
						{#each coverageRows as row (row.id)}
							<div
								class="grid gap-2 rounded-xl p-3 sm:grid-cols-[110px_1fr] sm:items-start"
								style="background: rgba(255,255,255,0.025);"
							>
								<div class="text-sm font-semibold" style="color: var(--text);">{row.label}</div>
								<div class="flex flex-wrap gap-1.5">
									{#each row.cells as cell (`${row.id}-${cell.outcome}`)}
										<span
											class="rounded-full px-2.5 py-1 text-xs"
											style="border: 1px solid var(--border); color: var(--text-muted); background: rgba(0,0,0,0.12);"
										>
											{outcomeLabel(cell.outcome)}
											<strong class="ml-1" style="color: var(--text);"
												>{cell.total.toLocaleString()}</strong
											>
											<span
												class="ml-1"
												style={providerCoverageLabel(cell) === 'Both'
													? 'color: var(--primary);'
													: 'color: #fbbf24;'}
											>
												· {providerCoverageLabel(cell)}
											</span>
										</span>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</section>

	<div class="flex gap-2">
		{#each [['active', `Active (${activeCount})`], ['archived', `Archived (${archivedCount})`], ['all', 'All']] as [value, label]}
			<button
				onclick={() => (statusFilter = value as typeof statusFilter)}
				class="rounded-full px-3 py-1.5 text-sm font-medium"
				style={statusFilter === value
					? 'background: var(--primary); color: #000;'
					: 'background: var(--surface); color: var(--text-muted); border: 1px solid var(--border);'}
			>
				{label}
			</button>
		{/each}
	</div>

	<div class="overflow-hidden rounded-lg" style="border: 1px solid var(--border);">
		<table class="w-full text-sm">
			<thead style="background: var(--surface);">
				<tr>
					<th class="px-4 py-3 text-left font-medium" style="color: var(--text-muted);">Service</th>
					<th class="px-4 py-3 text-left font-medium" style="color: var(--text-muted);">Platform</th
					>
					<th class="px-4 py-3 text-left font-medium" style="color: var(--text-muted);">Action</th>
					<th class="px-4 py-3 text-left font-medium" style="color: var(--text-muted);"
						>Min / Step</th
					>
					<th class="px-4 py-3 text-left font-medium" style="color: var(--text-muted);"
						>Price/Step</th
					>
					<th class="px-4 py-3 text-left font-medium" style="color: var(--text-muted);">Refill</th>
					<th class="px-4 py-3 text-left font-medium" style="color: var(--text-muted);">Status</th>
					<th class="px-4 py-3 text-right font-medium" style="color: var(--text-muted);">Actions</th
					>
				</tr>
			</thead>
			<tbody>
				{#each sortedVisibleServices as service (service.id)}
					{@const config = getBoostingServiceConfig(service.metadata)}
					<tr style="border-top: 1px solid var(--border);">
						<td class="px-4 py-3" style="color: var(--text);">
							<div class="font-medium">{service.name}</div>
							<div class="text-xs" style="color: var(--text-muted);">
								{service.description || ''}
							</div>
						</td>
						<td class="px-4 py-3" style="color: var(--text);"
							>{BOOSTING_PLATFORM_LABELS[config.platform]}</td
						>
						<td class="px-4 py-3" style="color: var(--text);"
							>{BOOSTING_ACTION_LABELS[config.actionType]}</td
						>
						<td class="px-4 py-3" style="color: var(--text);">
							{config.minQuantity.toLocaleString()} / {config.stepQuantity.toLocaleString()}
						</td>
						<td class="px-4 py-3" style="color: var(--text);">
							{#if config.pricePerStep <= 0}
								<span
									class="rounded-full px-2 py-0.5 text-xs font-medium"
									style="background: rgba(234,179,8,0.15); color: #eab308;"
								>
									Coming soon
								</span>
							{:else}
								₦{config.pricePerStep.toLocaleString()}
							{/if}
						</td>
						<td class="px-4 py-3" style="color: var(--text);">
							{config.refillAvailable ? `${config.refillDays}d` : '—'}
						</td>
						<td class="px-4 py-3">
							<span
								class="rounded-full px-2 py-0.5 text-xs font-medium"
								style={isServiceActive(service)
									? 'background: rgba(5,212,113,0.15); color: var(--primary);'
									: 'background: rgba(239,68,68,0.12); color: #ef4444;'}
							>
								{isServiceActive(service) ? 'Active' : 'Archived'}
							</span>
						</td>
						<td class="px-4 py-3 text-right">
							<div class="flex justify-end gap-2">
								<button
									onclick={() => openEditModal(service)}
									class="rounded-full p-1.5"
									style="background: var(--surface); color: var(--text);"
									aria-label={`Edit ${service.name}`}
								>
									<Edit size={14} />
								</button>
								<button
									onclick={() => toggleActive(service)}
									disabled={busyServiceAction === `toggle:${service.id}`}
									class="rounded-full p-1.5 disabled:opacity-50"
									style="background: var(--surface); color: var(--text);"
									aria-label={isServiceActive(service)
										? `Archive ${service.name}`
										: `Restore ${service.name}`}
								>
									{#if isServiceActive(service)}
										<Archive size={14} />
									{:else}
										<RefreshCcw size={14} />
									{/if}
								</button>
								<button
									onclick={() => openDeleteModal(service)}
									class="rounded-full p-1.5 text-red-600"
									style="background: var(--surface);"
									aria-label={`Delete ${service.name}`}
								>
									<Trash2 size={14} />
								</button>
							</div>
						</td>
					</tr>
				{/each}
				{#if sortedVisibleServices.length === 0}
					<tr>
						<td colspan="8" class="px-4 py-8 text-center" style="color: var(--text-muted);">
							No boosting services {statusFilter === 'all' ? '' : statusFilter} yet.
						</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>

<BoostingServiceCreateModal
	open={showCreateModal}
	bind:serviceForm
	{loading}
	onClose={() => (showCreateModal = false)}
	onCreate={handleCreate}
/>

<BoostingServiceEditModal
	open={showEditModal}
	bind:serviceForm
	{loading}
	onClose={() => (showEditModal = false)}
	onUpdate={handleUpdate}
/>

<BoostingServiceDeleteModal
	open={showDeleteModal}
	service={serviceToDelete}
	{loading}
	onClose={closeDeleteModal}
	onConfirm={confirmDelete}
/>
