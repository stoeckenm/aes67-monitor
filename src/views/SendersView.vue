<template>
	<p class="text-muted senders-intro">{{ t("senders.intro") }}</p>

	<div v-if="discovery.senders.length === 0" class="alert alert-secondary">
		{{ t("senders.empty") }}
	</div>

	<div v-else class="table-responsive">
		<table class="table table-sm align-middle">
			<thead>
				<tr>
					<th scope="col">{{ t("senders.name") }}</th>
					<th scope="col">{{ t("senders.address") }}</th>
					<th scope="col">{{ t("senders.streamCount") }}</th>
					<th scope="col">{{ t("senders.description") }}</th>
					<th scope="col" class="text-end"></th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="sender in discovery.senders" :key="sender.address">
					<td>
						<input
							v-if="editing === sender.address"
							v-model="draft.name"
							type="text"
							class="form-control form-control-sm"
							:aria-label="t('senders.name')"
							@keyup.enter="commit(sender)"
						/>
						<span v-else>{{ sender.name }}</span>
					</td>
					<td>{{ sender.address }}</td>
					<td>{{ sender.count }}</td>
					<td>
						<input
							v-if="editing === sender.address"
							v-model="draft.description"
							type="text"
							class="form-control form-control-sm"
							:aria-label="t('senders.description')"
							@keyup.enter="commit(sender)"
						/>
						<span v-else>{{ sender.description }}</span>
					</td>
					<td class="text-end text-nowrap">
						<button
							type="button"
							class="btn btn-sm btn-outline-primary me-1"
							:title="
								editing === sender.address
									? t('senders.save')
									: t('senders.rename')
							"
							:aria-label="
								editing === sender.address
									? t('senders.save')
									: t('senders.rename')
							"
							@click="toggle(sender)"
						>
							<i
								class="bi"
								:class="
									editing === sender.address
										? 'bi-check-lg'
										: 'bi-pencil-square'
								"
							></i>
						</button>
						<button
							type="button"
							class="btn btn-sm btn-outline-secondary"
							@click="session.showSenderStreams(sender.address)"
						>
							{{ t("senders.filter") }}
						</button>
					</td>
				</tr>
			</tbody>
		</table>
	</div>
</template>

<script setup>
// The senders announcing on the network, derived from the stream origins.
// Named "Sender", not "Geräte": the output device in the settings is a device
// too, and one word for both sent admins looking in the wrong place.
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

const commit = (sender) => {
	config.setDeviceInfo(sender.address, {
		name: draft.value.name.trim() || sender.address,
		description: draft.value.description.trim() || "-",
	});
	editing.value = "";
};

const toggle = (sender) => {
	if (editing.value === sender.address) {
		commit(sender);
		return;
	}
	editing.value = sender.address;
	draft.value = {
		name: sender.name === sender.address ? "" : sender.name,
		description: sender.description === "-" ? "" : sender.description,
	};
};
</script>

<style scoped>
.senders-intro {
	margin-bottom: 0.75rem;
}
</style>
