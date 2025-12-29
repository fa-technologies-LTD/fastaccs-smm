<script>
	import { Mail, Phone, MessageCircle, Send, Facebook, Twitter, Instagram } from '@lucide/svelte';
	import footerLogo from '$lib/assets/footer-logo.png';
</script>

<footer class="bg-neutral-dark text-white">
	<div class="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
		<div class="grid grid-cols-1 gap-8 md:grid-cols-4">
			<!-- Company Info -->
			<div>
				<div class="mb-4">
					<img src={footerLogo} alt="FastAccs Logo" class="h-8 w-auto" />
				</div>
				<p class="mb-4 text-gray-400">
					Nigeria's most trusted marketplace for premium social media accounts and boosting
					services. Fast, secure, and reliable.
				</p>
				<div class="flex space-x-4">
					<a
						href="https://facebook.com/fastaccs"
						class="text-gray-400 transition-colors hover:text-white"
					>
						<Facebook class="h-5 w-5" />
					</a>
					<a
						href="https://twitter.com/fastaccs"
						class="text-gray-400 transition-colors hover:text-white"
					>
						<Twitter class="h-5 w-5" />
					</a>
					<a
						href="https://instagram.com/fastaccs"
						class="text-gray-400 transition-colors hover:text-white"
					>
						<Instagram class="h-5 w-5" />
					</a>
				</div>
			</div>

			<!-- Quick Links -->
			<div>
				<h3 class="mb-4 text-lg font-semibold">Quick Links</h3>
				<ul class="space-y-2">
					<li>
						<a
							href="/accounts"
							data-sveltekit-preload-data="hover"
							class="text-gray-400 transition-colors hover:text-white">Browse Accounts</a
						>
					</li>
					<li>
						<a
							href="/services"
							data-sveltekit-preload-data="hover"
							class="text-gray-400 transition-colors hover:text-white">Boosting Services</a
						>
					</li>
					<li>
						<a
							href="/how-it-works"
							data-sveltekit-preload-data="hover"
							class="text-gray-400 transition-colors hover:text-white">How It Works</a
						>
					</li>
					<li>
						<a
							href="/pricing"
							data-sveltekit-preload-data="hover"
							class="text-gray-400 transition-colors hover:text-white">Pricing</a
						>
					</li>
					<li>
						<a
							href="/affiliate"
							data-sveltekit-preload-data="hover"
							class="text-gray-400 transition-colors hover:text-white">Affiliate Program</a
						>
					</li>
				</ul>
			</div>

			<!-- Support -->
			<div>
				<h3 class="mb-4 text-lg font-semibold">Support</h3>
				<ul class="space-y-2">
					<li>
						<a
							href="/help"
							data-sveltekit-preload-data="hover"
							class="text-gray-400 transition-colors hover:text-white">Help Center</a
						>
					</li>
					<li>
						<a
							href="/contact"
							data-sveltekit-preload-data="hover"
							class="text-gray-400 transition-colors hover:text-white">Contact Us</a
						>
					</li>
					<li>
						<a
							href="/faq"
							data-sveltekit-preload-data="hover"
							class="text-gray-400 transition-colors hover:text-white">FAQ</a
						>
					</li>
					<li>
						<a
							href="/terms"
							data-sveltekit-preload-data="hover"
							class="text-gray-400 transition-colors hover:text-white">Terms of Service</a
						>
					</li>
					<li>
						<a
							href="/privacy"
							data-sveltekit-preload-data="hover"
							class="text-gray-400 transition-colors hover:text-white">Privacy Policy</a
						>
					</li>
				</ul>
			</div>

			<!-- Contact Info -->
			<div>
				<h3 class="mb-4 text-lg font-semibold">Get In Touch</h3>
				<div class="space-y-3">
					<div class="flex items-center">
						<Mail class="mr-2 h-5 w-5 text-gray-400" />
						<a
							href="mailto:support@fastaccs.com"
							class="text-gray-400 transition-colors hover:text-white"
						>
							support@fastaccs.com
						</a>
					</div>
					<div class="flex items-center">
						<MessageCircle class="mr-2 h-5 w-5 text-gray-400" />
						<a
							href="https://wa.me/2348123456789"
							class="text-gray-400 transition-colors hover:text-white"
						>
							WhatsApp Support
						</a>
					</div>
					<div class="flex items-center">
						<Send class="mr-2 h-5 w-5 text-gray-400" />
						<a
							href="https://t.me/fastaccs_support"
							class="text-gray-400 transition-colors hover:text-white"
						>
							Telegram Support
						</a>
					</div>
				</div>

				<!-- Trust Badges -->
				<div class="mt-6">
					<div class="mb-2 text-sm text-gray-400">Trusted & Secure</div>
					<div class="flex space-x-2">
						<div
							class="bg-primary/10 border-primary/20 text-primary rounded border px-2 py-1 text-xs"
						>
							SSL Secured
						</div>
						<div
							class="bg-primary/10 border-primary/20 text-primary rounded border px-2 py-1 text-xs"
						>
							24/7 Support
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Bottom Bar -->
		<div class="mt-8 border-t border-gray-800 pt-8 text-center">
			<div class="flex flex-col items-center justify-between md:flex-row">
				<p class="text-sm text-gray-400">© 2025 FastAccs. All rights reserved.</p>
				<div class="mt-4 flex space-x-6 md:mt-0">
					<span class="text-sm text-gray-400">🇳🇬 Made in Nigeria</span>
					<span class="text-sm text-gray-400">⚡ Instant Delivery</span>
					<span class="text-sm text-gray-400">🔒 100% Secure</span>
				</div>
			</div>
		</div>
	</div>
</footer>
