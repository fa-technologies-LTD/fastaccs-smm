<script>
	import { Activity, ArrowUpRight } from "@lucide/svelte";

</script>
<a
	href="/admin/batches"
	class="group flex items-center justify-between rounded-lg border border-gray-200 p-4 transition-colors hover:border-blue-300 hover:bg-blue-50"
>
	<div class="flex items-center">
		<Activity class="mr-3 h-5 w-5 text-gray-400 group-hover:text-blue-600" />
		<div>
			<p class="font-medium text-gray-900">Batch Operations</p>
			<p class="text-sm text-gray-500">Bulk import accounts</p>
		</div>
	</div>
	<ArrowUpRight class="h-4 w-4 text-gray-400 group-hover:text-blue-600" />
</a>
