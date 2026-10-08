// ST-05: de camera is optioneel (alleen voor het scannen van een QR-code; plakken van de code werkt altijd).
// De CAMERA-permissie impliceert in Google Play anders `android.hardware.camera` als verplichte hardware, waardoor
// toestellen zonder (achter)camera de app niet kunnen installeren. Deze plugin zet de features expliciet op niet-verplicht.
const { withAndroidManifest } = require('expo/config-plugins');

const FEATURES = ['android.hardware.camera', 'android.hardware.camera.autofocus', 'android.hardware.camera.any'];

function withOptionalCamera(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const list = (manifest['uses-feature'] = manifest['uses-feature'] ?? []);
    for (const name of FEATURES) {
      const existing = list.find((f) => f.$?.['android:name'] === name);
      if (existing) existing.$['android:required'] = 'false';
      else list.push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
    return cfg;
  });
}

module.exports = withOptionalCamera;
module.exports.FEATURES = FEATURES;
