import {
   DOCUMENT_ENTITIES,
   DOCUMENT_TYPE_CODES,
   DOCUMENT_TYPES,
   documentFileName,
   documentSchema,
   toDocumentFormValues,
   toDocumentPayload,
   withRouteContext
} from '@/api/document';
import { setZodLocale } from '@/lib/form/zod';
import i18n from '@plugins/i18n';
import dayjs from 'dayjs';
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => setZodLocale('en'));

const formValues = (overrides: object = {}) => ({
   ...toDocumentFormValues({
      entity_type: 'product',
      entity_id: 'p1',
      customer_id: 'c1',
      type: 'spec_sheet',
      version: 3,
      status: 'draft'
   }),
   url: 'drive.google.com/file/d/abc',
   ...overrides
});

describe('DOCUMENT_ENTITIES', () => {
   it('names every record a document may belong to, market cells and change requests included', () => {
      expect(DOCUMENT_ENTITIES).toEqual(expect.arrayContaining(['market_cell', 'change_request']));
      for (const entity of DOCUMENT_ENTITIES)
         expect(i18n.t(`ops.document.entity.${entity}`)).not.toBe(`ops.document.entity.${entity}`);
   });
});

describe('documentFileName', () => {
   it('names a file by code, type, version, date and status (spec §7.6)', () => {
      expect(
         documentFileName({
            code: 'THO-MOP40-2P',
            type: 'spec_sheet',
            version: 3,
            issuedOn: '2026-11-02',
            status: 'signed'
         })
      ).toBe('THO-MOP40-2P_SPEC_v03_20261102_imzali');
   });

   it('pads the version to two digits only and marks drafts', () => {
      expect(
         documentFileName({
            code: 'MOE-001',
            type: 'pi',
            version: 12,
            issuedOn: '2026-01-05',
            status: 'draft'
         })
      ).toBe('MOE-001_PI_v12_20260105_taslak');
   });

   it('has a code for every document type', () => {
      expect(DOCUMENT_TYPES.every((type) => DOCUMENT_TYPE_CODES[type])).toBe(true);
   });
});

describe('documentSchema', () => {
   it('accepts a draft and normalises the link', () => {
      const result = documentSchema.safeParse(formValues());
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
         type: 'spec_sheet',
         version: 3,
         status: 'draft',
         issued_on: null,
         url: 'https://drive.google.com/file/d/abc',
         notes: null
      });
   });

   it('reports an incomplete signed document on the status field', () => {
      const result = documentSchema.safeParse(
         formValues({
            status: 'signed',
            is_signed: false,
            is_stamped: true,
            sent_from_official_email: true,
            issued_on: new Date(2026, 10, 2)
         })
      );

      expect(result.success).toBe(false);
      expect(result.error!.issues).toEqual([
         expect.objectContaining({
            path: ['status'],
            message: i18n.t('errors.document_signed_incomplete')
         })
      ]);
   });

   it('rejects an approved spec sheet without signature, stamp, official e-mail and date', () => {
      const result = documentSchema.safeParse(
         formValues({
            type: 'spec_sheet',
            status: 'approved',
            is_signed: false,
            is_stamped: false,
            sent_from_official_email: false,
            issued_on: null
         })
      );

      expect(result.success).toBe(false);
      expect(result.error!.issues).toEqual([
         expect.objectContaining({
            path: ['status'],
            message: i18n.t('errors.document_signed_incomplete')
         })
      ]);
   });

   it('accepts an approved gate approval without the flags', () => {
      const result = documentSchema.safeParse(
         formValues({
            type: 'gate_approval',
            status: 'approved',
            is_signed: false,
            is_stamped: false,
            sent_from_official_email: false,
            issued_on: null
         })
      );
      expect(result.success).toBe(true);
   });

   it('accepts an approved spec sheet that is signed, stamped, sent and dated', () => {
      const result = documentSchema.safeParse(
         formValues({
            type: 'spec_sheet',
            status: 'approved',
            is_signed: true,
            is_stamped: true,
            sent_from_official_email: true,
            issued_on: new Date(2026, 10, 2)
         })
      );
      expect(result.success).toBe(true);
   });

   it('accepts a signed document that is signed, stamped, sent and dated', () => {
      const result = documentSchema.safeParse(
         formValues({
            status: 'signed',
            is_signed: true,
            is_stamped: true,
            sent_from_official_email: true,
            issued_on: new Date(2026, 10, 2)
         })
      );
      expect(result.success).toBe(true);
      expect(result.data!.issued_on).toBe('2026-11-02');
   });

   it('needs a Drive link or a file', () => {
      const result = documentSchema.safeParse(formValues({ url: '', media_id: null }));
      expect(result.success).toBe(false);
      expect(result.error!.issues).toEqual([
         expect.objectContaining({
            path: ['url'],
            message: i18n.t('errors.document_file_required')
         })
      ]);
   });

   it('accepts a file without a Drive link, for any document type', () => {
      for (const type of DOCUMENT_TYPES)
         expect(
            documentSchema.safeParse(formValues({ type, url: '', media_id: 'm1' })).success
         ).toBe(true);
   });

   it('requires a type and a version of at least 1', () => {
      const result = documentSchema.safeParse(formValues({ type: null, version: 0 }));
      expect(result.success).toBe(false);
      expect(result.error!.issues.map(({ path }) => path[0]).sort()).toEqual(['type', 'version']);
   });
});

describe('document mappers', () => {
   it('prefills a new document as a first draft', () => {
      expect(toDocumentFormValues({ entity_type: 'supplier', entity_id: 's1' })).toMatchObject({
         entity_type: 'supplier',
         entity_id: 's1',
         customer_id: null,
         type: null,
         version: 1,
         status: 'draft',
         issued_on: null,
         is_signed: false
      });
   });

   it('names the file from the record code on save', () => {
      const data = documentSchema.parse(formValues({ issued_on: new Date(2026, 10, 2) }));
      expect(toDocumentPayload(data, 'THO-MOP40-2P')).toMatchObject({
         entity_type: 'product',
         entity_id: 'p1',
         customer_id: 'c1',
         file_name: 'THO-MOP40-2P_SPEC_v03_20261102_taslak'
      });
   });

   it('dates the file name today when the document has no date', () => {
      const data = documentSchema.parse(formValues());
      expect(toDocumentPayload(data, 'X').file_name).toBe(
         `X_SPEC_v03_${dayjs().format('YYYYMMDD')}_taslak`
      );
   });

   it('reads and saves the document file', () => {
      expect(toDocumentFormValues({ media_id: 'm1' }).media_id).toBe('m1');
      expect(toDocumentFormValues({}).media_id).toBeNull();
      const data = documentSchema.parse(formValues({ url: '', media_id: 'm1' }));
      expect(toDocumentPayload(data, 'X')).toMatchObject({ media_id: 'm1', url: null });
   });

   it('keeps the stored file name when no record code is given', () => {
      const data = documentSchema.parse(formValues());
      expect(toDocumentPayload(data)).not.toHaveProperty('file_name');
   });
});

describe('withRouteContext', () => {
   const context = { entity_type: 'supplier' as const, entity_id: 's2', customer_id: 'c2' };

   it('files a new document under the record its dialog was opened from', () => {
      // E.g. a draft restored from adding to another record.
      const data = documentSchema.parse(formValues());
      expect(withRouteContext(data, context)).toMatchObject(context);
      expect(toDocumentPayload(withRouteContext(data, context), 'SUP-2')).toMatchObject({
         ...context,
         file_name: 'SUP-2_SPEC_v03_' + dayjs().format('YYYYMMDD') + '_taslak'
      });
   });

   it("drops a restored draft's customer for a record without one (a supplier)", () => {
      // The document's customer decides which customer's files it may cite (document_check_media).
      const data = documentSchema.parse(formValues());
      expect(
         withRouteContext(data, { entity_type: 'supplier', entity_id: 's2', customer_id: null })
      ).toMatchObject({ entity_type: 'supplier', entity_id: 's2', customer_id: null });
      expect(
         withRouteContext(data, { entity_type: 'supplier', entity_id: 's2' }).customer_id
      ).toBeNull();
   });

   it('keeps the form values where the route gives no context', () => {
      const data = documentSchema.parse(formValues());
      expect(
         withRouteContext(data, { entity_type: null, entity_id: null, customer_id: null })
      ).toMatchObject({ entity_type: 'product', entity_id: 'p1', customer_id: 'c1' });
   });

   it('leaves a saved document where it is', () => {
      const data = documentSchema.parse(formValues({ id: 'd1' }));
      expect(withRouteContext(data, context)).toMatchObject({
         entity_type: 'product',
         entity_id: 'p1',
         customer_id: 'c1'
      });
   });
});
