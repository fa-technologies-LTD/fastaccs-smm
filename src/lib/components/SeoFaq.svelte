<script lang="ts">
	import { HelpCircle } from '$lib/icons';
	import { faqJsonLd, type SeoFaqItem } from '$lib/helpers/platform-seo';

	let { heading, items }: { heading: string; items: SeoFaqItem[] } = $props();

	// Answers stay in the HTML (native <details>), so search engines read them even when collapsed.
	// JSON-LD must be raw script content; faqJsonLd escapes "<" so the data cannot break out.
	// The closing tag is split so it can't end this component's own <script> block.
	const jsonLdTag = $derived(
		'<script type="application/ld+json">' + faqJsonLd(items) + '</' + 'script>'
	);
</script>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html jsonLdTag}
</svelte:head>

{#if items.length > 0}
	<section class="pb-10 sm:pb-14" aria-labelledby="seo-faq-heading">
		<div class="mx-auto max-w-3xl px-4">
			<h2
				id="seo-faq-heading"
				class="mb-4 text-xl font-bold sm:mb-6 sm:text-2xl"
				style="color: var(--text);"
			>
				{heading}
			</h2>
			<div class="space-y-3">
				{#each items as item (item.question)}
					<details
						class="group overflow-hidden rounded-xl"
						style="background: var(--color-card); border: 1px solid var(--border);"
					>
						<summary
							class="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-semibold sm:p-5"
							style="color: var(--text);"
						>
							<span class="flex items-center">
								<HelpCircle class="mr-3 h-5 w-5 flex-shrink-0" style="color: var(--brand-blue);" />
								{item.question}
							</span>
							<svg
								class="h-5 w-5 flex-shrink-0 transition-transform group-open:rotate-180"
								style="color: var(--text-muted);"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								aria-hidden="true"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M19 9l-7 7-7-7"
								/>
							</svg>
						</summary>
						<p
							class="px-4 pb-4 text-sm leading-relaxed sm:px-5 sm:pb-5"
							style="color: var(--text-muted);"
						>
							{item.answer}
						</p>
					</details>
				{/each}
			</div>
		</div>
	</section>
{/if}
