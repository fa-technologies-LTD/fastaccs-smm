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
		onCreate: (e: Event) => void;
		onNameInput: (value: string) => void;
		onSlugInput: (value: string) => void;
		onDescriptionInput: (value: string) => void;
		onIconInput: (value: string) => void;
		onColorInput: (value: string) => void;
		onWebsiteInput: (value: string) => void;
	}

	let {
		open,
		platformForm,
		loading = false,
		onClose,
		onCreate,
		onNameInput,
		onSlugInput,
		onDescriptionInput,
		onIconInput,
		onColorInput,
		onWebsiteInput
	}: Props = $props();
</script>

{#if open}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
			<!-- Background overlay -->
			<button
				class="fixed inset-0 bg-black/20 transition-opacity"
				onclick={onClose}
				aria-label="create modal"
			></button>

			<!-- Modal content -->
			<div
				class="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg"
				in:fly={{ y: 200, duration: 300 }}
				out:fade={{ duration: 300 }}
			>
				<form onsubmit={onCreate}>
					<div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
						<div class="mb-4">
							<h3 class="text-lg font-semibold text-gray-900">Add New Platform</h3>
						</div>

						<div class="space-y-4">
							<!-- Name -->
							<div>
								<label for="name" class="block text-sm font-medium text-gray-700"
									>Platform Name *</label
								>
								<input
									id="name"
									type="text"
									required
									value={platformForm.name}
									oninput={(e) => onNameInput((e.target as HTMLInputElement).value)}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
									placeholder="e.g., Instagram"
								/>
							</div>

							<!-- Slug -->
							<div>
								<label for="slug" class="block text-sm font-medium text-gray-700">Slug *</label>
								<input
									id="slug"
									type="text"
									required
									value={platformForm.slug}
									oninput={(e) => onSlugInput((e.target as HTMLInputElement).value)}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
									placeholder="e.g., instagram"
								/>
							</div>

							<!-- Description -->
							<div>
								<label for="description" class="block text-sm font-medium text-gray-700"
									>Description</label
								>
								<textarea
									id="description"
									rows="3"
									value={platformForm.description}
									oninput={(e) => onDescriptionInput((e.target as HTMLTextAreaElement).value)}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
									placeholder="Platform description..."
								></textarea>
							</div>

							<!-- Icon URL -->
							<div>
								<label for="icon" class="block text-sm font-medium text-gray-700">
									Platform Icon URL
									<span class="text-xs font-normal text-gray-500">(Optional)</span>
								</label>
								<input
									id="icon"
									type="url"
									value={platformForm.metadata.icon}
									oninput={(e) => onIconInput((e.target as HTMLInputElement).value)}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
									placeholder="https://example.com/icon.png or /static/icons/platform.svg"
								/>
								<p class="mt-1 text-xs text-gray-500">
									💡 <strong>Leave blank</strong> for auto icons (Instagram, TikTok, Facebook,
									Twitter).<br />
									<strong>For new platforms:</strong> Provide an icon URL or upload to
									<code class="rounded bg-gray-100 px-1">/static/icons/</code>
								</p>
								{#if platformForm.metadata.icon}
									<div class="mt-2 flex items-center gap-2">
										<span class="text-xs text-gray-600">Preview:</span>
										<img
											src={platformForm.metadata.icon}
											alt="Icon preview"
											class="h-8 w-8 rounded border border-gray-200"
											onerror={(e) => {
												(e.target as HTMLImageElement).style.display = 'none';
											}}
										/>
									</div>
								{/if}
							</div>

							<!-- Color -->
							<div>
								<label for="color" class="block text-sm font-medium text-gray-700"
									>Brand Color</label
								>
								<input
									id="color"
									type="color"
									value={platformForm.metadata.color}
									oninput={(e) => onColorInput((e.target as HTMLInputElement).value)}
									class="mt-1 block h-10 w-full rounded-md border border-gray-300 py-2 focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<!-- Website URL -->
							<div>
								<label for="website" class="block text-sm font-medium text-gray-700"
									>Website URL</label
								>
								<input
									id="website"
									type="url"
									value={platformForm.metadata.website_url}
									oninput={(e) => onWebsiteInput((e.target as HTMLInputElement).value)}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
									placeholder="https://example.com"
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
							{loading ? 'Creating...' : 'Create Platform'}
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
