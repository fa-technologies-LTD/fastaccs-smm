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
				class="fixed inset-0 bg-black/50 transition-opacity"
				onclick={onClose}
				onkeydown={(e) => e.key === 'Escape' && onClose()}
				role="button"
				tabindex="-1"
				aria-label="Close modal"
			></div>

			<!-- Modal content -->
			<div
				class="relative transform overflow-hidden rounded-lg text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg"
				style="background: var(--bg-elev-1);"
				in:fly={{ y: 200, duration: 300 }}
				out:fade={{ duration: 300 }}
			>
				<form onsubmit={onUpdate}>
					<div class="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
						<div class="mb-4">
							<h3 class="text-lg font-semibold" style="color: var(--text);">Edit Platform</h3>
						</div>

						<div class="space-y-4">
							<!-- Name -->
							<div>
								<label
									for="edit-name"
									class="block text-sm font-medium"
									style="color: var(--text);"
								>
									Platform Name *
								</label>
								<input
									id="edit-name"
									type="text"
									required
									value={platformForm.name}
									oninput={(e) => onNameInput((e.target as HTMLInputElement).value)}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								/>
							</div>

							<!-- Slug -->
							<div>
								<label for="edit-slug" class="block text-sm font-medium" style="color: var(--text);"
									>Slug *</label
								>
								<input
									id="edit-slug"
									type="text"
									required
									value={platformForm.slug}
									oninput={(e) => onSlugInput((e.target as HTMLInputElement).value)}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								/>
							</div>

							<!-- Description -->
							<div>
								<label
									for="edit-description"
									class="block text-sm font-medium"
									style="color: var(--text);"
								>
									Description
								</label>
								<textarea
									id="edit-description"
									name="description"
									rows="3"
									value={platformForm.description}
									oninput={(e) => onDescriptionInput((e.target as HTMLTextAreaElement).value)}
									class="mt-1 block w-full rounded-md px-4 py-2 shadow-sm"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								></textarea>
							</div>

							<!-- Color -->
							<div>
								<label
									for="edit-color"
									class="block text-sm font-medium"
									style="color: var(--text);"
								>
									Brand Color
								</label>
								<input
									id="edit-color"
									type="color"
									value={platformForm.metadata.color}
									oninput={(e) => onColorInput((e.target as HTMLInputElement).value)}
									class="mt-1 block h-10 w-full rounded-md shadow-sm"
									style="border: 1px solid var(--border);"
								/>
							</div>

							<!-- Website URL -->
							<div>
								<label
									for="edit-website"
									class="block text-sm font-medium"
									style="color: var(--text);"
								>
									Website URL
								</label>
								<input
									id="edit-website"
									type="url"
									value={platformForm.metadata.website_url}
									oninput={(e) => onWebsiteInput((e.target as HTMLInputElement).value)}
									class="mt-1 block w-full rounded-md shadow-sm"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								/>
							</div>
						</div>
					</div>

					<div
						class="px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6"
						style="background: var(--surface);"
					>
						<button
							type="submit"
							disabled={loading}
							class="inline-flex w-full justify-center rounded-full px-3 py-2 text-sm font-semibold shadow-sm disabled:opacity-50 sm:ml-3 sm:w-auto"
							style="background: var(--primary); color: #000;"
						>
							{loading ? 'Updating...' : 'Update Platform'}
						</button>
						<button
							type="button"
							onclick={onClose}
							class="mt-3 inline-flex w-full justify-center rounded-full px-3 py-2 text-sm font-semibold shadow-sm sm:mt-0 sm:w-auto"
							style="border: 1px solid var(--border); color: var(--text); background: transparent;"
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}
