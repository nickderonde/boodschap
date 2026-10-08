// D-51 (review CR-03 A-1): geen enkele app-data mee in een cloud-back-up of een overdracht van toestel naar toestel.
// Op Android 12+ (targetSdk ≥ 31) houdt `allowBackup="false"` de device-to-device-overdracht niet altijd tegen; dat
// regelt `android:dataExtractionRules`. Zonder deze regels kan de SQLite-database (met device-ID en lijsten) mee naar
// een nieuwe telefoon, maar nooit de hardwaresleutels uit de Android Keystore: dan zijn de lijstgeheimen onleesbaar en
// wordt de identiteit niet vernieuwd. Met deze plugin begint een nieuwe telefoon leeg; lijsten koppel je opnieuw met de
// deelcode. Voor Android ≤ 11 dekt `fullBackupContent` (alles uitgesloten) samen met `allowBackup="false"` hetzelfde af.
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const DOMAINS = ['root', 'file', 'database', 'sharedpref', 'external', 'device_root', 'device_file', 'device_database', 'device_sharedpref'];
const excludeAll = (indent) => DOMAINS.map((d) => `${indent}<exclude domain="${d}" path="."/>`).join('\n');

const DATA_EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<!-- D-51: niets mee in cloud-back-up of toestel-overdracht (Android 12+). -->
<data-extraction-rules>
  <cloud-backup>
${excludeAll('    ')}
  </cloud-backup>
  <device-transfer>
${excludeAll('    ')}
  </device-transfer>
</data-extraction-rules>
`;

const FULL_BACKUP_CONTENT = `<?xml version="1.0" encoding="utf-8"?>
<!-- D-51: niets mee in een back-up (Android 11 en lager). -->
<full-backup-content>
${DOMAINS.filter((d) => !d.startsWith('device_')).map((d) => `  <exclude domain="${d}" path="."/>`).join('\n')}
</full-backup-content>
`;

function withNoDataExtraction(config) {
  config = withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) throw new Error('withNoDataExtraction: geen <application> in de manifest');
    app.$['android:allowBackup'] = 'false';
    app.$['android:dataExtractionRules'] = '@xml/data_extraction_rules';
    app.$['android:fullBackupContent'] = '@xml/full_backup_content';
    return cfg;
  });
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'data_extraction_rules.xml'), DATA_EXTRACTION_RULES);
      fs.writeFileSync(path.join(dir, 'full_backup_content.xml'), FULL_BACKUP_CONTENT);
      return cfg;
    },
  ]);
}

module.exports = withNoDataExtraction;
module.exports.DATA_EXTRACTION_RULES = DATA_EXTRACTION_RULES;
module.exports.FULL_BACKUP_CONTENT = FULL_BACKUP_CONTENT;
module.exports.DOMAINS = DOMAINS;
