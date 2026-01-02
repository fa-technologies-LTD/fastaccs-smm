<script lang="ts">
	import { Instagram, Music, Facebook, Twitter } from '@lucide/svelte';
	import { addToast } from '$lib/stores/toasts';
	import { goto } from '$app/navigation';
</script>

<section class="bg-gray-50 px-4 py-12 sm:py-16">
	<div class="mx-auto max-w-6xl">
		<h2 class="mb-8 text-center text-2xl font-bold text-gray-800 sm:mb-12 md:text-3xl">
			Featured Categories
		</h2>

		<div class="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-2">
			<!-- Social Media Accounts -->
			<div
				class="flex flex-col overflow-hidden rounded-2xl bg-white shadow transition-all duration-300 hover:shadow-md"
			>
				<div class="bg-gradient-secondary p-4 text-white sm:p-6">
					<h3 class="mb-2 text-xl font-bold">Social Media Accounts</h3>
					<p class="text-sm text-blue-100 sm:text-base">
						Premium verified accounts with real followers
					</p>
				</div>

				<div class="flex flex-1 flex-col p-4 sm:p-6">
					<div class="mb-4 grid grid-cols-1 gap-3 sm:mb-6 sm:grid-cols-2 sm:gap-4">
						<button
							onclick={() => goto('/platforms/instagram')}
							class="flex w-full cursor-pointer items-center rounded-lg bg-gray-50 p-3 transition-all hover:bg-gray-100 active:scale-[.95] active:bg-gray-100 disabled:cursor-wait disabled:opacity-75 disabled:active:scale-100 sm:p-4"
						>
							<Instagram class="mr-3 h-6 w-6 text-pink-600 sm:h-8 sm:w-8" />

							<div class="text-left">
								<div class="text-sm font-semibold text-gray-800 sm:text-base">Instagram</div>
								<div class="text-xs text-gray-600 sm:text-sm">Premium accounts</div>
							</div>
						</button>

						<button
							onclick={() => goto('/platforms/tiktok')}
							class="flex w-full cursor-pointer items-center rounded-lg bg-gray-50 p-3 transition-all hover:bg-gray-100 active:scale-[.95] active:bg-gray-100 disabled:cursor-wait disabled:opacity-75 disabled:active:scale-100 sm:p-4"
						>
							<Music class="mr-3 h-6 w-6 text-black sm:h-8 sm:w-8" />

							<div class="text-left">
								<div class="text-sm font-semibold text-gray-800 sm:text-base">TikTok</div>
								<div class="text-xs text-gray-600 sm:text-sm">Verified accounts</div>
							</div>
						</button>

						<button
							onclick={() => goto('/platforms/facebook')}
							class="flex w-full cursor-pointer items-center rounded-lg bg-gray-50 p-3 transition-all hover:bg-gray-100 active:scale-[.95] active:bg-gray-100 disabled:cursor-wait disabled:opacity-75 disabled:active:scale-100 sm:p-4"
						>
							<Facebook class="mr-3 h-6 w-6 text-blue-600 sm:h-8 sm:w-8" />

							<div class="text-left">
								<div class="font-semibold text-gray-800">Facebook</div>
								<div class="text-sm text-gray-600">Active accounts</div>
							</div>
						</button>

						<button
							onclick={() => goto('/platforms/twitter')}
							class="flex w-full cursor-pointer items-center rounded-lg bg-gray-50 p-4 transition-all hover:bg-gray-100 active:scale-[.95] disabled:cursor-wait disabled:opacity-75 disabled:active:scale-100"
						>
							<Twitter class="mr-3 h-8 w-8 text-blue-400" />

							<div class="text-left">
								<div class="font-semibold text-gray-800">Twitter</div>
								<div class="text-sm text-gray-600">Quality profiles</div>
							</div>
						</button>
					</div>

					<div class="mt-auto">
						<button
							onclick={() => goto('/platforms')}
							class="block w-full cursor-pointer rounded-lg bg-purple-600 py-3 text-center font-semibold text-white transition-all hover:bg-purple-700 active:scale-[.95] disabled:cursor-wait disabled:opacity-75 disabled:active:scale-100"
						>
							Browse All Accounts
						</button>
					</div>
				</div>
			</div>

			<!-- Boosting Services -->
			<div
				class="flex flex-col overflow-hidden rounded-2xl bg-white shadow transition-all duration-300 hover:shadow-md"
			>
				<div class="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 text-white">
					<h3 class="mb-2 text-xl font-bold">Boosting Services</h3>
					<p class="text-blue-100">Grow your existing accounts with real engagement</p>
				</div>

				<div class="flex flex-1 flex-col p-6">
					<div class="mb-6 space-y-4">
						<div
							class="flex cursor-pointer items-center justify-between rounded-lg bg-gray-50 p-4 transition-colors hover:bg-gray-100"
							role="button"
							tabindex="0"
							onclick={() => addToast({ title: 'Coming soon', type: 'info' })}
							onkeydown={(e) =>
								e.key === 'Enter' && addToast({ title: 'Coming soon', type: 'info' })}
						>
							<div>
								<div class="font-semibold text-gray-800">Instagram Followers</div>
								<div class="text-sm text-gray-600">High-quality, real followers</div>
							</div>
						</div>

						<div
							class="flex cursor-pointer items-center justify-between rounded-lg bg-gray-50 p-4 transition-colors hover:bg-gray-100"
							role="button"
							tabindex="0"
							onclick={() => addToast({ title: 'Coming soon', type: 'info' })}
							onkeydown={(e) =>
								e.key === 'Enter' && addToast({ title: 'Coming soon', type: 'info' })}
						>
							<div>
								<div class="font-semibold text-gray-800">TikTok Views</div>
								<div class="text-sm text-gray-600">Boost your video reach</div>
							</div>
						</div>

						<div
							class="flex cursor-pointer items-center justify-between rounded-lg bg-gray-50 p-4 transition-colors hover:bg-gray-100"
							role="button"
							tabindex="0"
							onclick={() => addToast({ title: 'Coming soon', type: 'info' })}
							onkeydown={(e) =>
								e.key === 'Enter' && addToast({ title: 'Coming soon', type: 'info' })}
						>
							<div>
								<div class="font-semibold text-gray-800">YouTube Subscribers</div>
								<div class="text-sm text-gray-600">Grow your channel fast</div>
							</div>
						</div>

						<div
							class="flex cursor-pointer items-center justify-between rounded-lg bg-gray-50 p-4 transition-colors hover:bg-gray-100"
							role="button"
							tabindex="0"
							onclick={() => addToast({ title: 'Coming soon', type: 'info' })}
							onkeydown={(e) =>
								e.key === 'Enter' && addToast({ title: 'Coming soon', type: 'info' })}
						>
							<div>
								<div class="font-semibold text-gray-800">Facebook Likes</div>
								<div class="text-sm text-gray-600">Increase post engagement</div>
							</div>
						</div>
					</div>

					<div class="mt-auto">
						<button
							onclick={() => addToast({ title: 'Coming soon', type: 'info' })}
							class="block w-full cursor-pointer rounded-lg bg-blue-600 py-3 text-center font-semibold text-white transition-all hover:bg-blue-700 active:scale-95"
						>
							View All Services
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
</section>
