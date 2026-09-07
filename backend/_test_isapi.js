require('dotenv').config({ path: '../.env' });
const {
  obtenerInfoDispositivo, obtenerEstadoDiscos, obtenerEstadoCanales, obtenerParametrosVideoCanal,
  buscarGrabacionMasAntigua, isapiXml,
} = require('./src/utils/isapiClient');

const nvr = {
  hostname: 'test',
  ip: process.env.ISAPI_TEST_IP,
  usuario: process.env.ISAPI_TEST_USUARIO,
  contrasena: process.env.ISAPI_TEST_CONTRASENA,
};

(async () => {
  console.log(`Probando NVR ${nvr.ip}...\n`);

  try {
    console.log('deviceInfo OK:', await obtenerInfoDispositivo(nvr));
  } catch (err) {
    console.log('deviceInfo FAIL:', err.message);
  }

  try {
    console.log('Storage OK:', await obtenerEstadoDiscos(nvr));
  } catch (err) {
    console.log('Storage FAIL:', err.message);
  }

  try {
    const crudo = await isapiXml(nvr, 'GET', '/ISAPI/ContentMgmt/InputProxy/channels/status');
    console.log('InputProxy/channels/status crudo:', JSON.stringify(crudo, null, 2));
    console.log('parseado:', await obtenerEstadoCanales(nvr));
  } catch (err) {
    console.log('InputProxy/channels/status FAIL:', err.message);
  }

  try {
    console.log('parametros video canal 1:', await obtenerParametrosVideoCanal(nvr, 1));
  } catch (err) {
    console.log('parametros video canal 1 FAIL:', err.message);
  }

  try {
    console.log('search (canal 1) OK, grabacion mas antigua:', await buscarGrabacionMasAntigua(nvr, 1));
  } catch (err) {
    console.log('search FAIL:', err.message);
  }
})();
