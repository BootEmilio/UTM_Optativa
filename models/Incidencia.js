const mongoose = require("mongoose");

// ---------- Subschemas ----------

const reportanteSubSchema = new mongoose.Schema({
  usuario_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  nombre: { type: String, required: true, minlength: 1, maxlength: 200 },
  tipo: {
    type: String,
    required: true,
    enum: ['docente', 'estudiante', 'administrativo']
  }
}, { _id: false });

const ubicacionSubSchema = new mongoose.Schema({
  edificio: {
    type: String,
    required: true,
    enum: ['C', 'G', 'M', 'T', 'F']
  },
  piso: { type: String, maxlength: 30 },
  aula: { type: String, maxlength: 50 },
  referencia: { type: String, maxlength: 300 }
}, { _id: false });

const tecnicoAsignadoSubSchema = new mongoose.Schema({
  usuario_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  nombre: { type: String, required: true, minlength: 1, maxlength: 200 }
}, { _id: false });

const historialSubSchema = new mongoose.Schema({
  fecha: { type: Date, required: true },
  usuario_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  autor: { type: String, maxlength: 200 },
  accion: {
    type: String,
    enum: [
      'creacion',
      'actualizacion_estado',
      'asignacion',
      'comentario',
      'carga_evidencia',
      'gestion_etiquetas',
      'resolucion',
      'cierre'
    ]
  },
  estado_nuevo: {
    type: String,
    required: true,
    enum: ['abierta', 'en_proceso', 'en_espera', 'resuelta', 'cerrada']
  },
  comentario: { type: String, required: true, minlength: 1, maxlength: 2000 },
  horas: { type: Number, min: 0 }
}, { _id: false });

const evidenciaSubSchema = new mongoose.Schema({
  nombre_archivo: { type: String, required: true, minlength: 1, maxlength: 255 },
  tipo_mime: {
    type: String,
    required: true,
    enum: ['image/jpeg', 'image/png', 'application/pdf']
  },
  peso_kb: { type: Number, required: true, min: 0 },
  url_storage: { type: String, required: true, minlength: 1, maxlength: 2048 },
  fecha_carga: { type: Date, required: true, default: Date.now }
}, { _id: false });

// ---------- Schema principal ----------

const IncidenciaSchema = new mongoose.Schema({
  codigo: {
    type: String,
    required: true,
    unique: true,
    match: /^INC-[0-9]{4}-[0-9]{4,}$/
  },
  titulo: { type: String, required: true, minlength: 5, maxlength: 150 },
  descripcion: { type: String, required: true, minlength: 10, maxlength: 2000 },
  categoria: {
    type: String,
    required: true,
    enum: ['computo_redes', 'infraestructura', 'academico']
  },
  prioridad: {
    type: String,
    enum: ['baja', 'media', 'alta', 'critica'],
    default: 'media'
  },
  estado: {
    type: String,
    enum: ['abierta', 'en_proceso', 'en_espera', 'resuelta', 'cerrada'],
    default: 'abierta'
  },
  reportante: { type: reportanteSubSchema, required: true },
  ubicacion: { type: ubicacionSubSchema, required: true },
  tecnico_asignado: { type: tecnicoAsignadoSubSchema }, // opcional
  detalle_especifico: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  tags: {
    type: [String],
    default: []
  },
  historial_seguimiento: {
    type: [historialSubSchema],
    default: []
  },
  evidencias_adjuntas: {
    type: [evidenciaSubSchema],
    default: []
  },
  horas_invertidas: { type: Number, default: 0, min: 0 },
  fecha_creacion: { type: Date, default: Date.now },
  fecha_resolucion: { type: Date }
}, {
  versionKey: false,      // 👈 elimina __v
  collection: 'incidencias_campus'
});

module.exports = mongoose.model('Incidencia', IncidenciaSchema);