import {
   incidentResource,
   type IncidentEntityType,
   incidentSchema,
   toIncidentFormValues,
   toIncidentPayload,
   type IncidentCard,
   type IncidentOverviewRow
} from '@/api/incident';
import { useUpsertForm } from '@/composables/useUpsertForm';
import { useCustomerFilter } from '@/store/customerFilter';
import { computed, inject, ref, type InjectionKey, type Ref } from 'vue';

/**
 * The incident card's tabs: the form's general tab (S17 A and B), the log (S17 C), the deadlines,
 * the form's closure tab (S17 D), then the documents and the media.
 */
export const INCIDENT_CARD_TABS = [
   'general',
   'log',
   'deadlines',
   'closure',
   'documents',
   'media'
] as const;
export type IncidentCardTab = (typeof INCIDENT_CARD_TABS)[number];

/** The S17 D fields of the closure tab. */
export const INCIDENT_CLOSURE_FIELDS = [
   'outcome',
   'root_cause',
   'root_cause_note',
   'impact_note',
   'lessons',
   'preventive_action',
   'customer_closure_notified_on'
] as const;

/** The card tab that shows a field of the incident form (a top-level column name). */
export const tabForField = (field: string): 'general' | 'closure' =>
   (INCIDENT_CLOSURE_FIELDS as readonly string[]).includes(field) ? 'closure' : 'general';

/** A new incident's customer and linked record, when a link names them (the route's query). */
export type IncidentPrefill = {
   customer_id?: string | null;
   entity_type?: string | null;
   entity_id?: string | null;
};

const queryValue = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

/**
 * The incident card's one form: the general and closure tabs each show their part of it. A new
 * incident starts with the customer and linked record a link names (a project's Incidents tab, a
 * gate's rollback), else with the customer the lists are filtered by. The route passes those as
 * props: a route dialog renders the page outside the router. Once a new incident is saved, its
 * "new" draft is dropped: the card goes on under the incident's id (see IncidentCard).
 */
export function useIncidentForm(
   id: () => string | null | undefined,
   onSaved?: (incident: IncidentCard) => void,
   prefill: IncidentPrefill = {}
) {
   const customerFilter = useCustomerFilter();
   const isNew = !id();

   const initial = () => {
      const customerId = queryValue(prefill.customer_id) ?? customerFilter.customerId;
      const entityType = queryValue(prefill.entity_type) as IncidentEntityType | undefined;
      const entityId = queryValue(prefill.entity_id);
      return {
         ...(customerId ? { customer_id: customerId } : {}),
         ...(entityType && entityId ? { entity_type: entityType, entity_id: entityId } : {})
      };
   };

   const form = useUpsertForm({
      id,
      prefill: initial,
      useRow: incidentResource.useOne,
      useSaveRow: incidentResource.useSave,
      subject: 'incident',
      schema: incidentSchema,
      toFormValues: toIncidentFormValues,
      toPayload: (values) => toIncidentPayload(values),
      onSaved: (incident) => {
         if (isNew) form.discardDraft();
         onSaved?.(incident);
      }
   });
   return form;
}

/** The card's form with a submit that opens the tab of the first error. */
export type IncidentForm = ReturnType<typeof useIncidentForm> & {
   submit: () => Promise<void>;
};

export const INCIDENT_FORM: InjectionKey<IncidentForm> = Symbol('incident-form');

/** The incident's overview row (linked record, next deadline, repeat), loaded once by the card. */
export const INCIDENT_OVERVIEW: InjectionKey<Ref<IncidentOverviewRow | null | undefined>> =
   Symbol('incident-overview');

/** The form of the incident card the tab is in. */
export function injectIncidentForm() {
   const form = inject(INCIDENT_FORM);
   if (!form) throw new Error('An incident tab must be inside the incident card');
   return form;
}

/** The overview row of the incident card the tab is in (null until loaded or for a new one). */
export const injectIncidentOverview = () => inject(INCIDENT_OVERVIEW, () => ref(null), true);

/** Whether the card's saved incident is closed: its log and deadlines take no more lines. */
export const useIncidentClosed = (form: Pick<IncidentForm, 'row'>) =>
   computed(() => form.row.value?.status === 'closed');
