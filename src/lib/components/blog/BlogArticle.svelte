<script lang="ts">
	import type { Snippet } from 'svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import BlogLike from '$lib/components/blog/BlogLike.svelte';

	interface Props {
		tags: string[];
		title: string;
		publishedAt: string;
		readTime: string;
		slug: string;
		children: Snippet;
	}

	let { tags, title, publishedAt, readTime, slug, children }: Props = $props();
</script>

<main class="min-h-screen" style="font-family: var(--font-body); color: var(--text);">
	<!-- Article Hero -->
	<header class="article-hero">
		<!-- Hex cluster decoration -->
		<div class="hex-cluster" aria-hidden="true">
			<div class="hex hex-a"></div>
			<div class="hex hex-b"></div>
			<div class="hex hex-c"></div>
			<div class="hex hex-d"></div>
		</div>

		<div class="hero-inner">
			<Breadcrumb items={[{ label: 'Blog', href: '/blog' }, { label: title, active: true }]} />

			<div class="hero-content">
				<div class="tags-row">
					{#each tags as tag}
						<span class="tag-pill">{tag}</span>
					{/each}
				</div>

				<h1 class="article-title">{title}</h1>

				<div class="meta-row">
					<span class="meta-dot" aria-hidden="true"></span>
					<span class="meta-text">Published {publishedAt}</span>
					<span class="meta-sep" aria-hidden="true">·</span>
					<span class="meta-text">{readTime}</span>
				</div>
			</div>
		</div>

		<div class="accent-line" aria-hidden="true"></div>
	</header>

	<!-- Body -->
	<div class="body-wrap">
		<div class="article-body">
			{@render children()}
			<BlogLike {slug} />
		</div>
	</div>
</main>

<style>
	/* ── Hero ── */
	.article-hero {
		position: relative;
		overflow: hidden;
		background: linear-gradient(135deg, #0c1228 0%, #071a0e 100%);
		border-bottom: 1px solid rgba(5, 212, 113, 0.15);
		padding: 2rem 0 2.75rem;
	}

	.hero-inner {
		position: relative;
		z-index: 1;
		max-width: 48rem;
		margin: 0 auto;
		padding: 0 1rem;
	}

	@media (min-width: 640px) {
		.hero-inner {
			padding: 0 1.5rem;
		}
	}

	@media (min-width: 1024px) {
		.hero-inner {
			padding: 0 2rem;
		}
	}

	.hero-content {
		margin-top: 1.5rem;
	}

	.tags-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1.125rem;
	}

	.tag-pill {
		display: inline-block;
		padding: 0.2rem 0.7rem;
		border-radius: 9999px;
		font-size: 0.6875rem;
		font-weight: 600;
		font-family: var(--font-head);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		background: rgba(5, 212, 113, 0.12);
		color: var(--fa-green-500);
		border: 1px solid rgba(5, 212, 113, 0.28);
	}

	.article-title {
		font-family: var(--font-head);
		font-size: clamp(1.625rem, 4vw, 2.375rem);
		font-weight: 700;
		letter-spacing: -0.025em;
		line-height: 1.2;
		color: #ffffff;
		margin-bottom: 1rem;
	}

	.meta-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.meta-dot {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 9999px;
		background: var(--fa-green-500);
		box-shadow: 0 0 6px rgba(5, 212, 113, 0.6);
		flex-shrink: 0;
	}

	.meta-text {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.44);
		font-family: var(--font-head);
	}

	.meta-sep {
		color: rgba(255, 255, 255, 0.2);
		font-size: 0.8rem;
	}

	.accent-line {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 2px;
		background: linear-gradient(
			90deg,
			transparent 0%,
			var(--fa-green-800) 10%,
			var(--fa-green-500) 50%,
			var(--fa-green-800) 90%,
			transparent 100%
		);
		opacity: 0.55;
	}

	/* ── Hex cluster ── */
	.hex-cluster {
		position: absolute;
		top: 0;
		right: 0;
		width: 200px;
		height: 200px;
		pointer-events: none;
		z-index: 0;
	}

	.hex {
		position: absolute;
		clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
	}

	.hex-a {
		width: 80px;
		height: 90px;
		top: 14px;
		right: 32px;
		background: rgba(5, 212, 113, 0.11);
	}
	.hex-b {
		width: 56px;
		height: 63px;
		top: 70px;
		right: 4px;
		background: rgba(5, 212, 113, 0.07);
	}
	.hex-c {
		width: 44px;
		height: 50px;
		top: 10px;
		right: 106px;
		background: rgba(5, 212, 113, 0.06);
	}
	.hex-d {
		width: 34px;
		height: 38px;
		top: 100px;
		right: 58px;
		background: rgba(5, 212, 113, 0.04);
	}

	/* ── Body ── */
	.body-wrap {
		padding: 2.75rem 1rem 5rem;
	}

	@media (min-width: 640px) {
		.body-wrap {
			padding: 2.75rem 1.5rem 5rem;
		}
	}

	@media (min-width: 1024px) {
		.body-wrap {
			padding: 2.75rem 2rem 5rem;
		}
	}

	.article-body {
		max-width: 48rem;
		margin: 0 auto;
	}

	/* ── Article typography (scoped via :global on wrapper) ── */
	.article-body :global(h2) {
		padding-left: 1rem;
		border-left: 3px solid var(--fa-green-500);
	}

	.article-body :global(li::marker) {
		color: var(--fa-green-500);
	}

	.article-body :global(ol > li::marker) {
		color: var(--fa-lime-700);
		font-weight: 700;
		font-family: var(--font-head);
	}

	.article-body :global(details[open]) {
		border-color: rgba(5, 212, 113, 0.28) !important;
	}

	.article-body :global(details > summary) {
		list-style: none;
	}

	.article-body :global(details > summary::-webkit-details-marker) {
		display: none;
	}

	/* Table header accent */
	.article-body :global(th) {
		background: rgba(5, 212, 113, 0.06);
	}
</style>
