<script lang="ts">
	import { fade, fly } from 'svelte/transition';

	interface Props {
		open: boolean;
		platformForm: {
			name: string;
			slug: string;
			description: string;
			metadata: {
				icon: string;
				color: string;
				logo_url: string;
				website_url: string;
				api_info: {
					base_url: string;
					rate_limits: Record<string, number>;
					auth_methods: string[];
				};
				platform_info: {
					content_types: string[];
					demographics: string[];
				};
			};
		};
		loading?: boolean;
		onClose: () => void;
		onUpdate: (e: Event) => void;
		onNameInput: (value: string) => void;
		onSlugInput: (value: string) => void;
		onDescriptionInput: (value: string) => void;
		onColorInput: (value: string) => void;
		onWebsiteInput: (value: string) => void;
	}

	let {
		open,
		platformForm,
		loading = false,
		onClose,
		onUpdate,
		onNameInput,
		onSlugInput,
		onDescriptionInput,
		onColorInput,
		onWebsiteInput
	}: Props = $props();
</script>

{#if open}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
			<!-- Background overlay -->
			<div
				class="bg-opacity-75 fixed inset-0 bg-gray-500 transition-opacity"
				onclick={onClose}
				onkeydown={(e) => e.key === 'Escape' && onClose()}
				role="button"
				tabindex="-1"
				aria-label="Close modal"
			></div>

			<!-- Modal content -->
			<div
				class="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg"
				in:fly={{ y: 200, duration: 300 }}
				out:fade={{ duration: 300 }}
			>
				<form onsubmit={onUpdate}>
					<div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
						<div class="mb-4">
							<h3 class="text-lg font-semibold text-gray-900">Edit Platform</h3>
						</div>

						<div class="space-y-4">
							<!-- Name -->
							<div>
								<label for="edit-name" class="block text-sm font-medium text-gray-700"
									>Platform Name *</label
								>
								<input
									id="edit-name"
									type="text"
									required
									value={platformForm.name}
									oninput={(e) => onNameInput((e.target as HTMLInputElement).value)}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<!-- Slug -->
							<div>
								<label for="edit-slug" class="block text-sm font-medium text-gray-700">Slug *</label
								>
								<input
									id="edit-slug"
									type="text"
									required
									value={platformForm.slug}
									oninput={(e) => onSlugInput((e.target as HTMLInputElement).value)}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<!-- Description -->
							<div>
								<label for="edit-description" class="block text-sm font-medium text-gray-700"
									>Description</label
								>
								<textarea
									id="edit-description"
									name="description"
									rows="3"
									value={platformForm.description}
									oninput={(e) => onDescriptionInput((e.target as HTMLTextAreaElement).value)}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								></textarea>
							</div>

							<!-- Color -->
							<div>
								<label for="edit-color" class="block text-sm font-medium text-gray-700"
									>Brand Color</label
								>
								<input
									id="edit-color"
									type="color"
									value={platformForm.metadata.color}
									oninput={(e) => onColorInput((e.target as HTMLInputElement).value)}
									class="mt-1 block h-10 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<!-- Website URL -->
							<div>
								<label for="edit-website" class="block text-sm font-medium text-gray-700"
									>Website URL</label
								>
								<input
									id="edit-website"
									type="url"
									value={platformForm.metadata.website_url}
									oninput={(e) => onWebsiteInput((e.target as HTMLInputElement).value)}
									class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
						</div>
					</div>

					<div class="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
						<button
							type="submit"
							disabled={loading}
							class="inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 sm:ml-3 sm:w-auto"
						>
							{loading ? 'Updating...' : 'Update Platform'}
						</button>
						<button
							type="button"
							onclick={onClose}
							class="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 sm:mt-0 sm:w-auto"
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}
