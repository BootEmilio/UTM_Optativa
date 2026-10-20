const mongoose = require("mongoose");

const IncidenciaSchema = new mongoose.Schema({
    codigo: {
        type: String,
        required: true,
        unique: true
    },

    titulo: {
        type: String,
        required: true
    },

    descripcion: {
        type: String,
        required: true
    },

    categoria: {
        type: String,
        required: true,
        enum: [
            "computo_redes",
            "infraestructura",
            "academico"
        ]
    },

    prioridad: {
        type: String,
        enum: ["baja", "media", "alta", "critica"],
        default: "media"
    },

    estado: {
        type: String,
        enum: [
            "abierta",
            "en_proceso",
            "en_espera",
            "resuelta",
            "cerrada"
        ],
        default: "abierta"
    },

    reportante: {
        usuario_id: mongoose.Schema.Types.ObjectId,
        nombre: String,
        correo: String
    },

    tecnico_asignado: {
        usuario_id: mongoose.Schema.Types.ObjectId,
        nombre: String
    },

    ubicacion: {
        edificio: String,
        aula: String
    },

    tags: [String],

    detalle_especifico: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    historial_seguimiento: [
        {
            fecha: Date,
            usuario: String,
            comentario: String,
            estado: String
        }
    ],

    evidencias_adjuntas: [
        {
            nombre_archivo: String,
            url: String,
            fecha_subida: Date
        }
    ],

    horas_invertidas: {
        type: Number,
        default: 0
    },

    fecha_creacion: {
        type: Date,
        default: Date.now
    },

    fecha_resolucion: Date
});

module.exports = mongoose.model(
    "Incidencia",
    IncidenciaSchema,
    "incidencias_campus"
);