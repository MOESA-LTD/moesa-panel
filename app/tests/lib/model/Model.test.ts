import { AddressModel, type AddressDto } from '@/api/address/model';
import { ClientModel, type ClientDto } from '@/api/client/model';
import { toModel } from '@/lib/model/Model';
import dayjs from 'dayjs';
import { cloneDeep } from 'lodash';
import { describe, expect, it } from 'vitest';
import { computed, reactive, readonly } from 'vue';

const address: AddressDto = {
   id: 'a1',
   tenant_id: 't1',
   display_name: 'Home',
   country: 'Türkiye',
   city: 'İstanbul',
   district: 'Kadıköy',
   details: 'Moda Cd. 1',
   created_at: null
};

const client = (overrides: Partial<ClientDto> = {}): ClientDto => ({
   id: 'c1',
   tenant_id: 't1',
   display_name: 'Ada Lovelace',
   birth_date: dayjs().subtract(30, 'year').subtract(1, 'day').format('YYYY-MM-DD'),
   national_id: '1',
   nationality: null,
   gender: null,
   email: null,
   phone: null,
   created_at: null,
   address: [address],
   ...overrides
});

describe('toModel', () => {
   it('maps a single row to a model', () => {
      const model = toModel(ClientModel, client());

      expect(model).toBeInstanceOf(ClientModel);
      expect(model.display_name).toBe('Ada Lovelace');
   });

   it('maps a list to a list of models', () => {
      const models = toModel(ClientModel, [client(), client({ id: 'c2' })]);

      expect(models).toHaveLength(2);
      expect(models.every((m) => m instanceof ClientModel)).toBe(true);
   });

   it('keeps a missing row null', () => {
      expect(toModel(ClientModel, null)).toBeNull();
      expect(toModel(ClientModel, undefined)).toBeNull();
   });

   it('keeps data that is already a model', () => {
      const model = toModel(ClientModel, client());
      expect(toModel(ClientModel, model)).toBe(model);
   });

   it('maps embedded relations to their models', () => {
      const model = toModel(ClientModel, client());

      expect(model.address?.[0]).toBeInstanceOf(AddressModel);
      expect(model.primaryAddress?.fullAddress).toBe('Moda Cd. 1, Kadıköy, İstanbul, Türkiye');
   });

   it('leaves a relation the query did not embed undefined', () => {
      const withoutAddress = _omit(client(), 'address');
      const model = toModel(ClientModel, withoutAddress);

      expect('address' in model).toBe(false);
      expect(model.primaryAddress).toBeNull();
   });
});

describe('Model', () => {
   it('derives values from the columns', () => {
      expect(toModel(ClientModel, client()).age).toBe(30);
      expect(toModel(ClientModel, client({ birth_date: '' })).age).toBeNull();
   });

   it('skips empty parts of a derived value', () => {
      expect(toModel(AddressModel, { ...address, details: null }).fullAddress).toBe(
         'Kadıköy, İstanbul, Türkiye'
      );
   });

   it('keeps derived values out of spreads and toDto', () => {
      const model = toModel(ClientModel, client());

      expect({ ...model }).not.toHaveProperty('age');
      expect(model.toDto()).toEqual(client());
      expect(model.toDto().address?.[0]).not.toBeInstanceOf(AddressModel);
   });

   it('updates derived values like computed properties when reactive', () => {
      const model = reactive(toModel(AddressModel, address));
      const label = computed(() => model.fullAddress);

      model.city = 'Ankara';

      expect(label.value).toBe('Moda Cd. 1, Kadıköy, Ankara, Türkiye');
   });

   it('works through readonly query data and survives cloning', () => {
      const model = readonly(toModel(ClientModel, client()));

      expect(model.primaryAddress?.fullAddress).toContain('Kadıköy');
      expect(cloneDeep(model)).toBeInstanceOf(ClientModel);
      expect(cloneDeep(model).primaryAddress).toBeInstanceOf(AddressModel);
   });
});
