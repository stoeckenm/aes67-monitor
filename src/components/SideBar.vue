<template>
	<div
		id="sidebar-left"
		:class="{ sidebarCollapse: userData.settings.sidebarCollapsed }"
	>
		<a
			id="sidebar-logo"
			@click="setSidebarStatus(!userData.settings.sidebarCollapsed)"
		>
			<span class="text">Stream Monitor</span>
			<span class="icon"><i class="bi bi-soundwave"></i></span>
		</a>

		<ul>
			<!-- Always visible -->
			<li id="favorites-li" :class="{ active: page === 'favorites' }">
				<a @click="viewPage('favorites')">
					<i class="bi bi-star-fill"></i><span>Favorites</span>
					<span class="badge bg-primary">{{ favoriteCount }}</span>
				</a>
			</li>

			<!-- Other pages, visible only if adminMode or not on Favorites -->
			<template v-if="page !== 'favorites' || persistentData.adminMode">
				<li id="streams-li" :class="{ active: page === 'streams' }">
					<a @click="viewPage('streams')">
						<i class="bi bi-speaker"></i><span>Streams</span>
						<span class="badge bg-primary">
							{{ streamCount }}
						</span>
					</a>
				</li>

				<li id="devices-li" :class="{ active: page === 'devices' }">
					<a @click="viewPage('devices')">
						<i class="bi bi-hdd-network"></i><span>AES67 Devices</span>
						<span class="badge bg-primary" id="device-count">
							{{ searchDevices.length }}
						</span>
					</a>
				</li>

				<li id="interfaces-li" :class="{ active: page === 'interfaces' }">
					<a @click="viewPage('interfaces')">
						<i class="bi bi-pci-card-sound"></i><span>Audio Interfaces</span>
					</a>
				</li>

				<li id="settings-li" :class="{ active: page === 'settings' }">
					<a @click="viewPage('settings')">
						<i class="bi bi-gear"></i><span>Settings</span>
					</a>
				</li>
			</template>
		</ul>

		<!-- Admin Toggle Button -->
		<div id="admin-toggle" class="mt-auto p-2 text-center">
			<button
				class="btn btn-sm"
				:class="
					persistentData.adminMode ? 'btn-danger' : 'btn-outline-secondary'
				"
				@click="toggleAdminMode"
			>
				<i
					class="bi"
					:class="persistentData.adminMode ? 'bi-lock-fill' : 'bi-unlock'"
				></i>
				{{ persistentData.adminMode ? "Exit Admin" : "" }}
			</button>

			<!-- Password input form -->
			<div v-if="showPasswordInput && !persistentData.adminMode" class="mt-2">
				<input
					type="password"
					v-model="password"
					class="form-control form-control-sm mb-1"
					placeholder="Enter password"
					@keyup.enter="checkPassword"
				/>
				<button class="btn btn-sm btn-primary w-100" @click="checkPassword">
					Unlock
				</button>
				<div v-if="passwordError" class="text-danger mt-1 text-sm">
					Incorrect password
				</div>
			</div>
		</div>
	</div>
</template>
<script>
import {
	viewPage,
	userData,
	persistentData,
	page,
	setSidebarStatus,
	searchDevices,
	visibleStreams,
	streamCount,
} from "../app.js";
import { ref, computed } from "vue";

export default {
	name: "SideBar",
	setup() {
		// ---------- ADMIN MODE ----------
		const showPasswordInput = ref(false);
		const password = ref("");
		const passwordError = ref(false);

		if (persistentData.value.adminMode === undefined) {
			persistentData.value.adminMode = false;
		}

		function checkPassword() {
			if (password.value === "tomtom") {
				persistentData.value.adminMode = true;
				password.value = "";
				passwordError.value = false;
				showPasswordInput.value = false;
			} else {
				passwordError.value = true;
			}
		}

		function toggleAdminMode() {
			if (!persistentData.value.adminMode) {
				showPasswordInput.value = true;
			} else {
				persistentData.value.adminMode = false;
				showPasswordInput.value = false;
				viewPage("favorites");
			}
		}

		// ---------- FAVORITES ----------
		if (!userData.value.favorites) userData.value.favorites = [];

		// Compute favoriteCount from persistentData.favorites
		const favoriteCount = computed(() => userData.value.favorites.length);

		// Optional: reactive set of favorite IDs for fast lookup
		const favoriteIds = computed(
			() => new Set(userData.value.favorites.map((s) => s.id))
		);

		// Watch for changes to favorites to ensure reactive count
		// watch(
		// 	() => persistentData.value.favorites,
		// 	(newVal) => {
		// 		// reactive, so favoriteCount updates automatically
		// 	},
		// 	{ deep: true }
		// );

		return {
			viewPage,
			userData,
			persistentData,
			page,
			searchDevices,
			visibleStreams,
			setSidebarStatus,
			showPasswordInput,
			password,
			passwordError,
			streamCount,
			checkPassword,
			toggleAdminMode,
			favoriteCount,
			favoriteIds,
		};
	},
};
</script>

<style scoped>
#sidebar-left {
	display: flex;
	flex-direction: column;
	height: 100%;
}
#admin-toggle {
	border-top: 1px solid rgba(255, 255, 255, 0.1);
}
</style>
