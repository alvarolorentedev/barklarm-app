import { describe, expect, it } from 'vitest';
import en from '../assets/translations/en.json';
import es from '../assets/translations/es.json';

describe('translations', () => {
  it('keeps every English key translated in Spanish', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });
});
