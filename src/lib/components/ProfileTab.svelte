<script lang="ts">
	let { user } = $props();

	let fullName = $state(user?.fullName || '');
	let email = $state(user?.email || '');
	let phone = $state(user?.phone || '');
</script>

<div class="rounded-lg border border-gray-200 bg-white p-6">
	<h2 class="mb-6 text-xl font-semibold">Profile Settings</h2>

	<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
		<div>
			<label for="profileName" class="mb-1 block text-sm font-medium text-gray-700">Full Name</label
			>
			<input
				id="profileName"
				type="text"
				bind:value={fullName}
				class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
			/>
		</div>
		<div>
			<label for="profileEmail" class="mb-1 block text-sm font-medium text-gray-700"
				>Email Address</label
			>
			<input
				id="profileEmail"
				type="email"
				bind:value={email}
				readonly
				class="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
			/>
		</div>
		<div>
			<label for="profilePhone" class="mb-1 block text-sm font-medium text-gray-700"
				>Phone Number</label
			>
			<input
				id="profilePhone"
				type="tel"
				bind:value={phone}
				placeholder="+234..."
				class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
			/>
		</div>
	</div>

	<div class="mt-6 flex gap-4">
		<button
			class="rounded-lg bg-blue-600 px-6 py-2 text-white transition-all hover:bg-blue-700 active:scale-[.98]"
		>
			Save Changes
		</button>
		<button
			class="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 transition-all hover:bg-gray-50 active:scale-[.98]"
		>
			Cancel
		</button>
	</div>
</div>
