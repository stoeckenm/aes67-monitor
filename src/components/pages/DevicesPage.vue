<template>
	<div class="alert alert-primary" role="alert" v-if="devices.length === 0">
		No devices found.
	</div>

	<table class="table table-sm table-borderless" v-if="devices.length > 0">
		<thead>
			<tr>
				<th>Name</th>
				<th>Address</th>
				<th>Streams</th>
				<th>Description</th>
				<th></th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			<tr v-for="device in devices" :key="device.address">
				<td>
					<span v-if="editDevice !== device.address" class="copy">
						{{ device.name }}
					</span>
					<input
						class="form-control form-control-sm"
						type="text"
						v-model="draft.name"
						v-else
						@keyup.enter="toggleEdit(device)"
					/>
				</td>
				<td>{{ device.address }}</td>
				<td>{{ device.count }}</td>
				<td>
					<span v-if="editDevice !== device.address" class="copy">
						{{ device.description }}
					</span>
					<input
						class="form-control form-control-sm"
						type="text"
						v-model="draft.description"
						v-else
						@keyup.enter="toggleEdit(device)"
					/>
				</td>
				<td>
					<button
						class="btn btn-sm btn-primary"
						:title="
							editDevice === device.address ? 'Save device' : 'Rename device'
						"
						@click="toggleEdit(device)"
					>
						<i
							class="bi"
							:class="{
								'bi-pencil-square': editDevice !== device.address,
								'bi-check-lg': editDevice === device.address,
							}"
						></i>
					</button>
				</td>
				<td>
					<button
						class="btn btn-sm btn-primary"
						@click="viewDevice(device.address)"
					>
						Filter
					</button>
				</td>
			</tr>
		</tbody>
	</table>
</template>
<script>
import { ref, computed } from "vue";
import {
	persistentData,
	searchDevices,
	viewDevice,
	savePersistentConfig,
} from "../../app.js";

export default {
	name: "DevicesPage",
	setup() {
		const editDevice = ref("");
		// Edits are held in a draft: binding straight to the computed rows below
		// wrote into a throwaway object, so renames were silently discarded.
		const draft = ref({ name: "", description: "" });

		// Computed devices list for display
		const devices = computed(() => {
			return searchDevices.value.map((d) => {
				const stored = persistentData.value.devices?.[d.ip] || {};
				return {
					address: d.ip,
					name: stored.name || d.name,
					description: stored.description || d.description,
					count: d.count,
				};
			});
		});

		const toggleEdit = (device) => {
			if (editDevice.value === device.address) {
				if (!persistentData.value.devices) persistentData.value.devices = {};
				persistentData.value.devices[device.address] = {
					name: draft.value.name.trim() || device.address,
					description: draft.value.description.trim() || "-",
				};
				savePersistentConfig();
				editDevice.value = "";
			} else {
				editDevice.value = device.address;
				draft.value = {
					name: device.name === device.address ? "" : device.name,
					description: device.description === "-" ? "" : device.description,
				};
			}
		};

		return {
			devices,
			editDevice,
			draft,
			toggleEdit,
			viewDevice,
		};
	},
};
</script>

<style></style>
