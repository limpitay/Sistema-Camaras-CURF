require('dotenv').config({ path: '../.env' });
const fs = require('fs');
const path = require('path');
const { listarCamarasArtemis, capturarFoto, descargarImagen } = require('./src/utils/artemisClient');

const DESTINO = 'C:/Users/Luigi/AppData/Local/Temp/claude/c--Users-Luigi-Documents-PROYECTOS-VARIOS-Sistema-Camaras-CURF/c8c96e4f-1a02-4fcd-9634-662d6521f5b4/scratchpad/fotos_test';
const hoy = new Date().toISOString().slice(0, 10);

(async () => {
  let camaras;
  try {
    camaras = await listarCamarasArtemis();
  } catch (err) {
    console.error('ERROR listando camaras:', err.message);
    process.exit(1);
  }
  console.log(`Listado OK: ${camaras.length} camara(s) totales en HikCentral. Probando las primeras 10...\n`);

  const primeras10 = camaras.slice(0, 10);
  for (const cam of primeras10) {
    const nombre = cam.cameraName || cam.cameraIndexCode;
    try {
      const picUrl = await capturarFoto(cam.cameraIndexCode);
      const buffer = await descargarImagen(picUrl);
      const archivo = path.join(DESTINO, `${hoy}_${nombre.replace(/[^A-Za-z0-9_-]/g, '_')}.jpg`);
      fs.writeFileSync(archivo, buffer);
      console.log(`OK  - ${nombre} (${cam.cameraIndexCode}) -> ${buffer.length} bytes -> ${archivo}`);
    } catch (err) {
      console.log(`FAIL - ${nombre} (${cam.cameraIndexCode}): ${err.message}`);
    }
  }
})();
