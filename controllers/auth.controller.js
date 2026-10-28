const jwt = require('jsonwebtoken');
const bcrypt = require("bcrypt");
const Usuario = require('../models/Usuario');
const Rol = require('../models/Rol');

exports.login = async (req, res) => {
  try {
    const { correo, password } = req.body;

    if (!correo || !password) {
      return res.status(400).json({ message: 'Correo y contraseña son obligatorios' });
    }

    const usuario = await Usuario.findOne({ correo });

    if (!usuario || !usuario.activo) {
      return res.status(401).json({
        message: "Credenciales inválidas"
      });
    }
    const passwordOk = await bcrypt.compare(
      password,
      usuario.password_hash
    );

    if (!passwordOk) {
      return res.status(401).json({
        message: "Credenciales inválidas"
      });
    }

    const rol = await Rol.findOne({
    clave: usuario.rol,
    activo: true
    });

    if (!rol) {
      return res.status(403).json({
        message: "Rol no válido o inactivo"
      });
    }

    const payload = {
      sub: usuario._id.toString(),
      correo: usuario.correo,
      nombre: `${usuario.nombre} ${usuario.apellidos}`,
      rol: rol.clave,
      permisos: rol.permisos
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES || '8h'
    });

    return res.json({
      message: 'Login exitoso',
      token,
      usuario: {
        id: usuario._id,
        nombre: `${usuario.nombre} ${usuario.apellidos}`,
        correo: usuario.correo,
        rol: rol.clave,
        permisos: rol.permisos
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error en el servidor' });
  }
};

exports.perfil = async (req, res) => {
  const usuario = await Usuario.findById(req.user.sub).select('-password_hash').lean();
  if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });
  const rol = await Rol.findOne({ clave: usuario.rol }).lean();

  return res.json({
    _id: usuario._id,
    nombre: usuario.nombre,
    apellidos: usuario.apellidos,
    correo: usuario.correo,
    rol: usuario.rol,
    area: usuario.area || null,
    activo: usuario.activo,
    permisos: rol ? rol.permisos : (req.user.permisos || [])
  });
};