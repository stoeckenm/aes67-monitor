<template>
	<div
		class="alert alert-primary"
		role="alert"
		v-if="favoriteStreams.length === 0"
	>
		No favorite streams found.
		<span v-if="streamCount == 0">
			It might take a few seconds for streams to show up.
		</span>
	</div>

	<!-- GRID of favorites -->
	<draggable
		v-if="sortedStreamsLocal.length > 0"
		v-model="sortedStreamsLocal"
		item-key="id"
		:disabled="!persistentData.adminMode"
		class="row g-3"
		@end="saveOrder"
	>
		<template #item="{ element: stream }">
			<div class="col-12 col-sm-6 col-md-4 col-lg-3">
				<div
					class="card shadow-sm h-100"
					:class="{ 'draggable-active': persistentData.adminMode }"
				>
					<div class="card-body d-flex justify-content-between">
						<div>
							<h4 class="card-title text-truncate mb-1">
								{{ getFriendlyName(stream) }}
							</h4>
							<!-- <small class="text-muted d-block text-truncate">
								{{ stream.origin.address }}
							</small> -->
							<!-- <small v-if="stream.isSupported" class="text-muted d-block">
								{{ stream.codec }} / {{ stream.samplerate }}Hz /
								{{ stream.channels }}
							</small>
							<small v-else class="text-danger">Unsupported</small> -->
						</div>

						<div class="text-end">
							<button
								class="btn btn-sm"
								:class="{
									'btn-success': stream.id !== playing,
									'btn-danger': stream.id === playing,
								}"
								@click="playStream(stream)"
								v-if="stream.isSupported"
								:disabled="
									!getCurrentSupportedSampleRates().includes(stream.samplerate)
								"
							>
								<i v-if="stream.id === playing" class="bi bi-stop-fill"></i>
								<i v-else class="bi bi-play-fill"></i>
							</button>
						</div>
					</div>
				</div>
			</div>
		</template>
	</draggable>
</template>

<script>
import draggable from "vuedraggable";
import {
	searchStreams,
	streams,
	streamCount,
	playStream,
	visibleStreams,
	getChannelSelectValues,
	playing,
	persistentData,
	streamIndex,
	getCurrentSupportedSampleRates,
} from "../../app.js";
import { ref, computed, watch } from "vue";

export default {
	name: "FavoritesPage",
	components: { draggable },
	setup() {
		// Load favorite IDs from localStorage
		const favoriteIds = ref(
			JSON.parse(localStorage.getItem("favorites") || "[]")
		);

		// Filter all streams → only favorites
		const favoriteStreams = computed(() =>
			searchStreams().filter((s) => favoriteIds.value.includes(s.id))
		);

		// Load saved drag order
		const savedOrder = ref(
			JSON.parse(localStorage.getItem("favoritesOrder") || "[]")
		);

		// Sort favorites according to saved order
		const sortedStreamsLocal = ref([]);

		function sortStreamsBySavedOrder() {
			const streams = [...favoriteStreams.value];
			streams.sort((a, b) => {
				const indexA = savedOrder.value.indexOf(a.id);
				const indexB = savedOrder.value.indexOf(b.id);
				// Streams not yet saved should go to the bottom
				if (indexA === -1 && indexB === -1) return 0;
				if (indexA === -1) return 1;
				if (indexB === -1) return -1;
				return indexA - indexB;
			});
			sortedStreamsLocal.value = streams;
		}

		// Initialize
		sortStreamsBySavedOrder();

		// React to favorites changing (e.g., added/removed)
		watch(favoriteStreams, () => {
			sortStreamsBySavedOrder();
		});

		// Save order when drag ends
		function saveOrder() {
			const order = sortedStreamsLocal.value.map((s) => s.id);
			localStorage.setItem("favoritesOrder", JSON.stringify(order));
			savedOrder.value = order;
		}

		function getFriendlyName(stream) {
			const storedName = localStorage.getItem(`friendly_name_${stream.id}`);
			if (storedName && storedName.trim().length > 0) {
				return `${storedName}`;
			}
			return stream.name;
		}

		return {
			favoriteStreams,
			sortedStreamsLocal,
			saveOrder,
			getFriendlyName,
			searchStreams,
			streams,
			streamCount,
			playStream,
			getChannelSelectValues,
			visibleStreams,
			playing,
			persistentData,
			streamIndex,
			getCurrentSupportedSampleRates,
		};
	},
};
</script>

<style scoped>
.card {
	transition: transform 0.15s ease, box-shadow 0.15s ease;
	border-radius: 0.75rem;
}
.card:hover {
	transform: translateY(-3px);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
.card-title {
	font-weight: 600;
}
.draggable-active {
	cursor: grab;
	border: 2px dashed #0d6efd;
}
.draggable-active:active {
	background-color: rgb(240, 240, 240);
	cursor: grabbing;
}
</style>
