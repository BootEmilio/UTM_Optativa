const mongoose = require("mongoose");

const RolSchema = new mongoose.Schema({
    clave: {
        type: String,
        required: true,
        unique: true
    },
    nombre: String,
    descripcion: String,
    permisos: [String],
    activo: Boolean,
    fecha_creacion: Date
});

module.exports = mongoose.model("Rol", RolSchema, "roles");