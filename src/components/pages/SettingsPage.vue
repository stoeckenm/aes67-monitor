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
			<div class="form-check">
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

export default {
	name: "SettingsPage",
	setup() {
		return {
			persistentData,
			networkInterfaces,
			updateAudioInterface,
			savePersistentConfig,
			saveUserConfig,
			userData,
		};
	},
};
</script>

<style></style>
