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
import { ref, watch } from "vue";
import { persistentData, updatePersistentData, viewDevice } from "../../app.js";

export default {
	name: "DevicesPage",
	setup() {
		const editDevice = ref("");

		// Convert persistentData.devices object to ref array
		const devices = ref(
			Object.entries(persistentData.value.devices || {}).map(
				([address, info]) => ({
					address,
					name: info.name,
					description: info.description,
					count: info.count,
				})
			)
		);

		// Watch the devices array and update persistentData when changed
		watch(
			devices,
			(newVal) => {
				persistentData.value.devices = {};
				newVal.forEach((d) => {
					persistentData.value.devices[d.address] = {
						name: d.name,
						description: d.description,
						count: d.count,
					};
				});
				updatePersistentData("devices");
			},
			{ deep: true }
		);

		const edit = (address) => {
			if (editDevice.value === address) editDevice.value = "";
			else editDevice.value = address;
		};

		return {
			devices,
			editDevice,
			edit,
			viewDevice,
		};
	},
};
</script>

<style></style>
