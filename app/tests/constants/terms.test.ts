import { GLOSSARY_ENUMS } from '@/api/glossary';
import {
   driveLinkValid,
   markLabel,
   parseTerms,
   stripTerms,
   TERM_CODES,
   TERMS,
   termKeys,
   termOfGlossary,
   termSlug,
   termsOf
} from '@/constants/terms';
import { describe, expect, it } from 'vitest';

describe('terms registry', () => {
   it('splits text into text and terms', () => {
      expect(parseTerms('Check the [[PI]] ([[S09]]).')).toEqual([
         { text: 'Check the ' },
         { code: 'PI' },
         { text: ' (' },
         { code: 'S09' },
         { text: ').' }
      ]);
      expect(parseTerms('[[XX]] here')).toEqual([{ text: 'XX' }, { text: ' here' }]);
      expect(parseTerms('plain')).toEqual([{ text: 'plain' }]);
   });

   it('strips the markers', () => {
      expect(stripTerms('[[(M)]] gates and [[L-G1]]')).toBe('(M) gates and L-G1');
   });

   it('finds the copy of a term', () => {
      expect(termKeys('S09')).toEqual({ short: 'terms.S09.short', long: 'terms.S09.long' });
      expect(termKeys('A0').short).toBe('glossary.package.A0');
      expect(termKeys('L-G1')).toEqual({
         short: 'glossary.gate_code.L_G1',
         long: 'terms.L_G1.long'
      });
      expect(termKeys('(M)')).toEqual({
         short: 'terms.M_gate.short',
         long: 'terms.M_gate.long'
      });
      expect(termKeys('OL').short).toBe('glossary.incident_family.ol');
      expect(termKeys('S1').short).toBe('glossary.incident_severity.s1');
   });

   it('marks a code in a label', () => {
      expect(markLabel('PI document', 'PI')).toBe('[[PI]] document');
      expect(markLabel('Incident type (Y10)', 'Y10')).toBe('Incident type ([[Y10]])');
      expect(markLabel('Platform SKU', 'SKU')).toBe('Platform [[SKU]]');
      expect(markLabel('EPI number', 'PI')).toBe('EPI number [[PI]]');
      expect(markLabel('ASIN', 'ASIN')).toBe('[[ASIN]]');
   });

   it('derives packages, gates, families and severities from the enums', () => {
      expect(termsOf('package')).toEqual([...GLOSSARY_ENUMS.package]);
      expect(termsOf('gate')).toEqual([
         ...GLOSSARY_ENUMS.gate_code.map((g) => g.replaceAll('_', '-')),
         '(M)'
      ]);
      expect(termsOf('family')).toEqual(['OL', 'OA', 'OU', 'OT', 'OM']);
      expect(termsOf('severity')).toEqual(['S1', 'S2', 'S3']);
      expect(termsOf('process')).toEqual([
         'S05',
         'S07',
         'S08',
         'S09',
         'S10',
         'S11',
         'S12',
         'S13',
         'S14',
         'S15',
         'S16',
         'S17',
         'Y10'
      ]);
      expect(termOfGlossary('gate_code', 'PL_G4')).toBe('PL-G4');
   });

   it('gives every term its own slug', () => {
      expect(new Set(TERM_CODES.map(termSlug)).size).toBe(TERM_CODES.length);
      const drives = TERM_CODES.flatMap((code) => TERMS[code]?.drive ?? []);
      expect(drives.filter((url) => !driveLinkValid(url))).toEqual([]);
   });

   it('accepts only Google Drive links', () => {
      expect(driveLinkValid('https://drive.google.com/file/d/abc/view')).toBe(true);
      expect(driveLinkValid('https://docs.google.com/spreadsheets/d/abc/edit')).toBe(true);
      expect(driveLinkValid('http://drive.google.com/file/d/abc')).toBe(false);
      expect(driveLinkValid('https://example.com/drive.google.com/x')).toBe(false);
      expect(driveLinkValid('')).toBe(false);
   });
});
