const mongoose = require('mongoose');

const UsuarioSchema = new mongoose.Schema({
    nombre: String,
    apellidos: String,
    correo: {
        type: String,
        unique: true   
    },
    password_hash: String,
    rol: String,
    tipo_reportante: String,
    activo: Boolean,
    fecha_creacion: Date
});

module.exports = mongoose.model("Usuario", UsuarioSchema, "usuarios");