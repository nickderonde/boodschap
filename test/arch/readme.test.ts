// NF-14 / review M4 K-1 en K-8: de README bevat de verplichte onderdelen voor Nick.
import fs from 'node:fs';
import path from 'node:path';

const readme = fs.readFileSync(path.resolve(__dirname, '../../README.md'), 'utf8');

describe('README (NF-14, DoD 6)', () => {
  it('DoD 6: installatie, Expo Go op twee telefoons, koppelen, privacy, beperkingen, testcommando\'s en EAS', () => {
    for (const s of ['npm install', 'npx expo start', 'Expo Go', 'Lijst toevoegen', 'Scannen', 'plakken', 'relays', 'Bekende beperkingen', 'npm test', 'EAS']) {
      expect([s, readme.includes(s)]).toEqual([s, true]);
    }
  });

  it('B-02 / NF-05: waarschuwing dat iedereen met de code kan meedoen', () => {
    expect(readme).toMatch(/Deel de QR-code of code alleen met mensen die je vertrouwt/);
  });

  it('review K-1: uitleg over het klembord', () => {
    expect(readme).toMatch(/klembord/i);
  });

  it('fase 2 Eindtester: voor een niet-ontwikkelaar — geen verplichte git clone, Node-installatie en minimumversie, vulnerabilities negeren, stoppen met Ctrl+C, verwijzing naar de handmatige test', () => {
    const install = readme.slice(readme.indexOf('## 2. Installeren'), readme.indexOf('## 3.'));
    // ST-15: geen lokale paden meer; wel uitleg hoe je in de bestaande map komt.
    expect(readme).not.toMatch(/\/Users\/[A-Za-z]/);
    expect(install).toMatch(/sleep de projectmap/);
    expect(install).toMatch(/geen GitHub of `git clone` nodig/);
    expect(install).toMatch(/nodejs\.org/);
    expect(install).toMatch(/22\.13/);
    expect(install).toMatch(/vulnerabilities/);
    expect(readme).toMatch(/Ctrl\+C/);
    expect(readme).toContain('docs/HANDMATIGE_TEST.md');
  });

  it('O-ET-10: optionele live-test genoemd, "vraag hulp" bij de SDK-melding, smalle Terminal uitgelegd', () => {
    expect(readme).toContain('LIVE_RELAYS=1');
    expect(readme).not.toMatch(/Geen enkele test praat met echte/);
    expect(readme).toMatch(/vraag hulp/);
    expect(readme).toMatch(/Terminal-venster dan breder/);
  });

  it('review K-8: bij een SDK-upgrade ook de testketen (Jest 30) bijwerken', () => {
    expect(readme).toMatch(/Jest 30/);
    expect(readme).toMatch(/§4\.3/);
  });

  it('ST-14: publieke README met Engelse samenvatting, licentie, merk-uitzondering, bijdragen en beveiliging', () => {
    expect(readme).toMatch(/English summary/);
    expect(readme).toMatch(/MIT/);
    expect(readme).toMatch(/NOTICE/);
    expect(readme).toMatch(/CONTRIBUTING\.md/);
    expect(readme).toMatch(/SECURITY\.md/);
    expect(readme).toMatch(/nl\.derondeengineering\.boodschap/);
  });
});
