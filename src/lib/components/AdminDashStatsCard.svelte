<script>
  let {title, status, subtitle, children} = $props();
</script>


<div class="group rounded-lg border border-gray-200 bg-white p-4 shadow sm:p-6">
	<div class="flex items-center">
		<div class="rounded-lg bg-blue-50 p-2 sm:p-3">
    {children()}
		</div>
		<div class="ml-3 min-w-0 flex-1 sm:ml-4">
			<p class="text-xs font-medium text-gray-500 sm:text-sm">{title}</p>
			<p class="text-xl font-bold text-gray-900 sm:text-2xl">{status}</p>
			<div class="mt-1 flex items-center">
				<span class="text-xs text-gray-600 sm:text-sm">{subtitle}</span>
			</div>
		</div>
	</div>
</div>
