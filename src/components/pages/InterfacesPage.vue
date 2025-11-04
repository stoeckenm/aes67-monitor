<template>
	<h5>Inputs</h5>
	<table class="table table-sm table-borderless">
		<thead>
			<tr>
				<th>Name</th>
				<th>Input Channels</th>
				<th>Preferred Sample Rate</th>
				<th>Sample Rates</th>
			</tr>
		</thead>
		<tbody>
			<tr
				v-for="audioInterface in getAudioInputDevices()"
				:key="audioInterface.id"
			>
				<td>
					{{ audioInterface.name }}
					<span
						class="badge"
						:class="
							persistentData.settings.followSystemAudio
								? 'text-bg-danger'
								: 'text-bg-success'
						"
						v-if="audioInterface.isDefaultInput"
					>
						<span v-if="!persistentData.settings.followSystemAudio"
							>Default</span
						>
						<span v-else>Overwritten</span>
					</span>
				</td>
				<td>{{ audioInterface.inputChannels }}</td>
				<td>{{ audioInterface.preferredSampleRate }}</td>
				<td>
					{{ audioInterface.sampleRates.join(", ") }}
				</td>
			</tr>
		</tbody>
	</table>

	<h5>Outputs</h5>
	<table class="table table-sm table-borderless">
		<thead>
			<tr>
				<th>Name</th>
				<th>Output Channels</th>
				<th>Preferred Sample Rate</th>
				<th>Sample Rates</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			<tr
				v-for="audioInterface in getAudioOutputDevices()"
				:key="audioInterface.id"
			>
				<td>
					{{ audioInterface.name }}
					<span
						class="badge text-bg-primary"
						v-if="
							audioInterface.isCurrent &&
							!persistentData.settings.followSystemAudio
						"
						style="margin-right: 5px"
						>Output</span
					>
					<span
						class="badge"
						:class="
							persistentData.settings.followSystemAudio
								? 'text-bg-danger'
								: 'text-bg-success'
						"
						v-if="audioInterface.isDefaultOutput"
					>
						<span v-if="!persistentData.settings.followSystemAudio"
							>Default</span
						>
						<span v-else>Overwritten</span>
					</span>
				</td>
				<td>{{ audioInterface.outputChannels }}</td>
				<td>{{ audioInterface.preferredSampleRate }}</td>
				<td>
					{{ audioInterface.sampleRates.join(", ") }}
				</td>
				<td>
					<button
						class="btn btn-sm btn-primary"
						.disabled="audioInterface.isCurrent"
						@click="setCurrentAudioInterface(audioInterface)"
					>
						Set as Output
					</button>
				</td>
			</tr>
		</tbody>
	</table>
</template>

<script>
import {
	persistentData,
	getAudioOutputDevices,
	getAudioInputDevices,
	setCurrentAudioInterface,
} from "../../app.js";

export default {
	name: "InterfacesPage",
	setup() {
		return {
			persistentData,
			getAudioOutputDevices,
			getAudioInputDevices,
			setCurrentAudioInterface,
		};
	},
};
</script>

<style></style>
