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

	<!-- Grid of favorites -->
	<div v-if="favoriteStreams.length > 0" class="row g-3">
		<div
			v-for="stream in sortedStreams"
			:key="stream.id"
			class="col-12 col-sm-6 col-md-4 col-lg-3"
		>
			<div class="card shadow-sm h-100">
				<div class="card-body d-flex flex-column justify-content-between">
					<div>
						<h6 class="card-title text-truncate mb-1">
							{{ getFriendlyName(stream) }}
						</h6>
						<small class="text-muted d-block text-truncate">
							{{ stream.origin.address }}
						</small>
						<small v-if="stream.isSupported" class="text-muted d-block">
							{{ stream.codec }} / {{ stream.samplerate }}Hz /
							{{ stream.channels }}
						</small>
						<small v-else class="text-danger">Unsupported</small>
					</div>

					<div class="mt-3 text-end">
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
	</div>
</template>

<script>
import {
	searchStreams,
	streams,
	streamCount,
	playStream,
	visibleStreams,
	playing,
	persistentData,
	streamIndex,
	getCurrentSupportedSampleRates,
} from "../../app.js";
import { ref, computed } from "vue";

export default {
	name: "FavoritesPage",
	setup() {
		const sortKey = ref("name");
		const sortOrder = ref(1);

		// ✅ Load favorites from localStorage
		const favoriteIds = ref(
			new Set(JSON.parse(localStorage.getItem("favorites") || "[]"))
		);

		function setSort(key) {
			if (sortKey.value === key) {
				sortOrder.value = -sortOrder.value;
			} else {
				sortKey.value = key;
				sortOrder.value = 1;
			}
		}

		// Load or assign friendly names from localStorage
		function getFriendlyName(stream) {
			const key = `friendly_name_${stream.id}`;

			const stored = localStorage.getItem(key);

			if (stored) {
				stream.friendly_name = stored;
			} else if (!stream.friendly_name) {
				stream.friendly_name = "";
			}
			return stream.friendly_name ? `${stream.friendly_name}` : stream.name;
		}

		function getSortValue(stream, key) {
			switch (key) {
				case "name":
					return stream.name;
				case "address":
					return stream.origin.address;
				case "format":
					return stream.isSupported
						? `${stream.codec} ${stream.samplerate}Hz ${stream.channels}`
						: "";
				default:
					return stream[key];
			}
		}

		// ✅ Filter to only favorite streams
		const favoriteStreams = computed(() => {
			return searchStreams().filter((s) => favoriteIds.value.has(s.id));
		});

		// ✅ Apply sorting to favorites
		const sortedStreams = computed(() => {
			return favoriteStreams.value.slice().sort((a, b) => {
				let propA = getSortValue(a, sortKey.value);
				let propB = getSortValue(b, sortKey.value);
				if (typeof propA === "string") propA = propA.toLowerCase();
				if (typeof propB === "string") propB = propB.toLowerCase();
				if (propA < propB) return -1 * sortOrder.value;
				if (propA > propB) return 1 * sortOrder.value;
				return 0;
			});
		});

		return {
			sortedStreams,
			favoriteStreams,
			sortKey,
			sortOrder,
			setSort,
			searchStreams,
			streams,
			streamCount,
			playStream,
			getFriendlyName,
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
</style>
