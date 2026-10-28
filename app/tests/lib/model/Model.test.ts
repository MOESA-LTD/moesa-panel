import { Model, toModel } from '@/lib/model/Model';
import dayjs from 'dayjs';
import { cloneDeep } from 'lodash';
import { describe, expect, it } from 'vitest';
import { computed, reactive, readonly } from 'vue';

// Models of the kind an app defines on its tables: one with a derived value, one embedding the
// other as a relation.

type AddressDto = {
   id: string;
   country: string;
   city: string;
   district: string;
   details: string | null;
};

/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging */
interface AddressModel extends AddressDto {}
class AddressModel extends Model<AddressDto> {
   get fullAddress() {
      return [this.details, this.district, this.city, this.country].filter(Boolean).join(', ');
   }
}

type PersonDto = {
   id: string;
   display_name: string;
   birth_date: string | null;
   address?: AddressDto[] | null;
};

interface PersonModel extends Omit<PersonDto, 'address'> {}
class PersonModel extends Model<PersonDto> {
   /* eslint-enable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging */
   declare address?: AddressModel[] | null;

   constructor(dto: PersonDto) {
      super(dto);
      if (dto.address !== undefined) this.address = toModel(AddressModel, dto.address);
   }

   get age(): number | null {
      return this.birth_date ? dayjs().diff(this.birth_date, 'year') : null;
   }

   get primaryAddress(): AddressModel | null {
      return this.address?.[0] ?? null;
   }
}

const address: AddressDto = {
   id: 'a1',
   country: 'Türkiye',
   city: 'İstanbul',
   district: 'Kadıköy',
   details: 'Moda Cd. 1'
};

const person = (overrides: Partial<PersonDto> = {}): PersonDto => ({
   id: 'p1',
   display_name: 'Ada Lovelace',
   birth_date: dayjs().subtract(30, 'year').subtract(1, 'day').format('YYYY-MM-DD'),
   address: [address],
   ...overrides
});

describe('toModel', () => {
   it('maps a single row to a model', () => {
      const model = toModel(PersonModel, person());

      expect(model).toBeInstanceOf(PersonModel);
      expect(model.display_name).toBe('Ada Lovelace');
   });

   it('maps a list to a list of models', () => {
      const models = toModel(PersonModel, [person(), person({ id: 'p2' })]);

      expect(models).toHaveLength(2);
      expect(models.every((m) => m instanceof PersonModel)).toBe(true);
   });

   it('keeps a missing row null', () => {
      expect(toModel(PersonModel, null)).toBeNull();
      expect(toModel(PersonModel, undefined)).toBeNull();
   });

   it('keeps data that is already a model', () => {
      const model = toModel(PersonModel, person());
      expect(toModel(PersonModel, model)).toBe(model);
   });

   it('maps embedded relations to their models', () => {
      const model = toModel(PersonModel, person());

      expect(model.address?.[0]).toBeInstanceOf(AddressModel);
      expect(model.primaryAddress?.fullAddress).toBe('Moda Cd. 1, Kadıköy, İstanbul, Türkiye');
   });

   it('leaves a relation the query did not embed undefined', () => {
      const withoutAddress = _omit(person(), 'address');
      const model = toModel(PersonModel, withoutAddress);

      expect('address' in model).toBe(false);
      expect(model.primaryAddress).toBeNull();
   });
});

describe('Model', () => {
   it('derives values from the columns', () => {
      expect(toModel(PersonModel, person()).age).toBe(30);
      expect(toModel(PersonModel, person({ birth_date: '' })).age).toBeNull();
   });

   it('skips empty parts of a derived value', () => {
      expect(toModel(AddressModel, { ...address, details: null }).fullAddress).toBe(
         'Kadıköy, İstanbul, Türkiye'
      );
   });

   it('keeps derived values out of spreads and toDto', () => {
      const model = toModel(PersonModel, person());

      expect({ ...model }).not.toHaveProperty('age');
      expect(model.toDto()).toEqual(person());
      expect(model.toDto().address?.[0]).not.toBeInstanceOf(AddressModel);
   });

   it('updates derived values like computed properties when reactive', () => {
      const model = reactive(toModel(AddressModel, address));
      const label = computed(() => model.fullAddress);

      model.city = 'Ankara';

      expect(label.value).toBe('Moda Cd. 1, Kadıköy, Ankara, Türkiye');
   });

   it('works through readonly query data and survives cloning', () => {
      const model = readonly(toModel(PersonModel, person()));

      expect(model.primaryAddress?.fullAddress).toContain('Kadıköy');
      expect(cloneDeep(model)).toBeInstanceOf(PersonModel);
      expect(cloneDeep(model).primaryAddress).toBeInstanceOf(AddressModel);
   });
});
