<template>
	<div v-if="discovery.devices.length === 0" class="alert alert-secondary">
		{{ t("devices.empty") }}
	</div>

	<div v-else class="table-responsive">
		<table class="table table-sm align-middle">
			<thead>
				<tr>
					<th scope="col">{{ t("devices.name") }}</th>
					<th scope="col">{{ t("devices.address") }}</th>
					<th scope="col">{{ t("devices.streamCount") }}</th>
					<th scope="col">{{ t("devices.description") }}</th>
					<th scope="col" class="text-end"></th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="device in discovery.devices" :key="device.address">
					<td>
						<input
							v-if="editing === device.address"
							v-model="draft.name"
							type="text"
							class="form-control form-control-sm"
							:aria-label="t('devices.name')"
							@keyup.enter="commit(device)"
						/>
						<span v-else>{{ device.name }}</span>
					</td>
					<td>{{ device.address }}</td>
					<td>{{ device.count }}</td>
					<td>
						<input
							v-if="editing === device.address"
							v-model="draft.description"
							type="text"
							class="form-control form-control-sm"
							:aria-label="t('devices.description')"
							@keyup.enter="commit(device)"
						/>
						<span v-else>{{ device.description }}</span>
					</td>
					<td class="text-end text-nowrap">
						<button
							type="button"
							class="btn btn-sm btn-outline-primary me-1"
							:title="
								editing === device.address
									? t('devices.save')
									: t('devices.rename')
							"
							@click="toggle(device)"
						>
							<i
								class="bi"
								:class="
									editing === device.address
										? 'bi-check-lg'
										: 'bi-pencil-square'
								"
							></i>
						</button>
						<button
							type="button"
							class="btn btn-sm btn-outline-secondary"
							@click="filterByDevice(device)"
						>
							{{ t("devices.filter") }}
						</button>
					</td>
				</tr>
			</tbody>
		</table>
	</div>
</template>

<script setup>
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useSessionStore } from "../stores/session";
import { useConfigStore } from "../stores/config";
import { useDiscoveryStore } from "../stores/discovery";

const { t } = useI18n();
const session = useSessionStore();
const config = useConfigStore();
const discovery = useDiscoveryStore();

const editing = ref("");
// Edits are held in a draft. Binding straight to the computed rows wrote into
// a throwaway object, which is why renames used to be discarded.
const draft = ref({ name: "", description: "" });

const commit = (device) => {
	config.setDeviceInfo(device.address, {
		name: draft.value.name.trim() || device.address,
		description: draft.value.description.trim() || "-",
	});
	editing.value = "";
};

const toggle = (device) => {
	if (editing.value === device.address) {
		commit(device);
		return;
	}
	editing.value = device.address;
	draft.value = {
		name: device.name === device.address ? "" : device.name,
		description: device.description === "-" ? "" : device.description,
	};
};

const filterByDevice = (device) => {
	session.search = device.address;
	session.setPage("streams");
};
</script>
