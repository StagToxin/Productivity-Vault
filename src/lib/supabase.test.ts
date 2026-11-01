import { describe, expect, it } from 'vitest';
import { explainSupaError, normalizeSupaUrl } from './supabase';

describe('normalizeSupaUrl', () => {
  const base = 'https://abcdefgh.supabase.co';
  it.each([
    [base, base],
    [base + '/', base],
    [base + '/rest/v1/', base],
    [base + '/rest/v1', base],
    [base + '/auth/v1', base],
    ['  "' + base + '/"  ', base],
    ['abcdefgh.supabase.co', base],
    ['https://supabase.com/dashboard/project/abcdefgh/settings/api', base],
    ['https://supabase.com/dashboard/project/abcdefgh', base],
    ['', ''],
  ])('%s → %s', (input, out) => expect(normalizeSupaUrl(input)).toBe(out));
});

describe('explainSupaError', () => {
  it('yanlış yol hatasını açıklar', () => {
    expect(explainSupaError('Invalid path specified in request URL', 'tr')).toMatch(/adresi hatalı/);
  });
  it('bilinmeyen mesajı aynen bırakır', () => {
    expect(explainSupaError('something else', 'en')).toBe('something else');
  });
});
