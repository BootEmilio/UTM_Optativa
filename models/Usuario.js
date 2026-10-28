const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

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
},
{
    versionKey: false
}
);

UsuarioSchema.pre("save", async function () {
    if (!this.isModified("password_hash")) {
        return;
    }

    this.password_hash = await bcrypt.hash(
        this.password_hash,
        10
    );
});

module.exports = mongoose.model("Usuario", UsuarioSchema, "usuarios");