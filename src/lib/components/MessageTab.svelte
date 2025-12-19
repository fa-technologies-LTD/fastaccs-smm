<script lang="ts">
	import { Eye } from '@lucide/svelte';

	let { initialMessages } = $props();
	let messages = $state<any[]>(initialMessages);
</script>

<div class="rounded-lg border border-gray-200 bg-white">
	<div class="border-b border-gray-200 p-6">
		<h2 class="text-xl font-semibold">Inbox</h2>
		<p class="text-gray-600">Order updates and important notifications</p>
	</div>

	<div class="divide-y divide-gray-200">
		{#each messages as message}
			<div class="p-6 transition-colors hover:bg-gray-50 {!message.read ? 'bg-blue-50' : ''}">
				<div class="flex items-start justify-between">
					<div class="flex-1">
						<div class="mb-2 flex items-center">
							<div class="font-semibold {!message.read ? 'text-blue-600' : 'text-gray-900'}">
								{message.subject}
							</div>
							{#if !message.read}
								<div class="ml-2 h-2 w-2 rounded-full bg-blue-500"></div>
							{/if}
						</div>
						<p class="mb-2 text-sm text-gray-700">{message.content}</p>
						<div class="text-xs text-gray-500">{message.date}</div>
					</div>
					<button class="ml-4 p-2 text-gray-400 hover:text-gray-600">
						<Eye class="h-4 w-4" />
					</button>
				</div>
			</div>
		{/each}
	</div>
</div>
