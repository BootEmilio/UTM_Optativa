const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth.middleware');
const upload = require('../middleware/upload');
const { checkPermisos, checkAlgunPermiso } = require('../middleware/permission.middleware');
const ctrl = require('../controllers/incidencias.controller');

// ================== CONSULTAS ==================
router.get('/',
  auth,
  checkAlgunPermiso(
    'incidencias:ver_propias',
    'incidencias:ver_asignadas',
    'incidencias:ver_area',
    'analitica:ver'
  ),
  ctrl.listarIncidencias
);

router.get('/:id',
  auth,
  checkAlgunPermiso(
    'incidencias:ver_propias',
    'incidencias:ver_asignadas',
    'incidencias:ver_area',
    'analitica:ver'
  ),
  ctrl.obtenerIncidencia
);

// ================== REPORTANTE ==================
router.post('/',
  auth,
  checkPermisos('incidencias:crear'),
  ctrl.crearIncidencia
);

// ================== TÉCNICO ==================
router.patch('/:id/documentar',
  auth,
  checkPermisos('incidencias:documentar_intervencion'),
  ctrl.documentarIntervencion
);

router.patch('/:id/estado',
  auth,
  checkAlgunPermiso('incidencias:actualizar_estado', 'incidencias:supervisar_avances'),
  ctrl.actualizarEstado
);

router.patch('/:id/resolver',
  auth,
  checkAlgunPermiso('incidencias:resolver', 'incidencias:supervisar_avances'),
  ctrl.resolverIncidencia
);

router.patch('/:id/horas',
  auth,
  checkPermisos('incidencias:registrar_horas'),
  ctrl.registrarHoras
);

// ================== COORDINADOR ==================
router.patch('/:id/asignar',
  auth,
  checkAlgunPermiso('incidencias:asignar_tecnico', 'incidencias:reasignar_tecnico'),
  ctrl.asignarTecnico
);

router.patch('/:id/prioridad',
  auth,
  checkPermisos('incidencias:establecer_prioridad'),
  ctrl.establecerPrioridad
);

router.patch('/:id/tags',
  auth,
  checkPermisos('etiquetas:gestionar'),
  ctrl.gestionarTags
);

router.patch('/:id/cerrar',
  auth,
  checkPermisos('incidencias:cerrar'),
  ctrl.cerrarIncidencia
);

router.patch('/:id/reabrir',
  auth,
  checkPermisos('incidencias:reabrir'),
  ctrl.reabrirIncidencia
);

// ================== COMUNES ==================
router.post('/:id/evidencias',
  auth,
  checkAlgunPermiso('evidencias:subir'),
  upload.single('archivo'),   // <-- campo del form-data se llama "archivo"
  ctrl.agregarEvidencia
);

router.post('/:id/comentario',
  auth,
  checkAlgunPermiso(
    'incidencias:agregar_informacion',
    'incidencias:documentar_intervencion',
    'incidencias:supervisar_avances'
  ),
  ctrl.agregarComentario
);

module.exports = router;