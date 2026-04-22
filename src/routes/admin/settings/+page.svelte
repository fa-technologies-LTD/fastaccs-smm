<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData | null } = $props();

	const settings = data.settings;
	const envConfig = data.envConfig;

	const recipientsInput = settings.notifications.adminRecipients.join('\n');
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold" style="color: var(--text)">Settings</h1>
		<p class="mt-1" style="color: var(--text-muted)">
			Core store configuration and operational controls.
		</p>
	</div>

	{#if form?.error}
		<div
			class="rounded-lg p-4"
			style="border: 1px solid var(--status-error-border); background: var(--status-error-bg); color: var(--status-error);"
		>
			{form.error}
		</div>
	{/if}

	{#if form?.success && form?.message}
		<div
			class="rounded-lg p-4"
			style="border: 1px solid var(--status-success-border); background: var(--status-success-bg); color: var(--status-success);"
		>
			{form.message}
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<section class="rounded-lg p-6" style="background: var(--bg-elev-1); border: 1px solid var(--border)">
			<h2 class="text-lg font-semibold" style="color: var(--text)">Business Profile</h2>
			<p class="mt-1 text-sm" style="color: var(--text-muted)">
				Controls sender/brand identity shown across the storefront and transactional channels.
			</p>

			<form method="POST" action="?/saveBusiness" class="mt-5 space-y-4">
				<label class="block text-sm" style="color: var(--text-muted)">
					Business name
					<input
						type="text"
						name="businessName"
						value={settings.business.businessName}
						class="mt-1 w-full rounded-lg px-3 py-2"
						style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
						required
					/>
				</label>

				<label class="block text-sm" style="color: var(--text-muted)">
					Business email
					<input
						type="email"
						name="businessEmail"
						value={settings.business.businessEmail}
						class="mt-1 w-full rounded-lg px-3 py-2"
						style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
						required
					/>
				</label>

				<label class="block text-sm" style="color: var(--text-muted)">
					WhatsApp support number
					<input
						type="text"
						name="whatsappNumber"
						value={settings.business.whatsappNumber}
						class="mt-1 w-full rounded-lg px-3 py-2"
						style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
					/>
				</label>

				<label class="block text-sm" style="color: var(--text-muted)">
					Currency code
					<input
						type="text"
						name="currencyCode"
						value={settings.business.currencyCode}
						class="mt-1 w-full rounded-lg px-3 py-2"
						style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
						maxlength="3"
					/>
				</label>

				<button
					type="submit"
					class="rounded-full px-4 py-2 text-sm font-semibold text-white transition-all hover:scale-95 active:scale-90"
					style="background: var(--btn-primary-gradient)"
				>
					Save business settings
				</button>
			</form>
		</section>

		<section class="rounded-lg p-6" style="background: var(--bg-elev-1); border: 1px solid var(--border)">
			<h2 class="text-lg font-semibold" style="color: var(--text)">Notification Thresholds</h2>
			<p class="mt-1 text-sm" style="color: var(--text-muted)">
				Operational alert recipients, low-stock threshold, and email batch behavior.
			</p>

			<form method="POST" action="?/saveNotifications" class="mt-5 space-y-4">
				<label class="block text-sm" style="color: var(--text-muted)">
					Admin notification recipients
					<textarea
						name="adminRecipients"
						rows="4"
						class="mt-1 w-full rounded-lg px-3 py-2"
						style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
						placeholder="one email per line"
					>{recipientsInput}</textarea>
				</label>

				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<label class="block text-sm" style="color: var(--text-muted)">
						Low-stock threshold
						<input
							type="number"
							name="lowStockThreshold"
							value={settings.notifications.lowStockThreshold}
							min="1"
							max="999"
							class="mt-1 w-full rounded-lg px-3 py-2"
							style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
						/>
					</label>
					<label class="block text-sm" style="color: var(--text-muted)">
						Win-back days threshold
						<input
							type="number"
							name="winbackDaysThreshold"
							value={settings.notifications.winbackDaysThreshold}
							min="1"
							max="365"
							class="mt-1 w-full rounded-lg px-3 py-2"
							style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
						/>
					</label>
				</div>

				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<label class="block text-sm" style="color: var(--text-muted)">
						Broadcast batch size
						<input
							type="number"
							name="broadcastBatchSize"
							value={settings.notifications.broadcastBatchSize}
							min="1"
							max="1000"
							class="mt-1 w-full rounded-lg px-3 py-2"
							style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
						/>
					</label>
					<label class="block text-sm" style="color: var(--text-muted)">
						Broadcast delay (ms)
						<input
							type="number"
							name="broadcastBatchDelayMs"
							value={settings.notifications.broadcastBatchDelayMs}
							min="100"
							max="60000"
							class="mt-1 w-full rounded-lg px-3 py-2"
							style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
						/>
					</label>
				</div>

				<button
					type="submit"
					class="rounded-full px-4 py-2 text-sm font-semibold text-white transition-all hover:scale-95 active:scale-90"
					style="background: var(--btn-primary-gradient)"
				>
					Save notification settings
				</button>
			</form>
		</section>
	</div>

	<section class="rounded-lg p-6" style="background: var(--bg-elev-1); border: 1px solid var(--border)">
		<h2 class="text-lg font-semibold" style="color: var(--text)">Payment Configuration</h2>
		<p class="mt-1 text-sm" style="color: var(--text-muted)">
			Payment mode remains strict env-controlled for safety, as approved.
		</p>
		<div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm">
			<div class="rounded-lg p-3" style="background: var(--bg); border: 1px solid var(--border)">
				<div style="color: var(--text-muted)">Payment mode</div>
				<div class="mt-1 font-semibold" style="color: var(--text)">{envConfig.paymentMode}</div>
			</div>
			<div class="rounded-lg p-3" style="background: var(--bg); border: 1px solid var(--border)">
				<div style="color: var(--text-muted)">Monnify base URL</div>
				<div class="mt-1 font-semibold break-all" style="color: var(--text)">{envConfig.monnifyBaseUrl}</div>
			</div>
			<div class="rounded-lg p-3" style="background: var(--bg); border: 1px solid var(--border)">
				<div style="color: var(--text-muted)">Runtime environment</div>
				<div class="mt-1 font-semibold" style="color: var(--text)">{envConfig.nodeEnv}</div>
			</div>
		</div>
	</section>
</div>
