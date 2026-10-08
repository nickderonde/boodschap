import { parseInput } from './parseInput';

describe('F-12: hoeveelheid/eenheid herkennen uit invoer', () => {
  it('F-12: "2 melk"', () => expect(parseInput('2 melk')).toEqual({ name: 'melk', quantity: 2, unit: null }));
  it('F-12: "500 g kaas" en "500g kaas"', () => {
    expect(parseInput('500 g kaas')).toEqual({ name: 'kaas', quantity: 500, unit: 'g' });
    expect(parseInput('500g kaas')).toEqual({ name: 'kaas', quantity: 500, unit: 'g' });
    expect(parseInput('1,5 kilo aardappelen')).toEqual({ name: 'aardappelen', quantity: 1.5, unit: 'kg' });
    expect(parseInput('2 flessen cola')).toEqual({ name: 'cola', quantity: 2, unit: 'fles' });
  });
  it('F-12: "3x appels" en "3 x appels"', () => {
    expect(parseInput('3x appels')).toEqual({ name: 'appels', quantity: 3, unit: null });
    expect(parseInput('3 x appels')).toEqual({ name: 'appels', quantity: 3, unit: null });
    expect(parseInput('3×appels')).toEqual({ name: 'appels', quantity: 3, unit: null });
  });
  it('F-12: onzeker → hele tekst als naam', () => {
    expect(parseInput('melk')).toEqual({ name: 'melk', quantity: null, unit: null });
    expect(parseInput('7up')).toEqual({ name: '7up', quantity: null, unit: null });
    expect(parseInput('0 melk')).toEqual({ name: '0 melk', quantity: null, unit: null });
    expect(parseInput('0 g kaas')).toEqual({ name: '0 g kaas', quantity: null, unit: null });
    expect(parseInput('  brood  ')).toEqual({ name: 'brood', quantity: null, unit: null });
  });
});
