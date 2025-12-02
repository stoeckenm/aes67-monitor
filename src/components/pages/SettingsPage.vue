<template>
	<div class="row">
		<div class="col-4">
			<h5 class="mb-3">Network</h5>
			<select
				class="form-select"
				id="networkSelect"
				v-model="persistentData.network.currentInterface"
				@change="savePersistentConfig()"
			>
				<option
					v-for="networkInterface in networkInterfaces"
					:key="networkInterface.name"
					:value="networkInterface.address"
				>
					{{ networkInterface.name }}: {{ networkInterface.address }}
				</option>
			</select>
		</div>
		<div class="col-4">
			<h5 class="mb-3">Audio</h5>
			<h6>Buffering</h6>
			<div class="form-check">
				<input
					class="form-check-input"
					type="checkbox"
					id="check-buffering"
					@change="
						updateAudioInterface();
						savePersistentConfig();
					"
					v-model="persistentData.settings.bufferEnabled"
				/>
				<label class="form-check-label" for="check-buffering">
					Enable Buffering
				</label>
			</div>
			<div class="input-group mb-3">
				<input
					type="number"
					v-model="persistentData.settings.bufferSize"
					@change="savePersistentConfig()"
					class="form-control"
				/>
				<span class="input-group-text">packets</span>
			</div>
			<h6>Hardware</h6>
			<div class="form-check mb-3">
				<input
					class="form-check-input"
					type="checkbox"
					id="check-follow-system-audio"
					v-model="persistentData.settings.followSystemAudio"
					@change="
						updateAudioInterface();
						savePersistentConfig();
					"
				/>
				<label class="form-check-label" for="check-follow-system-audio">
					Always use default audio
					<span class="form-text">(follow system audio)</span>
				</label>
			</div>
			<div v-if="persistentData.settings.storedAudioInterface">
				<h6 class="">Preferred Audio Interface</h6>
				<div>- {{ persistentData.settings.storedAudioInterface.name }}</div>
				<div class="form-text">
					Will be used if availible. Overwritten by "follow system audio".
					Select in Audio Interfaces page.
				</div>
			</div>
		</div>
		<div class="col-4">
			<h5 class="mb-3">Other</h5>
			<div class="form-check mb-3">
				<input
					class="form-check-input"
					type="checkbox"
					id="check-unsupported"
					v-model="persistentData.settings.hideUnsupported"
					@change="savePersistentConfig()"
				/>
				<label class="form-check-label" for="check-unsupported">
					Hide unsupported Streams
				</label>
			</div>
			<label for="sdp-delete-timeout-input" class="form-label"
				>SDP Delete Timeout</label
			>
			<div class="input-group mb-3">
				<input
					type="number"
					id="sdp-delete-timeout-input"
					v-model="persistentData.settings.sdpDeleteTimeout"
					@change="savePersistentConfig()"
					class="form-control"
				/>
				<span class="input-group-text">seconds</span>
			</div>
			<div id="sdp-delete-text" class="form-text mb-3">
				Streams will be removed if no new announcement is received within
				timeout
			</div>
			<div class="form-check mb-3">
				<input
					class="form-check-input"
					type="checkbox"
					id="check-sidebar-collapsed"
					v-model="userData.settings.sidebarCollapsed"
					@change="saveUserConfig()"
				/>
				<label class="form-check-label" for="check-sidebar-collapsed">
					Collapse Sidebar
				</label>
			</div>
			<h6 class="mt-4">Set Admin Password</h6>
			<div class="input-group mb-3">
				<input
					type="password"
					class="form-control"
					placeholder="Enter new password"
					v-model="passwordInput"
				/>
				<button class="btn btn-primary" @click="applyPassword">Save</button>
			</div>
			<div class="form-text">
				Password is stored hashed. Leave blank to keep the existing password.
			</div>
			<div class="form-text text-success" v-if="passwordFeedback">
				{{ passwordFeedback }}
			</div>
		</div>
	</div>
</template>

<script>
import {
	persistentData,
	networkInterfaces,
	updateAudioInterface,
	savePersistentConfig,
	saveUserConfig,
	userData,
} from "../../app.js";

import { ref } from "vue";

// SHA-256 hashing using Web Crypto API
async function hashPassword(password) {
	const enc = new TextEncoder().encode(password);
	const hashBuffer = await crypto.subtle.digest("SHA-256", enc);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
	name: "SettingsPage",
	setup() {
		const passwordInput = ref("");
		const passwordFeedback = ref("");

		const applyPassword = async () => {
			if (!passwordInput.value) {
				// Empty input → clear the passwordHash
				persistentData.value.passwordHash = null;
				passwordFeedback.value = "Password cleared successfully";
			} else {
				const hash = await hashPassword(passwordInput.value);
				persistentData.value.passwordHash = hash;
				passwordFeedback.value = "Password saved successfully";
			}

			passwordInput.value = "";
			savePersistentConfig();

			// Clear feedback after 3 seconds
			setTimeout(() => {
				passwordFeedback.value = "";
			}, 3000);
		};

		return {
			persistentData,
			networkInterfaces,
			updateAudioInterface,
			savePersistentConfig,
			saveUserConfig,
			userData,

			passwordInput,
			applyPassword,
			passwordFeedback,
		};
	},
};
</script>

<style></style>
