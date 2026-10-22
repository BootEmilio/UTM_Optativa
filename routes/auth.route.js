const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.middleware');
const { login, perfil } = require('../controllers/auth.controller');

router.post('/login', login);
router.get('/perfil', auth, perfil);

module.exports = router;