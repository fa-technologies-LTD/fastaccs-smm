<script lang="ts">
	import { beforeNavigate, afterNavigate } from '$app/navigation';

	let show = $state(false);
	let progress = $state(0);
	let progressInterval: any = null;

	beforeNavigate(() => {
		show = true;
		progress = 0;

		if (progressInterval) clearInterval(progressInterval);

		progressInterval = setInterval(() => {
			if (progress < 90) {
				progress += Math.random() * 15;
				if (progress > 90) progress = 90;
			}
		}, 150);
	});

	afterNavigate(() => {
		if (progressInterval) {
			clearInterval(progressInterval);
		}
		progress = 100;

		setTimeout(() => {
			show = false;
			progress = 0;
		}, 400);
	});
</script>

{#if show}
	<div
		class="fixed top-0 right-0 left-0 z-[9999] h-1 bg-gradient-to-r from-green-600 to-blue-600 shadow-lg"
		style="width: {progress}%; transition: width 0.3s ease-out;"
	></div>
{/if}
