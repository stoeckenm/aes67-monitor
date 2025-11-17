<template>
	<div
		class="alert alert-primary"
		role="alert"
		v-if="sortedStreamsLocal?.length === 0"
	>
		No favorite streams found.
		<span v-if="streamCount == 0">
			It might take a few seconds for streams to show up.
		</span>
	</div>

	<!-- GRID of favorites -->
	<draggable
		v-if="sortedStreamsLocal?.length > 0"
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
								{{ stream.friendlyName || stream.name || "-" }}
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
	userData,
	getCurrentSupportedSampleRates,
	saveUserConfig,
	stopStream,
} from "../../app.js";
import { ref, watch } from "vue";

export default {
	name: "FavoritesPage",
	components: { draggable },
	setup() {
		/* ---------- FAVORITES INITIALIZATION ---------- */
		if (!userData.value.favorites) userData.value.favorites = [];

		// Ensure each favorite has an order field
		userData.value.favorites.forEach((f, idx) => {
			if (f.order === undefined) f.order = idx;
		});

		// Reactive local copy for draggable
		const sortedStreamsLocal = ref(
			[...userData.value.favorites].sort((a, b) => a.order - b.order)
		);

		/* ---------- KEEP LOCAL COPY IN SYNC ---------- */
		watch(
			() => userData.value.favorites,
			(newFavs) => {
				sortedStreamsLocal.value = [...newFavs].sort(
					(a, b) => a.order - b.order
				);
			},
			{ deep: true, immediate: true }
		);

		/* ---------- SAVE ORDER AFTER DRAG ---------- */
		function saveOrder() {
			// Update order based on current local array
			sortedStreamsLocal.value.forEach((s, idx) => {
				s.order = idx;
			});

			// Persist to main favorites array
			userData.value.favorites = [...sortedStreamsLocal.value];
			saveUserConfig();
		}

		/* ---------- FAVORITE MANAGEMENT ---------- */
		function toggleFavorite(stream) {
			const index = userData.value.favorites.findIndex(
				(s) => s.id === stream.id
			);
			if (index === -1) {
				// Add new favorite at the end
				stream.order = userData.value.favorites.length;
				userData.value.favorites.push(stream);
			} else {
				userData.value.favorites.splice(index, 1);
			}

			// Sync local array
			sortedStreamsLocal.value = [...userData.value.favorites].sort(
				(a, b) => a.order - b.order
			);

			saveUserConfig();
		}

		function removeFavorite(stream) {
			if (stream.id === playing.value) stopStream();

			const index = userData.value.favorites.findIndex(
				(s) => s.id === stream.id
			);
			if (index !== -1) {
				userData.value.favorites.splice(index, 1);

				// Recalculate order for remaining favorites
				userData.value.favorites.forEach((f, idx) => (f.order = idx));
				sortedStreamsLocal.value = [...userData.value.favorites];

				saveUserConfig();
			}
		}

		function isFavorite(stream) {
			return userData.value.favorites.some((s) => s.id === stream.id);
		}

		/* ---------- RETURN TO TEMPLATE ---------- */
		return {
			sortedStreamsLocal,
			saveOrder,
			removeFavorite,
			toggleFavorite,
			isFavorite,
			streamCount,
			playing,
			playStream,
			visibleStreams,
			userData,
			persistentData,
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
