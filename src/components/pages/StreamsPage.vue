<template>
	<div class="alert alert-primary" role="alert" v-if="visibleStreams == 0">
		No streams found.
		<span v-if="streamCount == 0">
			It might take a few seconds for streams to show up.
		</span>
	</div>

	<table class="table table-sm table-borderless" id="streams-table">
		<thead v-if="visibleStreams > 0">
			<tr>
				<th>Friendly Name</th>
				<th @click="setSort('name')" style="cursor: pointer">
					Name
					<span v-if="sortKey === 'name'">{{
						sortOrder === 1 ? "▲" : "▼"
					}}</span>
				</th>
				<th @click="setSort('tags')" style="cursor: pointer">
					Tags
					<span v-if="sortKey === 'tags'">{{
						sortOrder === 1 ? "▲" : "▼"
					}}</span>
				</th>
				<th @click="setSort('info')" style="cursor: pointer">
					Info
					<span v-if="sortKey === 'info'">{{
						sortOrder === 1 ? "▲" : "▼"
					}}</span>
				</th>
				<th @click="setSort('address')" style="cursor: pointer">
					Device Address
					<span v-if="sortKey === 'address'">{{
						sortOrder === 1 ? "▲" : "▼"
					}}</span>
				</th>
				<th @click="setSort('format')" style="cursor: pointer">
					Format
					<span v-if="sortKey === 'format'">{{
						sortOrder === 1 ? "▲" : "▼"
					}}</span>
				</th>
				<th @click="setSort('mcast')" style="cursor: pointer">
					Multicast
					<span v-if="sortKey === 'mcast'">{{
						sortOrder === 1 ? "▲" : "▼"
					}}</span>
				</th>
				<th v-if="streamCount > 0">Channel</th>
				<th></th>
				<th></th>
				<th></th>
			</tr>
		</thead>

		<tbody>
			<template v-for="stream in sortedStreams" :key="stream.id">
				<tr>
					<td>{{ stream.friendlyName || "-" }}</td>
					<td>{{ stream.name }}</td>
					<td>
						<span class="badge bg-primary me-1" v-if="stream.dante">Dante</span>
						<span
							class="badge bg-primary me-1"
							v-if="stream.groups?.[0]?.type === 'DUP'"
							>2022-7</span
						>
						<span class="badge bg-secondary me-1" v-if="stream.manual"
							>Manual</span
						>
						<span class="badge bg-secondary me-1" v-if="stream.announce"
							>SAP</span
						>
					</td>
					<td>{{ stream.media?.[0]?.description || "Not Available" }}</td>
					<td>{{ stream.origin?.address || "Not Available" }}</td>
					<td>
						<span v-if="stream.isSupported" class="copy">
							{{ stream.codec }} / {{ stream.samplerate }}Hz /
							{{ stream.channels }}
						</span>
					</td>
					<td>
						<span v-if="stream.media.length > 1 && stream.isSupported">
							<select
								class="form-select form-select-sm"
								v-model="streamIndex[stream.id]"
								:disabled="stream.id === playing"
							>
								<option
									v-for="(media, index) in stream.media"
									:key="index"
									:value="index"
								>
									{{ media.connection.ip.split("/")[0] }}:{{ media.port }}
								</option>
							</select>
						</span>
						<span v-else class="copy">
							{{ stream.mcast }}:{{ stream.media[0]?.port || "Not Available" }}
						</span>
					</td>

					<td v-if="streamCount > 0">
						<select
							class="form-select form-select-sm"
							v-if="stream.isSupported"
							v-model="selectedChannel[stream.id]"
							:disabled="stream.id === playing"
						>
							<option
								v-for="value in getChannelSelectValues(stream)"
								:key="value.value"
								:value="value.value"
							>
								{{ value.string }}
							</option>
						</select>
						<small
							v-else
							class="d-inline-flex px-2 py-1 fw-semibold text-danger-emphasis bg-danger-subtle border border-danger-subtle rounded-2"
						>
							{{ stream.unsupportedReason || "Not Supported" }}
						</small>
					</td>

					<!-- PLAY -->
					<td>
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
					</td>

					<!-- FAVORITE -->
					<td>
						<button
							class="btn btn-sm btn-outline-warning"
							@click="toggleFavorite(stream)"
						>
							<i
								class="bi"
								:class="
									isFavorite(stream) ? 'bi-star-fill text-warning' : 'bi-star'
								"
							></i>
						</button>
					</td>

					<!-- INFO PAGE -->
					<td>
						<button class="btn btn-sm btn-primary" @click="viewStream(stream)">
							<i class="bi bi-info-circle-fill"></i>
						</button>
					</td>
				</tr>
			</template>
		</tbody>
	</table>
</template>

<script>
import {
	searchStreams,
	streams,
	streamCount,
	viewStream,
	getChannelSelectValues,
	selectedChannel,
	playStream,
	visibleStreams,
	playing,
	userData,
	streamIndex,
	getCurrentSupportedSampleRates,
	saveUserConfig,
} from "../../app.js";
import { ref, computed } from "vue";

export default {
	name: "StreamsPage",
	setup() {
		/* ---------- Sorting ---------- */
		const sortKey = ref("name");
		const sortOrder = ref(1);

		function setSort(key) {
			if (sortKey.value === key) sortOrder.value *= -1;
			else {
				sortKey.value = key;
				sortOrder.value = 1;
			}
		}

		function getSortValue(stream, key) {
			switch (key) {
				case "name":
					return stream.name || "";
				case "mcast":
					return stream.mcast || "";
				case "address":
					return stream.origin?.address || "";
				case "format": {
					if (stream.isSupported) {
						return `${stream.codec || ""} ${stream.samplerate || ""}Hz ${
							stream.channels || ""
						}`;
					}
					return "";
				}
				case "info":
					return stream.media?.[0]?.description || "";
				case "tags": {
					let tags = "";
					if (stream.dante) tags += "Dante ";
					if (stream.manual) tags += "Manual ";
					if (stream.announce) tags += "SAP ";
					if (stream.groups?.[0]?.type === "DUP") tags += "2022-7 ";
					return tags.trim();
				}
				default:
					return stream[key] || "";
			}
		}

		/* ---------- FAVORITES MANAGEMENT ---------- */
		if (!userData.value.favorites) userData.value.favorites = [];

		// Make a reactive copy of favorites
		const favorites = ref([...userData.value.favorites]);

		function storeFavorites() {
			userData.value.favorites = [...favorites.value];
			saveUserConfig();
		}

		function toggleFavorite(stream) {
			const index = favorites.value.findIndex((s) => s.id === stream.id);
			if (index === -1) {
				// Add new favorite at the end using order field
				stream.order = favorites.value.length;
				favorites.value.push(stream);
			} else {
				favorites.value.splice(index, 1);
			}
			storeFavorites();
		}

		function isFavorite(stream) {
			return favorites.value.some((s) => s.id === stream.id);
		}

		/* ---------- COMBINED STREAMS WITH FAVORITE ORDER ---------- */
		const sortedStreams = computed(() => {
			// Combine favorites and searchStreams
			const combined = [...favorites.value, ...searchStreams()];

			// Remove duplicates by stream.id, keeping the first occurrence (favorites first)
			const seen = new Set();
			const uniqueStreams = combined.filter((s) => {
				if (seen.has(s.id)) return false;
				seen.add(s.id);
				return true;
			});

			// Sort favorites by 'order' first
			const favoritesSet = new Set(favorites.value.map((f) => f.id));
			uniqueStreams.sort((a, b) => {
				const aFav = favoritesSet.has(a.id);
				const bFav = favoritesSet.has(b.id);

				if (aFav && bFav) {
					// Both favorites: sort by order field
					return (a.order || 0) - (b.order || 0);
				}
				if (aFav) return -1; // favorites come first
				if (bFav) return 1;

				// Non-favorites: sort by dynamic sortKey/Order
				let A = getSortValue(a, sortKey.value);
				let B = getSortValue(b, sortKey.value);
				if (typeof A === "string") A = A.toLowerCase();
				if (typeof B === "string") B = B.toLowerCase();
				return A < B ? -1 * sortOrder.value : A > B ? 1 * sortOrder.value : 0;
			});

			return uniqueStreams;
		});

		return {
			sortedStreams,
			setSort,
			sortKey,
			sortOrder,
			searchStreams,
			streams,
			streamCount,
			viewStream,
			getChannelSelectValues,
			selectedChannel,
			playStream,
			visibleStreams,
			playing,
			streamIndex,
			toggleFavorite,
			isFavorite,
			getCurrentSupportedSampleRates,
		};
	},
};
</script>

<style scoped>
tbody tr td {
	transition: background-color 0.2s ease;
}
tbody tr:hover td {
	background-color: #f0f8ff;
}
</style>
