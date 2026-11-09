<template>
	<div class="row">
		<div class="col-4">
			<h5 class="mb-3">Network</h5>
			<select
				class="form-select"
				id="networkSelect"
				:value="persistentData.network.currentInterface"
				@change="setNetworkInterface($event.target.value)"
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
			<h6 class="mt-4">Admin Password</h6>
			<div class="input-group mb-2">
				<input
					type="password"
					class="form-control"
					placeholder="Enter new password"
					v-model="passwordInput"
					@keyup.enter="applyPassword"
				/>
				<button
					class="btn btn-primary"
					:disabled="!passwordInput"
					@click="applyPassword"
				>
					Set
				</button>
			</div>
			<button
				class="btn btn-sm btn-outline-danger mb-2"
				v-if="persistentData.hasPassword"
				@click="clearPassword"
			>
				Remove password
			</button>
			<div class="form-text">
				{{
					persistentData.hasPassword
						? "A password is set. Admin mode asks for it before unlocking."
						: "No password set - admin mode unlocks without asking."
				}}
				<br />
				This guards against accidental operation. It is not access control:
				anyone who can edit the config file can bypass it.
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
	setNetworkInterface,
	userData,
} from "../../app.js";

import { ref } from "vue";

export default {
	name: "SettingsPage",
	setup() {
		const passwordInput = ref("");
		const passwordFeedback = ref("");

		const flashFeedback = (text) => {
			passwordFeedback.value = text;
			setTimeout(() => {
				passwordFeedback.value = "";
			}, 3000);
		};

		// Hashing and storage happen in the main process, which owns the hash.
		// Setting and removing are separate actions so an empty field can no
		// longer silently clear the password.
		const applyPassword = async () => {
			if (!passwordInput.value) return;
			await window.electronAPI.setAdminPassword(passwordInput.value);
			passwordInput.value = "";
			flashFeedback("Password saved");
		};

		const clearPassword = async () => {
			await window.electronAPI.setAdminPassword(null);
			passwordInput.value = "";
			flashFeedback("Password removed");
		};

		return {
			persistentData,
			networkInterfaces,
			updateAudioInterface,
			savePersistentConfig,
			saveUserConfig,
			userData,

			setNetworkInterface,
			passwordInput,
			applyPassword,
			clearPassword,
			passwordFeedback,
		};
	},
};
</script>

<style></style>
