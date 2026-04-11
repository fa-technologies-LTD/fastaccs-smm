<script>
	import {
		Star,
		MessageCircle,
		CheckCircle,
		Clock,
		Shield,
		Zap,
		HeartHandshake,
		Phone
	} from '@lucide/svelte';
</script>

<section style="background: var(--bg-elev-1); padding: var(--space-4xl) var(--space-md);">
	<div class="mx-auto max-w-6xl">
		<h2
			style="margin-bottom: var(--space-md); text-align: center; font-size: 2rem; font-weight: 700; color: var(--text); font-family: var(--font-head);"
		>
			Why Choose FastAccs?
		</h2>
		<p
			style="margin-bottom: var(--space-3xl); text-align: center; font-size: 1rem; color: var(--text-muted); font-family: var(--font-body);"
		>
			A reliable platform for social media accounts and growth services
		</p>

		<div class="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
			<!-- Secure Payments -->
			<div class="feature-card">
				<div class="icon-wrapper">
					<Shield class="h-8 w-8" style="color: var(--primary);" />
				</div>
				<h3
					style="margin-bottom: var(--space-xs); font-size: 1.1rem; font-weight: 600; color: var(--text); font-family: var(--font-head);"
				>
					100% Secure
				</h3>
				<p style="color: var(--text-muted); font-family: var(--font-body);">
					All transactions are encrypted and protected
				</p>
			</div>

			<!-- Instant Delivery -->
			<div class="feature-card">
				<div class="icon-wrapper">
					<Zap class="h-8 w-8" style="color: var(--fa-lime-700);" />
				</div>
				<h3
					style="margin-bottom: var(--space-xs); font-size: 1.1rem; font-weight: 600; color: var(--text); font-family: var(--font-head);"
				>
					Instant Delivery
				</h3>
				<p style="color: var(--text-muted); font-family: var(--font-body);">
					Get your accounts delivered within minutes
				</p>
			</div>

			<!-- Quality Guarantee -->
			<div class="feature-card">
				<div class="icon-wrapper">
					<HeartHandshake class="h-8 w-8" style="color: var(--fa-blue-500);" />
				</div>
				<h3
					style="margin-bottom: var(--space-xs); font-size: 1.1rem; font-weight: 600; color: var(--text); font-family: var(--font-head);"
				>
					Quality Checked Listings
				</h3>
				<p style="color: var(--text-muted); font-family: var(--font-body);">
					Listings are reviewed and matched to their stated category details
				</p>
			</div>

			<!-- 24/7 Support -->
			<div class="feature-card">
				<div class="icon-wrapper">
					<Phone class="h-8 w-8" style="color: var(--fa-lime-400);" />
				</div>
				<h3
					style="margin-bottom: var(--space-xs); font-size: 1.1rem; font-weight: 600; color: var(--text); font-family: var(--font-head);"
				>
					24/7 Support
				</h3>
				<p style="color: var(--text-muted); font-family: var(--font-body);">
					Round-the-clock customer support when you need it
				</p>
			</div>
		</div>

		<!-- Trust Badges -->
		<div style="margin-top: var(--space-3xl); text-align: center;">
			<div class="flex flex-wrap items-center justify-center gap-8" style="opacity: 0.75;">
				<div class="flex items-center">
					<CheckCircle class="mr-2 h-5 w-5" style="color: var(--status-success);" />
					<span style="color: var(--text-muted); font-family: var(--font-body);">SSL Encrypted</span
					>
				</div>
				<div class="flex items-center">
					<CheckCircle class="mr-2 h-5 w-5" style="color: var(--status-success);" />
					<span style="color: var(--text-muted); font-family: var(--font-body);"
						>Tiered Listings</span
					>
				</div>
				<div class="flex items-center">
					<CheckCircle class="mr-2 h-5 w-5" style="color: var(--status-success);" />
					<span style="color: var(--text-muted); font-family: var(--font-body);"
						>Issue Resolution</span
					>
				</div>
				<div class="flex items-center">
					<CheckCircle class="mr-2 h-5 w-5" style="color: var(--status-success);" />
					<span style="color: var(--text-muted); font-family: var(--font-body);"
						>Premium Quality</span
					>
				</div>
			</div>
		</div>
	</div>
</section>

<style>
	.feature-card {
		text-align: center;
		transition: transform 0.3s ease;
	}

	.feature-card:hover {
		transform: translateY(-4px);
	}

	.icon-wrapper {
		width: 64px;
		height: 64px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: var(--bg-elev-2);
		border: 2px solid var(--border);
		margin: 0 auto var(--space-md);
		transition: all 0.3s ease;
	}

	.feature-card:hover .icon-wrapper {
		border-color: var(--primary);
		box-shadow: var(--glow-primary);
	}
</style>
