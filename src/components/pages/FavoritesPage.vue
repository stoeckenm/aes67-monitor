<template>
	<div
		class="alert alert-primary"
		role="alert"
		v-if="resolvedFavorites.length === 0"
	>
		No favorite streams yet.
		<span v-if="adminMode">
			Star a stream on the Streams page to add it here.
		</span>
	</div>

	<!-- GRID of favorites -->
	<draggable
		v-if="resolvedFavorites.length > 0"
		v-model="order"
		item-key="id"
		:disabled="!adminMode"
		class="row g-3"
		@end="commitOrder"
	>
		<template #item="{ element: favorite }">
			<div class="col-12 col-sm-6 col-md-4 col-lg-3">
				<div
					class="card shadow-sm h-100"
					:class="{
						'draggable-active': adminMode,
						'favorite-offline': !favorite.online,
					}"
				>
					<div
						class="card-body d-flex justify-content-between align-items-start"
					>
						<div class="overflow-hidden">
							<h4 class="card-title text-truncate mb-1">
								{{ favorite.name }}
							</h4>
							<!-- A favorite whose stream is not being announced stays
							visible, so the operator can tell it is gone. -->
							<small v-if="!favorite.online" class="text-danger">
								Currently not on the network
							</small>
						</div>

						<div class="text-end flex-shrink-0">
							<button
								class="btn btn-sm me-1"
								:class="{
									'btn-success': !isPlaying(favorite.id),
									'btn-danger': isPlaying(favorite.id),
								}"
								:disabled="!canPlay(favorite)"
								@click="play(favorite)"
							>
								<i v-if="isPlaying(favorite.id)" class="bi bi-stop-fill"></i>
								<i v-else class="bi bi-play-fill"></i>
							</button>

							<button
								v-if="adminMode"
								class="btn btn-sm btn-outline-danger"
								@click="remove(favorite)"
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
import { ref, watch } from "vue";
import {
	adminMode,
	playing,
	playStream,
	stopStream,
	resolvedFavorites,
	reorderFavorites,
	removeFavorite,
	isPlaying,
	getCurrentSupportedSampleRates,
} from "../../app.js";

export default {
	name: "FavoritesPage",
	components: { draggable },
	setup() {
		// Local mirror for the drag handler, kept in step with the store
		const order = ref([...resolvedFavorites.value]);
		watch(resolvedFavorites, (next) => {
			order.value = [...next];
		});

		const commitOrder = () => {
			reorderFavorites(order.value.map((favorite) => favorite.id));
		};

		const canPlay = (favorite) =>
			favorite.playable &&
			getCurrentSupportedSampleRates().includes(favorite.stream?.samplerate);

		const play = (favorite) => {
			if (isPlaying(favorite.id)) {
				stopStream();
				return;
			}
			if (favorite.stream) playStream(favorite.stream);
		};

		const remove = (favorite) => {
			if (isPlaying(favorite.id)) stopStream();
			removeFavorite(favorite.id);
		};

		return {
			order,
			resolvedFavorites,
			adminMode,
			playing,
			isPlaying,
			canPlay,
			play,
			remove,
			commitOrder,
		};
	},
};
</script>

<style scoped>
.card {
	transition:
		transform 0.15s ease,
		box-shadow 0.15s ease;
	border-radius: 0.75rem;
}
.card:hover {
	transform: translateY(-3px);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
.card-title {
	font-weight: 600;
}
.favorite-offline {
	opacity: 0.6;
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
