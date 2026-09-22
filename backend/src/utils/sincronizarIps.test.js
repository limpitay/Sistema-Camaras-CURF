const { calcularSincronizacion, normalizarNombreCanal } = require('./sincronizarIps');

describe('normalizarNombreCanal', () => {
  test('recorta espacios y pasa a mayusculas', () => {
    expect(normalizarNombreCanal('  camjrp634 ')).toBe('CAMJRP634');
  });

  test('null/undefined -> string vacio', () => {
    expect(normalizarNombreCanal(null)).toBe('');
    expect(normalizarNombreCanal(undefined)).toBe('');
  });
});

describe('calcularSincronizacion', () => {
  test('nombre duplicado en 2 canales en vivo: va a ambiguos, no se toca la camara del inventario', () => {
    // Caso real de la conversacion: CAMONPB69 aparece en NVR#1 canal 20 y
    // NVR#3 canal 13, con IPs distintas -- no hay forma de saber cual le
    // corresponde a la fila del inventario sin ambiguedad.
    const canalesEnVivo = [
      { nvrId: 1, nvr: 'NVR#1', canal: 20, ip: '192.168.0.94', nombre: 'CAMONPB69' },
      { nvrId: 3, nvr: 'NVR#3', canal: 13, ip: '192.168.0.90', nombre: 'CAMONPB69' },
    ];
    const camaras = [
      { id: 175, hostname: 'CAMONPB69', descripcion: 'Guardia', ip: '192.168.0.239', nvr_id: 11, canal: null },
    ];

    const { actualizar, ambiguos, sinCambios } = calcularSincronizacion({ canalesEnVivo, camaras });

    expect(actualizar).toHaveLength(0);
    expect(sinCambios).toBe(0);
    expect(ambiguos).toHaveLength(1);
    expect(ambiguos[0].hostname).toBe('CAMONPB69');
    expect(ambiguos[0].ocurrencias).toEqual(
      expect.arrayContaining([
        { nvr: 'NVR#1', canal: 20, ip: '192.168.0.94' },
        { nvr: 'NVR#3', canal: 13, ip: '192.168.0.90' },
      ])
    );
  });

  test('match unico por nombre con IP distinta: se propone actualizar ip/nvr_id/canal, hostname queda igual', () => {
    // Caso real: CAMJRP634 esta cargada con 192.168.0.179 (compartida por
    // error con CAMJRP635), el NVR reporta otra IP real para ese nombre.
    const canalesEnVivo = [
      { nvrId: 8, nvr: 'NVR#4', canal: 8, ip: '192.168.0.100', nombre: 'CAMJRP634' },
    ];
    const camaras = [
      { id: 185, hostname: 'CAMJRP634', descripcion: 'Finanzas', ip: '192.168.0.179', nvr_id: 8, canal: null },
    ];

    const { actualizar, ambiguos, sinCambios } = calcularSincronizacion({ canalesEnVivo, camaras });

    expect(ambiguos).toHaveLength(0);
    expect(sinCambios).toBe(0);
    expect(actualizar).toEqual([{
      camaraId: 185,
      hostname: 'CAMJRP634',
      hostnameNuevo: 'CAMJRP634',
      descripcion: 'Finanzas',
      ipActual: '192.168.0.179',
      ipNueva: '192.168.0.100',
      nvr: 'NVR#4',
      nvrIdNuevo: 8,
      canal: 8,
      matchPor: 'nombre',
    }]);
  });

  test('match por posicion (nvr_id + canal): corrige hostname e ip aunque el nombre guardado sea otro', () => {
    const canalesEnVivo = [
      { nvrId: 8, nvr: 'NVR#4', canal: 8, ip: '192.168.0.100', nombre: 'CAMJRP634B' },
    ];
    const camaras = [
      { id: 185, hostname: 'CAMJRP634-VIEJO', descripcion: 'Finanzas', ip: '192.168.0.179', nvr_id: 8, canal: 8 },
    ];

    const { actualizar } = calcularSincronizacion({ canalesEnVivo, camaras });

    expect(actualizar).toEqual([{
      camaraId: 185,
      hostname: 'CAMJRP634-VIEJO',
      hostnameNuevo: 'CAMJRP634B',
      descripcion: 'Finanzas',
      ipActual: '192.168.0.179',
      ipNueva: '192.168.0.100',
      nvr: 'NVR#4',
      nvrIdNuevo: 8,
      canal: 8,
      matchPor: 'canal',
    }]);
  });

  test('el match por posicion tiene prioridad sobre el match por nombre', () => {
    const canalesEnVivo = [
      { nvrId: 8, nvr: 'NVR#4', canal: 8, ip: '192.168.0.100', nombre: 'CAMX' },
      { nvrId: 8, nvr: 'NVR#4', canal: 9, ip: '192.168.0.101', nombre: 'CAMX-OTRA' },
    ];
    // Esta camara tiene canal=9 cargado, pero su hostname coincide con el
    // nombre en vivo del canal 8 -- tiene que ganar la posicion (canal 9).
    const camaras = [
      { id: 1, hostname: 'CAMX', descripcion: null, ip: '192.168.0.101', nvr_id: 8, canal: 9 },
    ];

    const { actualizar, sinCambios } = calcularSincronizacion({ canalesEnVivo, camaras });

    // canal 9 ya tiene la ip correcta (.101) pero el nombre en vivo ahi es
    // "CAMX-OTRA", distinto al hostname guardado "CAMX" -> hay cambio.
    expect(sinCambios).toBe(0);
    expect(actualizar).toEqual([{
      camaraId: 1,
      hostname: 'CAMX',
      hostnameNuevo: 'CAMX-OTRA',
      descripcion: null,
      ipActual: '192.168.0.101',
      ipNueva: '192.168.0.101',
      nvr: 'NVR#4',
      nvrIdNuevo: 8,
      canal: 9,
      matchPor: 'canal',
    }]);
  });

  test('camara ya sincronizada (mismo hostname/ip/nvr/canal): cuenta como sinCambios, no aparece en actualizar', () => {
    const canalesEnVivo = [
      { nvrId: 8, nvr: 'NVR#4', canal: 8, ip: '192.168.0.100', nombre: 'CAMJRP634' },
    ];
    const camaras = [
      { id: 185, hostname: 'CAMJRP634', descripcion: 'Finanzas', ip: '192.168.0.100', nvr_id: 8, canal: 8 },
    ];

    const { actualizar, ambiguos, sinCambios } = calcularSincronizacion({ canalesEnVivo, camaras });

    expect(actualizar).toHaveLength(0);
    expect(ambiguos).toHaveLength(0);
    expect(sinCambios).toBe(1);
  });

  test('camara sin ningun canal en vivo que la mencione: se ignora (no aparece en ningun lado)', () => {
    const canalesEnVivo = [
      { nvrId: 8, nvr: 'NVR#4', canal: 8, ip: '192.168.0.100', nombre: 'OTRA-CAMARA' },
    ];
    const camaras = [
      { id: 999, hostname: 'CAMARA-DESCONECTADA', descripcion: null, ip: '192.168.0.5', nvr_id: null, canal: null },
    ];

    const { actualizar, ambiguos, sinCambios } = calcularSincronizacion({ canalesEnVivo, camaras });

    expect(actualizar).toHaveLength(0);
    expect(ambiguos).toHaveLength(0);
    expect(sinCambios).toBe(0);
  });

  test('canal en vivo sin nombre configurado (null): no rompe y no genera match por nombre', () => {
    const canalesEnVivo = [
      { nvrId: 8, nvr: 'NVR#4', canal: 5, ip: '192.168.0.50', nombre: null },
    ];
    const camaras = [
      { id: 1, hostname: 'CAM-1', descripcion: null, ip: null, nvr_id: null, canal: null },
    ];

    expect(() => calcularSincronizacion({ canalesEnVivo, camaras })).not.toThrow();
    const { actualizar, ambiguos } = calcularSincronizacion({ canalesEnVivo, camaras });
    expect(actualizar).toHaveLength(0);
    expect(ambiguos).toHaveLength(0);
  });
});
