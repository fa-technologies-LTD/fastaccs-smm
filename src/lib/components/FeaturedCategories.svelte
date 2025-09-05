<script>
	import { Instagram, Music, Facebook, Twitter } from '@lucide/svelte';
</script>

<section class="bg-gray-50 px-4 py-16">
	<div class="mx-auto max-w-6xl">
		<h2 class="mb-12 text-center text-3xl font-bold text-gray-800 md:text-4xl">
			Featured Categories
		</h2>

		<div class="grid grid-cols-1 gap-8 md:grid-cols-2">
			<!-- Social Media Accounts -->
			<div
				class="overflow-hidden rounded-2xl bg-white shadow-lg transition-all duration-300 hover:shadow-xl"
			>
				<div class="bg-gradient-to-r from-pink-500 to-purple-600 p-6 text-white">
					<h3 class="mb-2 text-2xl font-bold">Social Media Accounts</h3>
					<p class="text-pink-100">Premium verified accounts with real followers</p>
				</div>

				<div class="p-6">
					<div class="mb-6 grid grid-cols-2 gap-4">
						<a
							href="/products?platform=instagram"
							class="flex cursor-pointer items-center rounded-lg bg-gray-50 p-4 transition-colors hover:bg-gray-100"
						>
							<Instagram class="mr-3 h-8 w-8 text-pink-600" />
							<div>
								<div class="font-semibold text-gray-800">Instagram</div>
								<div class="text-sm text-gray-600">1K - 500K followers</div>
							</div>
						</a>

						<a
							href="/products?platform=tiktok"
							class="flex cursor-pointer items-center rounded-lg bg-gray-50 p-4 transition-colors hover:bg-gray-100"
						>
							<Music class="mr-3 h-8 w-8 text-black" />
							<div>
								<div class="font-semibold text-gray-800">TikTok</div>
								<div class="text-sm text-gray-600">5K - 1M followers</div>
							</div>
						</a>

						<a
							href="/products?platform=facebook"
							class="flex cursor-pointer items-center rounded-lg bg-gray-50 p-4 transition-colors hover:bg-gray-100"
						>
							<Facebook class="mr-3 h-8 w-8 text-blue-600" />
							<div>
								<div class="font-semibold text-gray-800">Facebook</div>
								<div class="text-sm text-gray-600">2K - 100K likes</div>
							</div>
						</a>

						<a
							href="/products?platform=twitter"
							class="flex cursor-pointer items-center rounded-lg bg-gray-50 p-4 transition-colors hover:bg-gray-100"
						>
							<Twitter class="mr-3 h-8 w-8 text-blue-400" />
							<div>
								<div class="font-semibold text-gray-800">Twitter</div>
								<div class="text-sm text-gray-600">1K - 50K followers</div>
							</div>
						</a>
					</div>

					<a
						href="/products"
						class="block w-full rounded-lg bg-purple-600 py-3 text-center font-semibold text-white transition-colors hover:bg-purple-700"
					>
						Browse All Accounts
					</a>
				</div>
			</div>

			<!-- Boosting Services -->
			<div
				class="overflow-hidden rounded-2xl bg-white shadow-lg transition-all duration-300 hover:shadow-xl"
			>
				<div class="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 text-white">
					<h3 class="mb-2 text-2xl font-bold">Boosting Services</h3>
					<p class="text-blue-100">Grow your existing accounts with real engagement</p>
				</div>

				<div class="p-6">
					<div class="mb-6 space-y-4">
						<div
							class="flex cursor-pointer items-center justify-between rounded-lg bg-gray-50 p-4 transition-colors hover:bg-gray-100"
						>
							<div>
								<div class="font-semibold text-gray-800">Instagram Followers</div>
								<div class="text-sm text-gray-600">High-quality, real followers</div>
							</div>
							<div class="font-semibold text-blue-600">₦50/100</div>
						</div>

						<div
							class="flex cursor-pointer items-center justify-between rounded-lg bg-gray-50 p-4 transition-colors hover:bg-gray-100"
						>
							<div>
								<div class="font-semibold text-gray-800">TikTok Views</div>
								<div class="text-sm text-gray-600">Boost your video reach</div>
							</div>
							<div class="font-semibold text-blue-600">₦30/1K</div>
						</div>

						<div
							class="flex cursor-pointer items-center justify-between rounded-lg bg-gray-50 p-4 transition-colors hover:bg-gray-100"
						>
							<div>
								<div class="font-semibold text-gray-800">YouTube Subscribers</div>
								<div class="text-sm text-gray-600">Grow your channel fast</div>
							</div>
							<div class="font-semibold text-blue-600">₦100/50</div>
						</div>

						<div
							class="flex cursor-pointer items-center justify-between rounded-lg bg-gray-50 p-4 transition-colors hover:bg-gray-100"
						>
							<div>
								<div class="font-semibold text-gray-800">Facebook Likes</div>
								<div class="text-sm text-gray-600">Increase post engagement</div>
							</div>
							<div class="font-semibold text-blue-600">₦25/100</div>
						</div>
					</div>

					<a
						href="/services"
						class="block w-full rounded-lg bg-blue-600 py-3 text-center font-semibold text-white transition-colors hover:bg-blue-700"
					>
						View All Services
					</a>
				</div>
			</div>
		</div>
	</div>
</section>
