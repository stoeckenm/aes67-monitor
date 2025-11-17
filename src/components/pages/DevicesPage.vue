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
						v-model="device.name"
						v-else
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
						v-model="device.description"
						v-else
					/>
				</td>
				<td>
					<button class="btn btn-sm btn-primary" @click="edit(device.address)">
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

		// Computed devices list for display
		const devices = computed(() => {
			return searchDevices.value.map((d) => {
				const stored = persistentData.value.devices[d.ip] || {};
				return {
					address: d.ip,
					name: stored.name || d.name,
					description: stored.description || d.description,
					count: d.count,
				};
			});
		});

		// Function to update a device when editing finishes
		const updateDevice = (device) => {
			persistentData.value.devices[device.address] = {
				name: device.name,
				description: device.description,
				count: device.count,
			};
			savePersistentConfig();
		};

		const edit = (address) => {
			if (editDevice.value === address) editDevice.value = "";
			else editDevice.value = address;
		};

		return {
			devices,
			editDevice,
			edit,
			updateDevice,
			viewDevice,
		};
	},
};
</script>

<style></style>
