<script lang="ts">
	import { blogPosts } from '$lib/blog/posts';

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>FastAccs Blog — Guides for Buying Social Media Accounts</title>
	<meta
		name="description"
		content="Practical guides on buying aged Instagram, X, TikTok and Facebook accounts safely — including warm-up tips, safety checklists, and what to look for before you pay."
	/>
</svelte:head>

<main class="min-h-screen" style="font-family: var(--font-body); color: var(--text);">
	<!-- Blog Hero -->
	<header class="blog-hero">
		<!-- Decorative hex cluster -->
		<div class="hex-bg" aria-hidden="true">
			<div class="hd hd-1"></div>
			<div class="hd hd-2"></div>
			<div class="hd hd-3"></div>
			<div class="hd hd-4"></div>
			<div class="hd hd-5"></div>
			<div class="hd hd-6"></div>
		</div>

		<div class="hero-inner">
			<div class="hero-label">
				<span class="hero-dot" aria-hidden="true"></span>
				FastAccs Blog
			</div>

			<h1 class="hero-title">
				Practical Guides for<br class="sm-br" /> Social Media Account Buyers
			</h1>

			<p class="hero-sub">
				Written by the team that sells them. Honest, detailed, and free to read.
			</p>

			<p class="hero-count">{blogPosts.length} articles published</p>
		</div>

		<div class="hero-line" aria-hidden="true"></div>
	</header>

	<!-- Post grid -->
	<section class="posts-section">
		<div class="posts-inner">
			<div class="posts-grid">
				{#each blogPosts as post}
					<a href="/blog/{post.slug}" class="post-card">
						<div class="card-accent"></div>

						<div class="card-body">
							<div class="card-tags">
								{#each post.tags.slice(0, 2) as tag}
									<span class="card-tag">{tag}</span>
								{/each}
							</div>

							<h2 class="card-title">{post.title}</h2>

							<p class="card-excerpt">{post.excerpt}</p>
						</div>

						<div class="card-footer">
							<span class="card-date">{formatDate(post.publishedAt)}</span>
							<span class="card-read">Read article →</span>
						</div>
					</a>
				{/each}
			</div>
		</div>
	</section>
</main>

<style>
	/* ── Hero ── */
	.blog-hero {
		position: relative;
		overflow: hidden;
		background: linear-gradient(140deg, #0c1228 0%, #071a0e 60%, #05100a 100%);
		border-bottom: 1px solid rgba(5, 212, 113, 0.13);
		padding: 3.5rem 1rem 3rem;
	}

	@media (min-width: 640px) {
		.blog-hero {
			padding: 4.5rem 1.5rem 3.75rem;
		}
	}

	.hero-inner {
		position: relative;
		z-index: 1;
		max-width: 72rem;
		margin: 0 auto;
	}

	.hero-label {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--font-head);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--fa-green-500);
		margin-bottom: 1rem;
	}

	.hero-dot {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 9999px;
		background: var(--fa-green-500);
		box-shadow: 0 0 8px rgba(5, 212, 113, 0.7);
	}

	.hero-title {
		font-family: var(--font-head);
		font-size: clamp(1.875rem, 5vw, 3rem);
		font-weight: 700;
		letter-spacing: -0.025em;
		line-height: 1.15;
		color: #ffffff;
		margin-bottom: 1rem;
	}

	.sm-br {
		display: none;
	}

	@media (min-width: 480px) {
		.sm-br {
			display: block;
		}
	}

	.hero-sub {
		font-size: 1rem;
		color: rgba(255, 255, 255, 0.48);
		line-height: 1.65;
		margin-bottom: 1rem;
		max-width: 400px;
	}

	.hero-count {
		font-family: var(--font-head);
		font-size: 0.78rem;
		color: rgba(255, 255, 255, 0.26);
	}

	.hero-line {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 2px;
		background: linear-gradient(
			90deg,
			transparent 0%,
			var(--fa-green-800) 15%,
			var(--fa-green-500) 50%,
			var(--fa-green-800) 85%,
			transparent 100%
		);
		opacity: 0.4;
	}

	/* Hex decorations */
	.hex-bg {
		position: absolute;
		top: 0;
		right: 0;
		width: 320px;
		height: 220px;
		pointer-events: none;
		z-index: 0;
	}

	.hd {
		position: absolute;
		clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
		background: rgba(5, 212, 113, 0.065);
	}

	.hd-1 { width: 100px; height: 112px; top: -8px; right: 84px; }
	.hd-2 { width: 72px;  height: 80px;  top: 72px; right: 18px; }
	.hd-3 { width: 56px;  height: 63px;  top: -4px; right: 178px; background: rgba(5, 212, 113, 0.045); }
	.hd-4 { width: 44px;  height: 50px;  top: 94px; right: 108px; background: rgba(5, 212, 113, 0.04); }
	.hd-5 { width: 34px;  height: 38px;  top: 40px; right: 224px; background: rgba(5, 212, 113, 0.035); }
	.hd-6 { width: 28px;  height: 32px;  top: 108px; right: 194px; background: rgba(5, 212, 113, 0.03); }

	/* ── Posts section ── */
	.posts-section {
		padding: 3rem 1rem 5rem;
	}

	@media (min-width: 640px) {
		.posts-section {
			padding: 3rem 1.5rem 5rem;
		}
	}

	@media (min-width: 1024px) {
		.posts-section {
			padding: 3.5rem 2rem 6rem;
		}
	}

	.posts-inner {
		max-width: 72rem;
		margin: 0 auto;
	}

	.posts-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1.25rem;
	}

	@media (min-width: 768px) {
		.posts-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	/* ── Card ── */
	.post-card {
		display: flex;
		flex-direction: column;
		border-radius: var(--r-md);
		background: var(--bg-elev-1);
		border: 1px solid var(--border);
		overflow: hidden;
		text-decoration: none;
		transition:
			border-color 200ms ease,
			box-shadow 200ms ease,
			transform 200ms ease;
	}

	.post-card:hover {
		border-color: rgba(5, 212, 113, 0.3);
		box-shadow:
			0 0 0 1px rgba(5, 212, 113, 0.1),
			0 12px 36px rgba(0, 0, 0, 0.28);
		transform: translateY(-2px);
	}

	.card-accent {
		height: 3px;
		background: linear-gradient(90deg, var(--fa-green-800) 0%, var(--fa-green-500) 100%);
		opacity: 0.65;
		transition: opacity 200ms ease;
	}

	.post-card:hover .card-accent {
		opacity: 1;
	}

	.card-body {
		padding: 1.25rem 1.25rem 0;
		flex: 1;
	}

	.card-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin-bottom: 0.875rem;
	}

	.card-tag {
		display: inline-block;
		padding: 0.175rem 0.625rem;
		border-radius: 9999px;
		font-size: 0.6875rem;
		font-weight: 600;
		font-family: var(--font-head);
		letter-spacing: 0.03em;
		background: rgba(5, 212, 113, 0.1);
		color: var(--fa-green-500);
		border: 1px solid rgba(5, 212, 113, 0.22);
	}

	.card-title {
		font-family: var(--font-head);
		font-size: 1.0625rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.35;
		color: var(--text);
		margin-bottom: 0.625rem;
		transition: color 200ms ease;
	}

	.post-card:hover .card-title {
		color: #fff;
	}

	.card-excerpt {
		font-size: 0.875rem;
		color: var(--text-muted);
		line-height: 1.65;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		overflow: hidden;
	}

	.card-footer {
		padding: 1rem 1.25rem 1.25rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-top: 1px solid var(--border);
		margin-top: 1rem;
	}

	.card-date {
		font-size: 0.75rem;
		color: var(--text-dim);
		font-family: var(--font-head);
	}

	.card-read {
		font-size: 0.8125rem;
		font-weight: 600;
		font-family: var(--font-head);
		color: var(--fa-green-500);
		transition: color 200ms ease;
	}

	.post-card:hover .card-read {
		color: var(--fa-green-600);
	}
</style>
