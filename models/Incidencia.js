const mongoose = require("mongoose");

const IncidenciaSchema = new mongoose.Schema(
  {
    codigo: { type: String, required: true, unique: true },
    titulo: { type: String, required: true },
    descripcion: { type: String, required: true },
    categoria: {
      type: String,
      required: true,
      enum: ["computo_redes", "infraestructura", "academico"]
    },
    prioridad: {
      type: String,
      enum: ["baja", "media", "alta", "critica"],
      default: "media"
    },
    estado: {
      type: String,
      enum: ["abierta", "en_proceso", "en_espera", "resuelta", "cerrada"],
      default: "abierta"
    },

    reportante: {
      usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
      nombre: { type: String, required: true },
      tipo: { type: String }   // 👈 faltaba
    },

    tecnico_asignado: {
      usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", default: null },
      nombre: { type: String, default: null }
    },

    ubicacion: {
      edificio: { type: String, required: true },
      piso: String,          // 👈 faltaba
      aula: String,
      referencia: String     // 👈 faltaba
    },

    tags: [String],

    detalle_especifico: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    historial_seguimiento: [
      {
        fecha: { type: Date, default: Date.now },
        usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" }, // 👈
        autor: String,          // 👈 (antes "usuario")
        accion: String,         // 👈
        estado_nuevo: String,   // 👈 (antes "estado")
        comentario: String,
        horas: Number           // 👈
      }
    ],

    evidencias_adjuntas: [
      {
        nombre_archivo: { type: String, required: true },
        tipo_mime: String,      // 👈
        peso_kb: Number,        // 👈
        url_storage: String,    // 👈 (antes "url")
        fecha_carga: Date       // 👈 (antes "fecha_subida")
      }
    ],

    horas_invertidas: { type: Number, default: 0 },
    fecha_creacion: { type: Date, default: Date.now },
    fecha_resolucion: { type: Date, default: null }
  },
  { collection: "incidencias_campus" }
);

module.exports = mongoose.model("Incidencia", IncidenciaSchema);