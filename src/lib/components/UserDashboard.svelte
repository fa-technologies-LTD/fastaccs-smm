<script lang="ts">
	import {
		ShoppingCart,
		Package,
		User,
		Settings,
		LogOut,
		Clock,
		CheckCircle,
		RefreshCw,
		Eye
	} from '@lucide/svelte';

	let activeTab = $state('orders');

	let user = {
		name: 'John Doe',
		email: 'john.doe@example.com',
		joinDate: 'March 2024',
		totalOrders: 0,
		totalSpent: 0
	};

	let orders: any[] = [
		// Orders will be loaded from actual data
	];

	let messages: any[] = [
		// Messages will be loaded from actual data
	];

	function getStatusIcon(status: any) {
		switch (status) {
			case 'delivered':
			case 'completed':
				return CheckCircle;
			case 'processing':
				return RefreshCw;
			default:
				return Clock;
		}
	}

	function getStatusColor(status: any) {
		switch (status) {
			case 'delivered':
			case 'completed':
				return 'text-green-600';
			case 'processing':
				return 'text-blue-600';
			default:
				return 'text-yellow-600';
		}
	}

	function reorderItems(order: any) {
		// Add reorder logic here
		console.log('Reordering:', order);
	}
</script>

<div class="mx-auto max-w-6xl px-4 py-8">
	<!-- Header -->
	<div class="mb-8 rounded-lg border border-gray-200 bg-white p-6">
		<div class="flex items-center justify-between">
			<div class="flex items-center">
				<div
					class="mr-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-blue-500 text-xl font-bold text-white"
				>
					{user.name
						.split(' ')
						.map((n) => n[0])
						.join('')}
				</div>
				<div>
					<h1 class="text-2xl font-bold text-gray-900">Welcome back, {user.name}!</h1>
					<p class="text-gray-600">Member since {user.joinDate}</p>
				</div>
			</div>
			<div class="text-right">
				<div class="text-sm text-gray-600">Total Spent</div>
				<div class="text-2xl font-bold text-blue-600">₦{user.totalSpent.toLocaleString()}</div>
			</div>
		</div>
	</div>

	<!-- Stats Cards -->
	<div class="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<div class="flex items-center">
				<Package class="mr-3 h-8 w-8 text-blue-600" />
				<div>
					<div class="text-2xl font-bold text-gray-900">{user.totalOrders}</div>
					<div class="text-gray-600">Total Orders</div>
				</div>
			</div>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<div class="flex items-center">
				<CheckCircle class="mr-3 h-8 w-8 text-green-600" />
				<div>
					<div class="text-2xl font-bold text-gray-900">
						{orders.filter((o) => o.status === 'delivered' || o.status === 'completed').length}
					</div>
					<div class="text-gray-600">Completed Orders</div>
				</div>
			</div>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<div class="flex items-center">
				<RefreshCw class="mr-3 h-8 w-8 text-blue-600" />
				<div>
					<div class="text-2xl font-bold text-gray-900">
						{orders.filter((o) => o.status === 'processing').length}
					</div>
					<div class="text-gray-600">In Progress</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Navigation Tabs -->
	<div class="mb-6">
		<nav class="flex space-x-8">
			<button
				onclick={() => (activeTab = 'orders')}
				class="border-b-2 px-1 py-2 text-sm font-medium transition-colors
					{activeTab === 'orders'
					? 'border-blue-500 text-blue-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
			>
				Order History
			</button>
			<button
				onclick={() => (activeTab = 'messages')}
				class="border-b-2 px-1 py-2 text-sm font-medium transition-colors
					{activeTab === 'messages'
					? 'border-blue-500 text-blue-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
			>
				Messages ({messages.filter((m) => !m.read).length})
			</button>
			<button
				onclick={() => (activeTab = 'profile')}
				class="border-b-2 px-1 py-2 text-sm font-medium transition-colors
					{activeTab === 'profile'
					? 'border-blue-500 text-blue-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
			>
				Profile Settings
			</button>
		</nav>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'orders'}
		<div class="rounded-lg border border-gray-200 bg-white">
			<div class="border-b border-gray-200 p-6">
				<h2 class="text-xl font-semibold">Order History</h2>
				<p class="text-gray-600">Track your purchases and reorder items</p>
			</div>

			<div class="divide-y divide-gray-200">
				{#each orders as order}
					<div class="p-6">
						<div class="mb-4 flex items-center justify-between">
							<div class="flex items-center">
								{#if order.status === 'delivered' || order.status === 'completed'}
									<CheckCircle class="mr-2 h-5 w-5 text-green-600" />
								{:else if order.status === 'processing'}
									<RefreshCw class="mr-2 h-5 w-5 text-blue-600" />
								{:else}
									<Clock class="mr-2 h-5 w-5 text-yellow-600" />
								{/if}
								<div>
									<div class="font-semibold">Order {order.id}</div>
									<div class="text-sm text-gray-600">{order.date}</div>
								</div>
							</div>
							<div class="text-right">
								<div class="font-semibold">₦{order.total.toLocaleString()}</div>
								<div class="text-sm text-gray-600 capitalize">{order.status}</div>
							</div>
						</div>

						<div class="mb-4 space-y-2">
							{#each order.items as item}
								<div class="flex justify-between text-sm">
									<span>{item.type}</span>
									<span class="text-gray-600">{item.details}</span>
								</div>
							{/each}
						</div>

						<div class="flex items-center justify-between">
							<div class="text-sm text-gray-600">
								Delivery: {order.deliveryMethod}
								{#if order.deliveredAt}
									• Delivered {order.deliveredAt}
								{:else if order.estimatedDelivery}
									• Est. {order.estimatedDelivery}
								{/if}
							</div>
							<div class="flex gap-2">
								<button
									onclick={() => reorderItems(order)}
									class="rounded-lg border border-blue-600 px-4 py-2 text-blue-600 transition-colors hover:bg-blue-50"
								>
									Reorder
								</button>
								<button
									class="rounded-lg border border-gray-300 px-4 py-2 text-gray-600 transition-colors hover:bg-gray-50"
								>
									View Details
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	{#if activeTab === 'messages'}
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
	{/if}

	{#if activeTab === 'profile'}
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<h2 class="mb-6 text-xl font-semibold">Profile Settings</h2>

			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<div>
					<label for="profileName" class="mb-1 block text-sm font-medium text-gray-700"
						>Full Name</label
					>
					<input
						id="profileName"
						type="text"
						value={user.name}
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
						value={user.email}
						class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
					/>
				</div>
				<div>
					<label for="whatsappNumber" class="mb-1 block text-sm font-medium text-gray-700"
						>WhatsApp Number</label
					>
					<input
						id="whatsappNumber"
						type="tel"
						placeholder="+234..."
						class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
					/>
				</div>
				<div>
					<label for="telegramUsername" class="mb-1 block text-sm font-medium text-gray-700"
						>Telegram Username</label
					>
					<input
						id="telegramUsername"
						type="text"
						placeholder="@username"
						class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
					/>
				</div>
			</div>

			<div class="mt-6 flex gap-4">
				<button
					class="rounded-lg bg-blue-600 px-6 py-2 text-white transition-colors hover:bg-blue-700"
				>
					Save Changes
				</button>
				<button
					class="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 transition-colors hover:bg-gray-50"
				>
					Cancel
				</button>
			</div>
		</div>
	{/if}
</div>
