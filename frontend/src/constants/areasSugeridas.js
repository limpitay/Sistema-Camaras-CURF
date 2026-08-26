// Lista base de areas/sectores del hospital, tomada del catalogo ya cargado
// en Sistema-Nomenclatura-CURF (docker/db/init.sql, tabla `sectors`) — aca
// solo como sugerencia de autocompletado (sin el codigo corto que usan alla,
// p. ej. "GUA"), no como catalogo cerrado: Admin puede seguir escribiendo
// cualquier nombre de area que no este en esta lista. Sin acentos a
// proposito, para que coincida con el resto de los datos del sistema.
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
