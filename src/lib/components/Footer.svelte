<script>
	import { Mail, MessageCircle, Facebook, Instagram, Music2 } from '$lib/icons';
	import { addToast } from '$lib/stores/toasts';
	import footerLogo from '$lib/assets/footer-logo.png';
</script>

<footer
	style="background: var(--bg-elev-2); color: var(--text); border-top: 1px solid var(--border);"
>
	<div class="mx-auto max-w-7xl px-5 py-7 sm:px-6 lg:px-8">
		<div class="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-5">
			<!-- Company Info -->
			<div>
				<div class="mb-2">
					<img src={footerLogo} alt="FastAccs Logo" class="h-8 w-auto" />
				</div>
				<p
					class="mb-2 text-sm font-semibold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					FAST ACCOUNTS
				</p>
				<p class="mb-3 text-sm" style="color: var(--text-muted); font-family: var(--font-body);">
					Secure marketplace for social media accounts and boosting services.
				</p>
				<div class="flex space-x-4">
					<a href="https://web.facebook.com/profile.php?id=100089537246012" class="footer-social">
						<Facebook class="h-5 w-5" />
					</a>
					<a href="https://www.tiktok.com/@fastaccounts_" class="footer-social">
						<Music2 class="h-5 w-5" />
					</a>
					<a href="https://www.instagram.com/fastaccounts_/" class="footer-social">
						<Instagram class="h-5 w-5" />
					</a>
				</div>
			</div>

			<!-- Quick Links -->
			<div>
				<h3
					class="mb-2 text-base font-semibold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Quick Links
				</h3>
				<ul class="space-y-1.5 text-sm">
					<li>
						<a href="/platforms" data-sveltekit-preload-data="hover" class="footer-link"
							>Browse Accounts</a
						>
					</li>
					<li>
						<a href="/services" data-sveltekit-preload-data="hover" class="footer-link"
							>Boosting Services</a
						>
					</li>
					<li>
						<a href="/how-it-works" data-sveltekit-preload-data="hover" class="footer-link"
							>How It Works</a
						>
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
					class="mb-2 text-base font-semibold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Support
				</h3>
				<ul class="space-y-1.5 text-sm">
					<li>
						<a href="/support" data-sveltekit-preload-data="hover" class="footer-link"
							>Help Center</a
						>
					</li>
					<li>
						<a href="/support#contact" data-sveltekit-preload-data="hover" class="footer-link"
							>Contact Us</a
						>
					</li>
					<li>
						<a href="/support#faq" data-sveltekit-preload-data="hover" class="footer-link">FAQ</a>
					</li>
				</ul>
			</div>

			<!-- Policies -->
			<div>
				<h3
					class="mb-2 text-base font-semibold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Policies
				</h3>
				<ul class="space-y-1.5 text-sm">
					<li>
						<a href="/terms" class="footer-link">Terms</a>
					</li>
					<li>
						<a href="/refund-policy" class="footer-link">Refund Policy</a>
					</li>
					<li>
						<a href="/privacy" class="footer-link">Privacy</a>
					</li>
					<li>
						<a href="/acceptable-use" class="footer-link">Acceptable Use</a>
					</li>
				</ul>
			</div>

			<!-- Contact Info -->
			<div>
				<h3
					class="mb-2 text-base font-semibold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Contact
				</h3>
				<div class="space-y-2 text-sm">
					<div class="flex items-center">
						<MessageCircle class="mr-2 h-4 w-4" style="color: var(--text-muted);" />
						<a href="https://wa.link/fast_accounts" class="footer-link"> WhatsApp Support </a>
					</div>
					<div class="flex items-center">
						<Mail class="mr-2 h-4 w-4" style="color: var(--text-muted);" />
						<a href="mailto:support@fastaccs.com" class="footer-link"> Support Email </a>
					</div>
				</div>
			</div>
		</div>

		<!-- Bottom Bar -->
		<div class="mt-5 pt-4 text-center" style="border-top: 1px solid var(--border);">
			<div class="flex flex-col items-center justify-between gap-2 md:flex-row">
				<div
					class="text-xs sm:text-sm"
					style="color: var(--text-dim); font-family: var(--font-body);"
				>
					SSL Secured · Support Team
				</div>
				<p
					class="text-xs sm:text-sm"
					style="color: var(--text-dim); font-family: var(--font-body);"
				>
					© 2026 FA Technologies LTD. All rights reserved.
				</p>
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
