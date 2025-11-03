<template>
	<div
		id="sidebar-left"
		:class="{ sidebarCollapse: persistentData.settings.sidebarCollapsed }"
	>
		<a
			id="sidebar-logo"
			@click="setSidebarStatus(!persistentData.settings.sidebarCollapsed)"
		>
			<span class="text">Stream Monitor</span>
			<span class="icon"><i class="bi bi-soundwave"></i></span>
		</a>

		<ul>
			<!-- Always visible -->
			<li id="favorites-li" :class="{ active: page === 'favorites' }">
				<a @click="viewPage('favorites')">
					<i class="bi bi-star-fill"></i><span>Favorites</span>
					<span class="badge bg-primary">
						{{ favoriteCount }}
					</span>
				</a>
			</li>

			<!-- Other pages, visible only if adminMode or not on Favorites -->
			<template v-if="page !== 'favorites' || adminMode">
				<li id="streams-li" :class="{ active: page === 'streams' }">
					<a @click="viewPage('streams')">
						<i class="bi bi-speaker"></i><span>Streams</span>
						<span
							class="badge bg-primary"
							@click.stop="streamCountDisplay = !streamCountDisplay"
						>
							<template v-if="streamCountDisplay">{{
								visibleStreams
							}}</template>
							<template v-else>{{ channelCount }}</template>
						</span>
					</a>
				</li>

				<li id="devices-li" :class="{ active: page === 'devices' }">
					<a @click="viewPage('devices')">
						<i class="bi bi-hdd-network"></i><span>Devices</span>
						<span class="badge bg-primary" id="device-count">{{
							searchDevices.length
						}}</span>
					</a>
				</li>

				<li id="interfaces-li" :class="{ active: page === 'interfaces' }">
					<a @click="viewPage('interfaces')">
						<i class="bi bi-pci-card-sound"></i><span>Interfaces</span>
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
				:class="adminMode ? 'btn-danger' : 'btn-outline-secondary'"
				@click="toggleAdminMode"
			>
				<i class="bi" :class="adminMode ? 'bi-lock-fill' : 'bi-unlock'"></i>
				{{ adminMode ? "Exit Admin" : "Admin" }}
			</button>

			<!-- Password input form -->
			<div v-if="showPasswordInput && !adminMode" class="mt-2">
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
	persistentData,
	page,
	streamCountDisplay,
	channelCount,
	setSidebarStatus,
	searchStreams,
	searchDevices,
	visibleStreams,
} from "../app.js";
import { ref, computed } from "vue";

export default {
	name: "SideBar",
	setup() {
		const adminMode = ref(
			JSON.parse(localStorage.getItem("adminMode") || "false")
		);
		const showPasswordInput = ref(false);
		const password = ref("");
		const passwordError = ref(false);

		const favoriteIds = ref(
			new Set(JSON.parse(localStorage.getItem("favorites") || "[]"))
		);

		const favoriteCount = computed(() => {
			// Count only streams that exist in current searchStreams
			return searchStreams().filter((s) => favoriteIds.value.has(s.id)).length;
		});

		// Check password and enable admin mode
		function checkPassword() {
			if (password.value === "testtest") {
				adminMode.value = true;
				localStorage.setItem("adminMode", "true");
				password.value = "";
				passwordError.value = false;
				showPasswordInput.value = false;
			} else {
				passwordError.value = true;
			}
		}

		// Toggle admin mode
		function toggleAdminMode() {
			if (!adminMode.value) {
				// Show password input
				showPasswordInput.value = true;
			} else {
				// Exit admin mode: force Favorites page and lock menu
				adminMode.value = false;
				localStorage.setItem("adminMode", "false");
				showPasswordInput.value = false;
				viewPage("favorites"); // go back to favorites
			}
		}

		return {
			viewPage,
			persistentData,
			page,
			streamCountDisplay,
			channelCount,
			searchDevices,
			visibleStreams,
			setSidebarStatus,
			adminMode,
			showPasswordInput,
			password,
			passwordError,
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
