<script lang="ts">
	import { Plus, Edit, Trash2, Archive, Zap, RefreshCcw } from '$lib/icons';
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
				showSuccess('Boosting service created', `${serviceForm.name} is now live on the Boosting Services page`);
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
				showError(nextActive ? 'Failed to restore service' : 'Failed to archive service', result.error);
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
				Boosting Services
			</h1>
			<p class="mt-1 text-sm" style="color: var(--text-muted);">
				Manage followers/likes/views services. Customers pick one, paste a link, and pay through
				checkout.
			</p>
		</div>
		<button
			onclick={openCreateModal}
			class="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
			style="background: var(--primary); color: #000;"
		>
			<Plus size={16} />
			Add Service
		</button>
	</div>

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
					<th class="px-4 py-3 text-left font-medium" style="color: var(--text-muted);">Platform</th>
					<th class="px-4 py-3 text-left font-medium" style="color: var(--text-muted);">Action</th>
					<th class="px-4 py-3 text-left font-medium" style="color: var(--text-muted);">Min / Step</th>
					<th class="px-4 py-3 text-left font-medium" style="color: var(--text-muted);">Price/Step</th>
					<th class="px-4 py-3 text-left font-medium" style="color: var(--text-muted);">Refill</th>
					<th class="px-4 py-3 text-left font-medium" style="color: var(--text-muted);">Status</th>
					<th class="px-4 py-3 text-right font-medium" style="color: var(--text-muted);">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each sortedVisibleServices as service (service.id)}
					{@const config = getBoostingServiceConfig(service.metadata)}
					<tr style="border-top: 1px solid var(--border);">
						<td class="px-4 py-3" style="color: var(--text);">
							<div class="font-medium">{service.name}</div>
							<div class="text-xs" style="color: var(--text-muted);">{service.description || ''}</div>
						</td>
						<td class="px-4 py-3" style="color: var(--text);">{BOOSTING_PLATFORM_LABELS[config.platform]}</td>
						<td class="px-4 py-3" style="color: var(--text);">{BOOSTING_ACTION_LABELS[config.actionType]}</td>
						<td class="px-4 py-3" style="color: var(--text);">
							{config.minQuantity.toLocaleString()} / {config.stepQuantity.toLocaleString()}
						</td>
						<td class="px-4 py-3" style="color: var(--text);">₦{config.pricePerStep.toLocaleString()}</td>
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
									aria-label={isServiceActive(service) ? `Archive ${service.name}` : `Restore ${service.name}`}
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
