const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth.middleware');
const upload = require('../middleware/upload');
const { checkPermisos, checkAlgunPermiso } = require('../middleware/permission.middleware');
const ctrl = require('../controllers/incidencias.controller');

router.get('/tecnicos',
  auth,
  checkAlgunPermiso('incidencias:asignar_tecnico', 'incidencias:reasignar_tecnico'),
  ctrl.listarTecnicos
);

router.get('/metricas',
  auth,
  checkAlgunPermiso('incidencias:ver_area', 'incidencias:supervisar_avances'),
  ctrl.obtenerMetricas
);

router.get('/actividad',
  auth,
  checkAlgunPermiso('incidencias:supervisar_avances'),
  ctrl.obtenerActividadReciente
);

module.exports = router;