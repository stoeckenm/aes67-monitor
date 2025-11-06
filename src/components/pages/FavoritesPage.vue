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
					<div
						class="card-body d-flex justify-content-between align-items-start"
					>
						<div>
							<h4 class="card-title text-truncate mb-1">
								{{ getFriendlyName(stream) }}
							</h4>
						</div>

						<div class="text-end">
							<!-- Play / Stop Button -->
							<button
								class="btn btn-sm me-1"
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

							<!-- Remove Button (Admin only) -->
							<button
								v-if="persistentData.adminMode"
								class="btn btn-sm btn-outline-danger"
								@click="removeFavorite(stream)"
							>
								<i class="bi bi-trash"></i>
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
	streamCount,
	playing,
	playStream,
	visibleStreams,
	persistentData,
	getCurrentSupportedSampleRates,
	updatePersistentData,
	stopStream,
} from "../../app.js";
import { ref, watch } from "vue";

export default {
	name: "FavoritesPage",
	components: { draggable },
	setup() {
		/* ---------- FAVORITES ---------- */
		if (!persistentData.value.favorites) persistentData.value.favorites = [];

		// Use full stream objects
		const favoriteStreams = ref([...persistentData.value.favorites]);

		// Initialize saved order
		if (!persistentData.value.settings.favoritesOrder)
			persistentData.value.settings.favoritesOrder = [];
		const savedOrder = ref([...persistentData.value.settings.favoritesOrder]);

		// Sorted streams for grid
		const sortedStreamsLocal = ref([]);

		function sortStreamsBySavedOrder() {
			const streamsCopy = [...favoriteStreams.value];
			streamsCopy.sort((a, b) => {
				const indexA = savedOrder.value.findIndex((id) => id === a.id);
				const indexB = savedOrder.value.findIndex((id) => id === b.id);
				if (indexA === -1 && indexB === -1) return 0;
				if (indexA === -1) return 1;
				if (indexB === -1) return -1;
				return indexA - indexB;
			});
			sortedStreamsLocal.value = streamsCopy;
		}

		sortStreamsBySavedOrder();

		/* ---------- FAVORITE MANAGEMENT ---------- */
		function toggleFavorite(stream) {
			const index = favoriteStreams.value.findIndex((s) => s.id === stream.id);
			if (index === -1) {
				favoriteStreams.value.push(stream);
			} else {
				favoriteStreams.value.splice(index, 1);
			}
			persistentData.value.favorites = [...favoriteStreams.value];
			updatePersistentData("favorites");
			sortStreamsBySavedOrder();
		}

		function isFavorite(stream) {
			return favoriteStreams.value.some((s) => s.id === stream.id);
		}

		/* ---------- SORT ORDER MANAGEMENT ---------- */
		function saveOrder() {
			const order = sortedStreamsLocal.value.map((s) => s.id);
			savedOrder.value = order;
			persistentData.value.settings.favoritesOrder = order;
			updatePersistentData("settings");
		}

		/* ---------- FRIENDLY NAMES ---------- */
		function getFriendlyName(stream) {
			const names = persistentData.value.settings.friendlyNames || {};
			return names[stream.id]?.trim() || stream.name;
		}

		// Watch for external changes to favorites
		watch(
			() => persistentData.value.favorites,
			(newFavs) => {
				favoriteStreams.value = [...newFavs];
				sortStreamsBySavedOrder();
			},
			{ deep: true }
		);

		function removeFavorite(stream) {
			if (stream.id === playing.value) {
				stopStream();
			}

			const index = favoriteStreams.value.findIndex((s) => s.id === stream.id);
			if (index !== -1) {
				favoriteStreams.value.splice(index, 1);
				persistentData.value.favorites = [...favoriteStreams.value];
				updatePersistentData("favorites");
				sortStreamsBySavedOrder();
			}
		}

		return {
			favoriteStreams,
			sortedStreamsLocal,
			saveOrder,
			getFriendlyName,
			streamCount,
			playing,
			playStream,
			visibleStreams,
			persistentData,
			getCurrentSupportedSampleRates,
			toggleFavorite,
			isFavorite,
			removeFavorite,
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
