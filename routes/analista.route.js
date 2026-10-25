const express = require('express');
const router = express.Router();

const analista = require('../controllers/analista.controller');
const auth = require('../middleware/auth.middleware');
const { checkPermisos, checkRol } = require('../middleware/permission.middleware');

const soloAnalitica = [
  auth,
  checkRol('directivo_analista', 'administrador_sistema'),
  checkPermisos('analitica:ver')
];

router.get('/dashboard',              ...soloAnalitica, analista.obtenerDashboard);
router.get('/summary',                ...soloAnalitica, analista.obtenerSummary);
router.get('/incidents-by-category',  ...soloAnalitica, analista.obtenerPorCategoria);
router.get('/incidents-by-status',    ...soloAnalitica, analista.obtenerPorEstado);
router.get('/reports', ...soloAnalitica, analista.obtenerReporte);
router.get('/resolution-times', ...soloAnalitica, analista.obtenerTiemposResolucion);
router.get('/recurring-failures', ...soloAnalitica, analista.obtenerFallasRecurrentes);

module.exports = router;