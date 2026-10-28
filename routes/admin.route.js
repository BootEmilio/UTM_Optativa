// routes/admin.js
const express = require('express');
const router = express.Router();
const admin = require('../controllers/admin.Controller');
const auth = require('../middleware/auth.middleware');
const { checkPermisos } = require('../middleware/permission.middleware');

/* =========================================================
 * DASHBOARD / MÉTRICAS / ANALÍTICA
 * ========================================================= */
router.get(
  '/dashboard',
  auth,
  checkPermisos(['analitica:ver']),
  admin.obtenerDashboardGlobal
);

router.get(
  '/metricas',
  auth,
  checkPermisos(['analitica:ver']),
  admin.obtenerMetricas
);

router.get(
  '/actividad',
  auth,
  checkPermisos(['auditoria:consultar']),
  admin.obtenerActividadGlobal
);

router.get(
  '/tecnicos',
  auth,
  checkPermisos(['usuarios:ver']),
  admin.listarTecnicos
);

/* =========================================================
 * INCIDENCIAS — lectura
 * ========================================================= */
router.get(
  '/incidencias',
  auth,
  checkPermisos(['incidencias:ver_area']),
  admin.listarTodasIncidencias
);

router.get(
  '/incidencias/:id',
  auth,
  checkPermisos(['incidencias:ver_area']),
  admin.obtenerIncidencia
);

/* =========================================================
 * INCIDENCIAS — edición
 * ========================================================= */
router.patch(
  '/incidencias/:id',
  auth,
  checkPermisos(['incidencias:agregar_informacion']),
  admin.editarIncidencia
);

router.patch(
  '/incidencias/:id/asignar',
  auth,
  checkPermisos(['incidencias:asignar_tecnico', 'incidencias:reasignar_tecnico']),
  admin.asignarTecnico
);

router.patch(
  '/incidencias/:id/estado',
  auth,
  checkPermisos([
    'incidencias:actualizar_estado',
    'incidencias:supervisar_avances',
    'incidencias:cerrar',
    'incidencias:reabrir'
  ]),
  admin.cambiarEstado
);

router.patch(
  '/incidencias/:id/prioridad',
  auth,
  checkPermisos(['incidencias:establecer_prioridad']),
  admin.cambiarPrioridad
);

router.post(
  '/incidencias/:id/comentario',
  auth,
  checkPermisos(['incidencias:agregar_informacion', 'incidencias:documentar_intervencion']),
  admin.comentar
);

router.delete(
  '/incidencias/:id',
  auth,
  checkPermisos(['incidencias:auditar_resueltas']), // opcional: o crea "incidencias:eliminar"
  admin.eliminarIncidencia
);

/* =========================================================
 * USUARIOS
 * ========================================================= */
router.get(
  '/usuarios',
  auth,
  checkPermisos(['usuarios:ver']),
  admin.listarUsuarios
);

router.get(
  '/usuarios/:id',
  auth,
  checkPermisos(['usuarios:ver']),
  admin.obtenerUsuario
);

router.patch(
  '/usuarios/:id/rol',
  auth,
  checkPermisos(['usuarios:asignar_roles', 'roles:consultar']),
  admin.cambiarRolUsuario
);

router.patch(
  '/usuarios/:id/estado',
  auth,
  checkPermisos(['usuarios:habilitar', 'usuarios:deshabilitar']),
  admin.cambiarEstadoUsuario
);

router.delete(
  '/usuarios/:id',
  auth,
  checkPermisos(['usuarios:deshabilitar']),
  admin.eliminarUsuario
);

router.post(
  '/usuarios',
  auth,
  checkPermisos(['usuarios:crear']),
  admin.agregarUsuario
);

module.exports = router;