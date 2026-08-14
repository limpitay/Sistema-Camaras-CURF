// Lista base de áreas/sectores del hospital, tomada del catálogo ya cargado
// en Sistema-Nomenclatura-CURF (docker/db/init.sql, tabla `sectors`) — acá
// solo como sugerencia de autocompletado (sin el código corto que usan allá,
// p. ej. "GUA"), no como catálogo cerrado: Admin puede seguir escribiendo
// cualquier nombre de área que no esté en esta lista. Sin acentos a
// propósito, para que coincida con el resto de los datos del sistema.
export const AREAS_SUGERIDAS = [
  'Operaciones',
  'Secretaria',
  'Administracion',
  'Direccion',
  'Enfermeria',
  'Laboratorio',
  'Comunicacion',
  'Recursos Humanos',
  'Finanzas',
  'Contabilidad',
  'Consultorios Externos',
  'Auditoria Medica',
  'Convenios',
  'Compras',
  'Mantenimiento',
  'Bioingenieria',
  'Internado Pediatria',
  'Internado Adultos',
  'Guardia Adultos',
  'Guardia Pediatrica',
  'Anestesia',
  'Office Varios',
  'Sistemas',
  'Fisioterapia',
  'Psicologia',
  'Nutricion',
  'Farmacia',
  'UTI Adultos',
  'UTI Pediatrica',
  'Quirofano',
  'Diagnostico por Imagenes',
];
