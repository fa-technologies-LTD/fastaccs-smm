<script lang="ts">
	let skipSignature = $state(true);
	let signature = $state('');
	let webhookData = $state(`{
  "event": "charge.success",
  "data": {
    "reference": "WLT_aa8f8d42_1765292495004",
    "status": "success",
    "amount": "500000.00",
    "fee": 2000,
    "currency": "NGN",
    "customer": {
      "email": "adetayo.lasisi@gmail.com"
    }
  }
}`);
	let result = $state<any>(null);
	let loading = $state(false);

	async function testWebhook() {
		loading = true;
		result = null;

		try {
			const headers: Record<string, string> = {
				'Content-Type': 'application/json'
			};

			if (!skipSignature && signature) {
				headers['x-korapay-signature'] = signature;
			}

			const response = await fetch('/api/test/webhook', {
				method: 'POST',
				headers,
				body: webhookData
			});

			result = await response.json();
		} catch (error) {
			result = { error: error instanceof Error ? error.message : 'Request failed' };
		} finally {
			loading = false;
		}
	}

	async function testActualWebhook() {
		loading = true;
		result = null;

		try {
			const headers: Record<string, string> = {
				'Content-Type': 'application/json'
			};

			if (!skipSignature && signature) {
				headers['x-korapay-signature'] = signature;
			}

			const response = await fetch('/api/webhooks/korapay', {
				method: 'POST',
				headers,
				body: webhookData
			});

			result = await response.json();
		} catch (error) {
			result = { error: error instanceof Error ? error.message : 'Request failed' };
		} finally {
			loading = false;
		}
	}
</script>

<div class="min-h-screen bg-gray-50 px-4 py-8">
	<div class="mx-auto max-w-4xl">
		<h1 class="mb-8 text-3xl font-bold">Webhook Signature Tester</h1>

		<div class="mb-6 rounded-lg bg-white p-6 shadow">
			<div class="mb-4">
				<label class="flex items-center gap-2">
					<input type="checkbox" bind:checked={skipSignature} />
					<span class="text-sm">Skip signature verification (for testing)</span>
				</label>
			</div>

			{#if !skipSignature}
				<div class="mb-4">
					<label class="mb-2 block text-sm font-medium"
						>Webhook Signature (x-korapay-signature)</label
					>
					<input
						type="text"
						bind:value={signature}
						placeholder="Enter signature from Korapay webhook"
						class="w-full rounded-lg border px-4 py-2"
					/>
				</div>
			{/if}

			<div class="mb-4">
				<label class="mb-2 block text-sm font-medium">Webhook Payload</label>
				<textarea
					bind:value={webhookData}
					rows="15"
					class="w-full rounded-lg border px-4 py-2 font-mono text-sm"
				></textarea>
			</div>

			<div class="flex gap-4">
				<button
					onclick={testWebhook}
					disabled={loading}
					class="rounded-lg bg-blue-600 px-6 py-2 text-white transition-all hover:bg-blue-700 active:scale-95 disabled:bg-gray-300 disabled:active:scale-100"
				>
					{loading ? 'Testing...' : 'Test Endpoint'}
				</button>

				<button
					onclick={testActualWebhook}
					disabled={loading}
					class="rounded-lg bg-green-600 px-6 py-2 text-white transition-all hover:bg-green-700 active:scale-95 disabled:bg-gray-300 disabled:active:scale-100"
				>
					{loading ? 'Testing...' : 'Test Real Webhook'}
				</button>
			</div>
		</div>

		{#if result}
			<div class="rounded-lg bg-white p-6 shadow">
				<h2 class="mb-4 text-xl font-bold">Result</h2>
				<div class="space-y-2">
					<div>
						<span class="font-medium">Signature Valid:</span>
						<span class={result.signatureValid ? 'text-green-600' : 'text-red-600'}>
							{result.signatureValid ? '✓ Valid' : '✗ Invalid'}
						</span>
					</div>
					<div class="overflow-auto rounded bg-gray-50 p-4">
						<pre class="text-xs">{JSON.stringify(result, null, 2)}</pre>
					</div>
				</div>
			</div>
		{/if}

		<div class="mt-8 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
			<h3 class="mb-2 font-bold">How to use:</h3>
			<ol class="list-inside list-decimal space-y-1 text-sm">
				<li>Go to your Korapay dashboard transaction</li>
				<li>Find the webhook attempt in the Webhook/Metadata section</li>
				<li>Copy the signature from the request headers</li>
				<li>Copy the entire webhook payload</li>
				<li>Paste both here and click Test Webhook</li>
			</ol>
		</div>
	</div>
</div>

<style>
	input,
	textarea {
		font-family: 'Courier New', monospace;
	}
</style>
