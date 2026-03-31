<script>
	import { Mail, MessageCircle, Send, Facebook, Twitter, Instagram } from '@lucide/svelte';
	import { addToast } from '$lib/stores/toasts';
	import footerLogo from '$lib/assets/footer-logo.png';
</script>

<footer
	style="background: var(--bg-elev-2); color: var(--text); border-top: 1px solid var(--border);"
>
	<div class="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
		<div class="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-5">
			<!-- Company Info -->
			<div>
				<div class="mb-4">
					<img src={footerLogo} alt="FastAccs Logo" class="h-8 w-auto" />
				</div>
				<p class="mb-4" style="color: var(--text-muted); font-family: var(--font-body);">
					Nigeria's most trusted marketplace for premium social media accounts and boosting
					services. Fast, secure, and reliable.
				</p>
				<div class="flex space-x-4">
					<a href="https://facebook.com/fastaccs" class="footer-social">
						<Facebook class="h-5 w-5" />
					</a>
					<a href="https://twitter.com/fastaccs" class="footer-social">
						<Twitter class="h-5 w-5" />
					</a>
					<a href="https://instagram.com/fastaccs" class="footer-social">
						<Instagram class="h-5 w-5" />
					</a>
				</div>
			</div>

			<!-- Quick Links -->
			<div>
				<h3
					class="mb-4 text-lg font-semibold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Quick Links
				</h3>
				<ul class="space-y-2">
					<li>
						<a href="/accounts" data-sveltekit-preload-data="hover" class="footer-link"
							>Browse Accounts</a
						>
					</li>
					<li>
						<button
							class="footer-link text-left"
							onclick={() => addToast({ type: 'info', title: 'Coming Soon!' })}
							>Boosting Services</button
						>
					</li>
					<li>
						<a href="/how-it-works" data-sveltekit-preload-data="hover" class="footer-link"
							>How It Works</a
						>
					</li>
					<li>
						<a href="/pricing" data-sveltekit-preload-data="hover" class="footer-link">Pricing</a>
					</li>
					<li>
						<a href="/affiliate" data-sveltekit-preload-data="hover" class="footer-link"
							>Affiliate Program</a
						>
					</li>
				</ul>
			</div>

			<!-- Support -->
			<div>
				<h3
					class="mb-4 text-lg font-semibold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Support
				</h3>
				<ul class="space-y-2">
					<li>
						<a href="/help" data-sveltekit-preload-data="hover" class="footer-link">Help Center</a>
					</li>
					<li>
						<a href="/contact" data-sveltekit-preload-data="hover" class="footer-link">Contact Us</a
						>
					</li>
					<li>
						<a href="/faq" data-sveltekit-preload-data="hover" class="footer-link">FAQ</a>
					</li>
				</ul>
			</div>

			<!-- Policies -->
			<div>
				<h3
					class="mb-4 text-lg font-semibold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Policies
				</h3>
				<ul class="space-y-2">
					<li>
						<a href="/smm/policies" class="footer-link">FastAccs Policies</a>
					</li>
					<li>
						<a href="/logistics/policies" class="footer-link">Logistics Policies</a>
					</li>
					<li>
						<a href="/privacy" class="footer-link">Privacy</a>
					</li>
				</ul>
			</div>

			<!-- Contact Info -->
			<div>
				<h3
					class="mb-4 text-lg font-semibold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Get In Touch
				</h3>
				<div class="space-y-3">
					<div class="flex items-center">
						<Mail class="mr-2 h-5 w-5" style="color: var(--text-muted);" />
						<a href="mailto:support@fastaccs.com" class="footer-link"> support@fastaccs.com </a>
					</div>
					<div class="flex items-center">
						<MessageCircle class="mr-2 h-5 w-5" style="color: var(--text-muted);" />
						<a href="https://wa.me/2348123456789" class="footer-link"> WhatsApp Support </a>
					</div>
					<div class="flex items-center">
						<Send class="mr-2 h-5 w-5" style="color: var(--text-muted);" />
						<a href="https://t.me/fastaccs_support" class="footer-link"> Telegram Support </a>
					</div>
				</div>

				<!-- Trust Badges -->
				<div class="mt-6">
					<div class="mb-2 text-sm" style="color: var(--text-dim); font-family: var(--font-body);">
						Trusted & Secure
					</div>
					<div class="flex space-x-2">
						<div
							class="rounded px-2 py-1 text-xs"
							style="background: var(--status-success-bg); border: 1px solid var(--status-success-border); color: var(--primary); font-family: var(--font-body); font-weight: 600;"
						>
							SSL Secured
						</div>
						<div
							class="rounded px-2 py-1 text-xs"
							style="background: var(--status-success-bg); border: 1px solid var(--status-success-border); color: var(--primary); font-family: var(--font-body); font-weight: 600;"
						>
							24/7 Support
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Bottom Bar -->
		<div class="mt-8 pt-8 text-center" style="border-top: 1px solid var(--border);">
			<div class="flex flex-col items-center justify-between md:flex-row">
				<p class="text-sm" style="color: var(--text-dim); font-family: var(--font-body);">
					© 2026 FA Technologies LTD. All rights reserved.
				</p>
				<div class="mt-4 flex space-x-6 md:mt-0">
					<span class="text-sm" style="color: var(--text-dim); font-family: var(--font-body);"
						>🇳🇬 Made in Nigeria</span
					>
					<span class="text-sm" style="color: var(--text-dim); font-family: var(--font-body);"
						>⚡ Instant Delivery</span
					>
					<span class="text-sm" style="color: var(--text-dim); font-family: var(--font-body);"
						>🔒 100% Secure</span
					>
				</div>
			</div>
		</div>
	</div>
</footer>

<style>
	.footer-link {
		color: var(--text-muted);
		font-family: var(--font-body);
		transition: color 180ms ease;
	}
	.footer-link:hover {
		color: var(--link);
	}
	.footer-social {
		color: var(--text-muted);
		transition: color 180ms ease;
	}
	.footer-social:hover {
		color: var(--link);
	}
</style>
