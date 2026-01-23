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
				class="fixed inset-0 bg-black/50 transition-opacity"
				onclick={onClose}
				aria-label="create modal"
			></button>

			<!-- Modal content -->
			<div
				class="relative transform overflow-hidden rounded-lg text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg"
				style="background: var(--bg-elev-1);"
				in:fly={{ y: 200, duration: 300 }}
				out:fade={{ duration: 300 }}
			>
				<form onsubmit={onCreate}>
					<div class="px-4 pt-5 pb-4 sm:p-6 sm:pb-4" style="background: var(--bg-elev-1);">
						<div class="mb-4">
							<h3 class="text-lg font-semibold" style="color: var(--text);">Add New Platform</h3>
						</div>

						<div class="space-y-4">
							<!-- Name -->
							<div>
								<label for="name" class="block text-sm font-medium" style="color: var(--text);"
									>Platform Name *</label
								>
								<input
									id="name"
									type="text"
									required
									value={platformForm.name}
									oninput={(e) => onNameInput((e.target as HTMLInputElement).value)}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg-elev-1); color: var(--text);"
									placeholder="e.g., Instagram"
								/>
							</div>

							<!-- Slug -->
							<div>
								<label for="slug" class="block text-sm font-medium" style="color: var(--text);"
									>Slug *</label
								>
								<input
									id="slug"
									type="text"
									required
									value={platformForm.slug}
									oninput={(e) => onSlugInput((e.target as HTMLInputElement).value)}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg-elev-1); color: var(--text);"
									placeholder="e.g., instagram"
								/>
							</div>

							<!-- Description -->
							<div>
								<label
									for="description"
									class="block text-sm font-medium"
									style="color: var(--text);">Description</label
								>
								<textarea
									id="description"
									rows="3"
									value={platformForm.description}
									oninput={(e) => onDescriptionInput((e.target as HTMLTextAreaElement).value)}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg-elev-1); color: var(--text);"
									placeholder="Platform description..."
								></textarea>
							</div>

							<!-- Icon URL -->
							<div>
								<label for="icon" class="block text-sm font-medium" style="color: var(--text);">
									Platform Icon URL
									<span class="text-xs font-normal" style="color: var(--text-muted);"
										>(Optional)</span
									>
								</label>
								<input
									id="icon"
									type="url"
									value={platformForm.metadata.icon}
									oninput={(e) => onIconInput((e.target as HTMLInputElement).value)}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg-elev-1); color: var(--text);"
									placeholder="https://example.com/icon.png or /static/icons/platform.svg"
								/>
								<p class="mt-1 text-xs" style="color: var(--text-muted);">
									💡 <strong>Leave blank</strong> for auto icons (Instagram, TikTok, Facebook,
									Twitter).<br />
									<strong>For new platforms:</strong> Provide an icon URL or upload to
									<code class="rounded px-1" style="background: var(--surface);"
										>/static/icons/</code
									>
								</p>
								{#if platformForm.metadata.icon}
									<div class="mt-2 flex items-center gap-2">
										<span class="text-xs" style="color: var(--text-muted);">Preview:</span>
										<img
											src={platformForm.metadata.icon}
											alt="Icon preview"
											class="h-8 w-8 rounded"
											style="border: 1px solid var(--border);"
											onerror={(e) => {
												(e.target as HTMLImageElement).style.display = 'none';
											}}
										/>
									</div>
								{/if}
							</div>

							<!-- Color -->
							<div>
								<label for="color" class="block text-sm font-medium" style="color: var(--text);"
									>Brand Color</label
								>
								<input
									id="color"
									type="color"
									value={platformForm.metadata.color}
									oninput={(e) => onColorInput((e.target as HTMLInputElement).value)}
									class="mt-1 block h-10 w-full rounded-md py-2"
									style="border: 1px solid var(--border); background: var(--bg-elev-1);"
								/>
							</div>

							<!-- Website URL -->
							<div>
								<label for="website" class="block text-sm font-medium" style="color: var(--text);"
									>Website URL</label
								>
								<input
									id="website"
									type="url"
									value={platformForm.metadata.website_url}
									oninput={(e) => onWebsiteInput((e.target as HTMLInputElement).value)}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg-elev-1); color: var(--text);"
									placeholder="https://example.com"
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
							class="inline-flex w-full justify-center rounded-md px-3 py-2 text-sm font-semibold shadow-sm hover:opacity-90 disabled:opacity-50 sm:ml-3 sm:w-auto"
							style="background: var(--primary); color: #000;"
						>
							{loading ? 'Creating...' : 'Create Platform'}
						</button>
						<button
							type="button"
							onclick={onClose}
							class="mt-3 inline-flex w-full justify-center rounded-md px-3 py-2 text-sm font-semibold shadow-sm hover:opacity-90 sm:mt-0 sm:w-auto"
							style="background: var(--bg-elev-1); color: var(--text); border: 1px solid var(--border);"
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}
