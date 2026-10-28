const Incidencia = require('../models/Incidencia');
const Usuario = require('../models/Usuario');
const supabase = require('../db/supabase');
const { generarCodigo } = require('../utils/codigoIncidencia');

/* -------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------- */
const construirFiltroPorRol = (user) => {
  // El reportante solo ve las suyas
  if (user.rol === 'reportante') {
    return { 'reportante.usuario_id': user.sub };
  }
  // Técnico ve las asignadas a él
  if (user.rol === 'tecnico_soporte') {
    return { 'tecnico_asignado.usuario_id': user.sub };
  }
  // coordinador, directivo, admin → sin filtro adicional
  return {};
};

const registrarHistorial = (incidencia, user, accion, estado_nuevo, comentario, horas = null) => {
  incidencia.historial_seguimiento.push({
    fecha: new Date(),
    usuario_id: user.sub,
    autor: user.nombre,
    accion,
    estado_nuevo,
    comentario,
    horas
  });
};

/* -------------------------------------------------------------
 * POST /api/incidencias  → reportante:crear
 * ------------------------------------------------------------- */
exports.crearIncidencia = async (req, res) => {
  try {
    const {
      titulo,
      descripcion,
      categoria,
      ubicacion,
      detalle_especifico,
      tags,
      evidencias_adjuntas
    } = req.body;

    if (!titulo || !categoria) {
      return res.status(400).json({ message: 'titulo y categoria son obligatorios' });
    }

    // Validar que el rol esté entre los que pueden reportar
    const usuario = await Usuario.findById(req.user.sub).lean();
    if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });

    const codigo = await generarCodigo();

    const incidencia = new Incidencia({
      codigo,
      titulo,
      descripcion,
      categoria,
      prioridad: 'media', // default; coordinador puede ajustarla después
      estado: 'abierta',
      reportante: {
        usuario_id: usuario._id,
        nombre: `${usuario.nombre} ${usuario.apellidos}`,
        tipo: usuario.tipo_reportante || 'estudiante', 'administrador_sistema': usuario.rol === 'administrador_sistema' ? true : false
      },
      tecnico_asignado: { usuario_id: null, nombre: null },
      ubicacion: ubicacion || {},
      detalle_especifico: detalle_especifico || {},
      tags: tags || [],
      evidencias_adjuntas: evidencias_adjuntas || [],
      horas_invertidas: 0,
      fecha_creacion: new Date(),
      fecha_resolucion: null
    });

    registrarHistorial(
      incidencia,
      req.user,
      'creacion',
      'abierta',
      'Incidencia registrada por el reportante.'
    );

    await incidencia.save();
    return res.status(201).json({ message: 'Incidencia creada', incidencia });
  } catch (error) {
    console.dir(error.errInfo, { depth: null });

  return res.status(500).json({
    message: "Error al crear la incidencia",
    error: error.message
  });
  }
};

/* -------------------------------------------------------------
 * GET /api/incidencias  → adapta según rol
 *  - reportante  → ver_propias
 *  - tecnico     → ver_asignadas
 *  - coordinador → ver_area
 *  - directivo   → analitica:ver
 *  - admin       → (puede consultar todo; tu rol no lo define, lo permitimos)
 * ------------------------------------------------------------- */
exports.listarIncidencias = async (req, res) => {
  try {
    const filtro = construirFiltroPorRol(req.user);

    // filtros opcionales por query
    const { estado, categoria, prioridad, edificio, busqueda } = req.query;

    const page  = Math.max(Number(req.query.page)  || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    if (estado) filtro.estado = estado;
    if (categoria) filtro.categoria = categoria;
    if (prioridad) filtro.prioridad = prioridad;
    if (edificio) filtro['ubicacion.edificio'] = edificio;
    
    if (busqueda) {
      const rx = new RegExp(busqueda, 'i');
      filtro.$or = [
        { titulo: rx },
        { descripcion: rx },
        { codigo: rx }
      ];
    }
    const [items, total] = await Promise.all([
      Incidencia.find(filtro)
        .sort({ fecha_creacion: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Incidencia.countDocuments(filtro)
    ]);

    // alias "incidencias" para no romper otros consumidores
    return res.json({ items, incidencias: items, total, page, limit });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al listar incidencias' });
  }
};

/* -------------------------------------------------------------
 * GET /api/incidencias/:id
 * ------------------------------------------------------------- */
exports.obtenerIncidencia = async (req, res) => {
  try {
    const incidencia = await Incidencia.findById(req.params.id).lean();
    if (!incidencia) return res.status(404).json({ message: 'Incidencia no encontrada' });

    // Control de acceso por rol
    if (req.user.rol === 'reportante' &&
        incidencia.reportante.usuario_id.toString() !== req.user.sub) {
      return res.status(403).json({ message: 'No tiene acceso a esta incidencia' });
    }
    if (req.user.rol === 'tecnico_soporte' &&
        incidencia.tecnico_asignado?.usuario_id?.toString() !== req.user.sub) {
      return res.status(403).json({ message: 'No tiene acceso a esta incidencia' });
    }

    return res.json(incidencia);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al obtener la incidencia' });
  }
};

/* -------------------------------------------------------------
 * PATCH /api/incidencias/:id/documentar
 *  técnico: documentar_intervencion
 * ------------------------------------------------------------- */
exports.documentarIntervencion = async (req, res) => {
  try {
    const { comentario } = req.body;
    if (!comentario) return res.status(400).json({ message: 'comentario es obligatorio' });

    const incidencia = await Incidencia.findById(req.params.id);
    if (!incidencia) return res.status(404).json({ message: 'No encontrada' });
    if (incidencia.tecnico_asignado?.usuario_id?.toString() !== req.user.sub) {
      return res.status(403).json({ message: 'Solo el técnico asignado puede documentar' });
    }

    registrarHistorial(
      incidencia, req.user, 'documentacion',
      incidencia.estado, comentario
    );
    await incidencia.save();
    return res.json({ message: 'Intervención documentada', incidencia });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al documentar' });
  }
};

/* -------------------------------------------------------------
 * PATCH /api/incidencias/:id/estado
 *  técnico: actualizar_estado | coordinador: supervisar_avances
 * ------------------------------------------------------------- */
exports.actualizarEstado = async (req, res) => {
  try {
    const { estado, comentario } = req.body;
    const estadosValidos = ['abierta', 'en_proceso', 'resuelta', 'cerrada', 'reabierta'];
    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({ message: 'Estado no válido' });
    }

    const incidencia = await Incidencia.findById(req.params.id);
    if (!incidencia) return res.status(404).json({ message: 'No encontrada' });

    // técnico solo puede pasar a en_proceso o resuelta
    if (req.user.rol === 'tecnico_soporte') {
      if (!['en_proceso', 'resuelta'].includes(estado)) {
        return res.status(403).json({ message: 'El técnico solo puede pasar a en_proceso o resuelta' });
      }
      if (incidencia.tecnico_asignado?.usuario_id?.toString() !== req.user.sub) {
        return res.status(403).json({ message: 'Solo el técnico asignado puede actualizar el estado' });
      }
    }

    // coordinador solo cierra/reabre
    if (req.user.rol === 'coordinador_soporte') {
      if (!['cerrada', 'reabierta'].includes(estado)) {
        return res.status(403).json({ message: 'El coordinador solo puede cerrar o reabrir' });
      }
    }

    incidencia.estado = estado;
    if (estado === 'resuelta' && !incidencia.fecha_resolucion) {
      incidencia.fecha_resolucion = new Date();
    }
    if (estado === 'reabierta') {
      incidencia.fecha_resolucion = null;
    }

    registrarHistorial(
      incidencia, req.user, 'actualizacion_estado', estado,
      comentario || `Estado actualizado a ${estado}.`
    );
    await incidencia.save();
    return res.json({ message: 'Estado actualizado', incidencia });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al actualizar estado' });
  }
};

/* -------------------------------------------------------------
 * PATCH /api/incidencias/:id/resolver  (técnico)
 *  técnico: resolver + registrar_horas
 * ------------------------------------------------------------- */
exports.resolverIncidencia = async (req, res) => {
  try {
    const { comentario, horas } = req.body;
    if (!comentario) return res.status(400).json({ message: 'comentario es obligatorio' });

    const incidencia = await Incidencia.findById(req.params.id);
    if (!incidencia) return res.status(404).json({ message: 'No encontrada' });
    if (incidencia.tecnico_asignado?.usuario_id?.toString() !== req.user.sub) {
      return res.status(403).json({ message: 'Solo el técnico asignado puede resolver' });
    }

    const horasNum = Number(horas) || 0;

    incidencia.estado = 'resuelta';
    incidencia.fecha_resolucion = new Date();
    incidencia.horas_invertidas = (incidencia.horas_invertidas || 0) + horasNum;

    registrarHistorial(
      incidencia, req.user, 'resolucion', 'resuelta', comentario, horasNum
    );
    await incidencia.save();
    return res.json({ message: 'Incidencia resuelta', incidencia });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al resolver incidencia' });
  }
};

/* -------------------------------------------------------------
 * PATCH /api/incidencias/:id/horas  (técnico)
 * ------------------------------------------------------------- */
exports.registrarHoras = async (req, res) => {
  try {
    const { horas, comentario } = req.body;
    if (!horas || horas <= 0) return res.status(400).json({ message: 'horas debe ser > 0' });

    const incidencia = await Incidencia.findById(req.params.id);
    if (!incidencia) return res.status(404).json({ message: 'No encontrada' });
    if (incidencia.tecnico_asignado?.usuario_id?.toString() !== req.user.sub) {
      return res.status(403).json({ message: 'Solo el técnico asignado puede registrar horas' });
    }

    incidencia.horas_invertidas = (incidencia.horas_invertidas || 0) + Number(horas);

    registrarHistorial(
      incidencia, req.user, 'documentacion', incidencia.estado,
      comentario || 'Registro de horas de trabajo.', Number(horas)
    );
    await incidencia.save();
    return res.json({ message: 'Horas registradas', horas_invertidas: incidencia.horas_invertidas });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al registrar horas' });
  }
};

/* -------------------------------------------------------------
 * PATCH /api/incidencias/:id/asignar  (coordinador)
 * ------------------------------------------------------------- */
exports.asignarTecnico = async (req, res) => {
  try {
    const { tecnico_id, comentario } = req.body;
    if (!tecnico_id) return res.status(400).json({ message: 'tecnico_id es obligatorio' });

    const tecnico = await Usuario.findById(tecnico_id).lean();
    if (!tecnico || tecnico.rol !== 'tecnico_soporte' || !tecnico.activo) {
      return res.status(400).json({ message: 'Técnico no válido o inactivo' });
    }

    const incidencia = await Incidencia.findById(req.params.id);
    if (!incidencia) return res.status(404).json({ message: 'No encontrada' });

    const esReasignacion = !!incidencia.tecnico_asignado?.usuario_id;

    incidencia.tecnico_asignado = {
      usuario_id: tecnico._id,
      nombre: `${tecnico.nombre} ${tecnico.apellidos}`
    };
    if (incidencia.estado === 'abierta') incidencia.estado = 'en_proceso';

    registrarHistorial(
      incidencia, req.user,
      esReasignacion ? 'reasignacion' : 'asignacion',
      incidencia.estado,
      comentario || `Técnico ${tecnico.nombre} ${tecnico.apellidos} asignado.`
    );
    await incidencia.save();
    return res.json({ message: 'Técnico asignado', incidencia });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al asignar técnico' });
  }
};

/* -------------------------------------------------------------
 * PATCH /api/incidencias/:id/prioridad  (coordinador)
 * ------------------------------------------------------------- */
exports.establecerPrioridad = async (req, res) => {
  try {
    const { prioridad, comentario } = req.body;
    const validas = ['baja', 'media', 'alta', 'critica'];
    if (!validas.includes(prioridad)) {
      return res.status(400).json({ message: 'Prioridad no válida' });
    }

    const incidencia = await Incidencia.findById(req.params.id);
    if (!incidencia) return res.status(404).json({ message: 'No encontrada' });

    const anterior = incidencia.prioridad;
    incidencia.prioridad = prioridad;

    registrarHistorial(
      incidencia, req.user, 'prioridad', incidencia.estado,
      comentario || `Prioridad cambiada de ${anterior} a ${prioridad}.`
    );
    await incidencia.save();
    return res.json({ message: 'Prioridad actualizada', incidencia });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al actualizar prioridad' });
  }
};

/* POST /api/incidencias/:id/tags   body: { tag } */
exports.agregarTag = async (req, res) => {
  try {
    const { tag } = req.body;
    if (!tag || !String(tag).trim()) {
      return res.status(400).json({ message: 'tag es obligatorio' });
    }
    const normalizado = String(tag).trim().toLowerCase();

    const incidencia = await Incidencia.findById(req.params.id);
    if (!incidencia) return res.status(404).json({ message: 'No encontrada' });

    if (!incidencia.tags.includes(normalizado)) {
      incidencia.tags.push(normalizado);
      registrarHistorial(
        incidencia, req.user, 'etiquetas', incidencia.estado,
        `Etiqueta agregada: ${normalizado}`
      );
      await incidencia.save();
    }

    return res.json({ message: 'Etiqueta agregada', incidencia });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al agregar etiqueta' });
  }
};

/* DELETE /api/incidencias/:id/tags/:tag */
exports.eliminarTag = async (req, res) => {
  try {
    const normalizado = decodeURIComponent(req.params.tag).trim().toLowerCase();

    const incidencia = await Incidencia.findById(req.params.id);
    if (!incidencia) return res.status(404).json({ message: 'No encontrada' });

    incidencia.tags = incidencia.tags.filter((t) => t !== normalizado);

    registrarHistorial(
      incidencia, req.user, 'etiquetas', incidencia.estado,
      `Etiqueta eliminada: ${normalizado}`
    );
    await incidencia.save();

    return res.json({ message: 'Etiqueta eliminada', incidencia });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al eliminar etiqueta' });
  }
};

/* -------------------------------------------------------------
 * POST /api/incidencias/:id/evidencias  (reportante + técnico)
 * ------------------------------------------------------------- */

exports.agregarEvidencia = async (req, res) => {
  try {
    // 1. Verificar que venga el archivo
    if (!req.file) {
      return res.status(400).json({ message: 'No se recibió ningún archivo' });
    }

    const incidencia = await Incidencia.findById(req.params.id);
    if (!incidencia) {
      return res.status(404).json({ message: 'Incidencia no encontrada' });
    }

    // 2. Validar permisos según rol (igual que antes)
    if (req.user.rol === 'reportante' &&
        incidencia.reportante.usuario_id.toString() !== req.user.sub) {
      return res.status(403).json({ message: 'No puede adjuntar evidencias a esta incidencia' });
    }
    if (req.user.rol === 'tecnico_soporte' &&
        incidencia.tecnico_asignado?.usuario_id?.toString() !== req.user.sub) {
      return res.status(403).json({ message: 'No puede adjuntar evidencias a esta incidencia' });
    }

    // 3. Generar nombre único para el archivo
    const timestamp = Date.now();
    const nombreSeguro = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const pathStorage = `incidencias/${incidencia._id}/${timestamp}-${nombreSeguro}`;

    // 4. Subir a Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .upload(pathStorage, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (uploadError) {
      console.error('Error Supabase:', uploadError);
      return res.status(500).json({ message: 'Error al subir archivo a Supabase', detalle: uploadError.message });
    }

    // 5. Obtener URL pública (requiere bucket público)
    const { data: urlData } = supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .getPublicUrl(pathStorage);

    const urlPublica = urlData.publicUrl;

    // 6. Guardar metadata en MongoDB (mismo esquema que ya tienes)
    incidencia.evidencias_adjuntas.push({
      nombre_archivo: req.file.originalname,
      tipo_mime: req.file.mimetype,
      peso_kb: Math.round(req.file.size / 1024),
      url_storage: urlPublica,
      fecha_carga: new Date()
    });

    registrarHistorial(
      incidencia, req.user, 'documentacion', incidencia.estado,
      `Se adjuntó evidencia: ${req.file.originalname}`
    );

    await incidencia.save();

    return res.json({
      message: 'Evidencia agregada',
      evidencia: incidencia.evidencias_adjuntas[incidencia.evidencias_adjuntas.length - 1]
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al agregar evidencia', detalle: error.message });
  }
};

/* -------------------------------------------------------------
 * POST /api/incidencias/:id/comentario
 *  todos los involucrados pueden comentar (reportante dueño / técnico asignado / coordinador)
 * ------------------------------------------------------------- */
exports.agregarComentario = async (req, res) => {
  try {
    const { comentario } = req.body;
    if (!comentario) return res.status(400).json({ message: 'comentario es obligatorio' });

    const incidencia = await Incidencia.findById(req.params.id);
    if (!incidencia) return res.status(404).json({ message: 'No encontrada' });

    const esReportanteDueno =
      req.user.rol === 'reportante' &&
      incidencia.reportante.usuario_id.toString() === req.user.sub;

    const esTecnicoAsignado =
      req.user.rol === 'tecnico_soporte' &&
      incidencia.tecnico_asignado?.usuario_id?.toString() === req.user.sub;

    const esCoordinador = req.user.rol === 'coordinador_soporte';

    if (!esReportanteDueno && !esTecnicoAsignado && !esCoordinador) {
      return res.status(403).json({ message: 'No puede comentar esta incidencia' });
    }

    registrarHistorial(incidencia, req.user, 'comentario', incidencia.estado, comentario);
    await incidencia.save();
    return res.json({ message: 'Comentario agregado', incidencia });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al agregar comentario' });
  }
};

/* -------------------------------------------------------------
 * PATCH /api/incidencias/:id/cerrar  (coordinador)
 * ------------------------------------------------------------- */
exports.cerrarIncidencia = async (req, res) => {
  try {
    const { comentario } = req.body;
    const incidencia = await Incidencia.findById(req.params.id);
    if (!incidencia) return res.status(404).json({ message: 'No encontrada' });

    if (incidencia.estado !== 'resuelta') {
      return res.status(400).json({ message: 'Solo se pueden cerrar incidencias resueltas' });
    }

    incidencia.estado = 'cerrada';
    registrarHistorial(
      incidencia, req.user, 'cierre', 'cerrada',
      comentario || 'Se confirma la solución y se cierra la incidencia.'
    );
    await incidencia.save();
    return res.json({ message: 'Incidencia cerrada', incidencia });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al cerrar incidencia' });
  }
};

/* -------------------------------------------------------------
 * PATCH /api/incidencias/:id/reabrir  (coordinador)
 * ------------------------------------------------------------- */
exports.reabrirIncidencia = async (req, res) => {
  try {
    const { comentario } = req.body;
    const incidencia = await Incidencia.findById(req.params.id);
    if (!incidencia) return res.status(404).json({ message: 'No encontrada' });

    incidencia.estado = 'abierta';
    incidencia.fecha_resolucion = null;

    registrarHistorial(
      incidencia, req.user, 'reapertura', 'reabierta',
      comentario || 'Se reabre la incidencia para nueva revisión.'
    );
    await incidencia.save();
    return res.json({ message: 'Incidencia reabierta', incidencia });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al reabrir incidencia' });
  }
  
};

/* GET /api/coordinador/tecnicos */
exports.listarTecnicos = async (req, res) => {
  try {
    const tecnicos = await Usuario.find({ rol: 'tecnico_soporte', activo: true })
      .select('_id nombre apellidos correo especialidad activo')
      .lean();

    const ids = tecnicos.map((t) => t._id);

    const conteos = await Incidencia.aggregate([
      {
        $match: {
          'tecnico_asignado.usuario_id': { $in: ids },
          estado: { $in: ['abierta', 'en_proceso', 'reabierta'] }
        }
      },
      { $group: { _id: '$tecnico_asignado.usuario_id', total: { $sum: 1 } } }
    ]);

    const mapa = conteos.reduce((acc, c) => {
      acc[c._id.toString()] = c.total;
      return acc;
    }, {});

    const data = tecnicos.map((t) => ({
      _id: t._id,
      nombre: `${t.nombre} ${t.apellidos}`,
      correo: t.correo,
      especialidad: t.especialidad || null,
      activo: t.activo,
      incidencias_activas: mapa[t._id.toString()] || 0
    }));

    return res.json(data);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al listar técnicos' });
  }
};

/* GET /api/coordinador/metricas */
exports.obtenerMetricas = async (req, res) => {
  try {
    const [pendientesAsignar, enProceso, resueltasAuditar, cerradas, total] =
      await Promise.all([
        Incidencia.countDocuments({ estado: 'abierta', 'tecnico_asignado.usuario_id': null }),
        Incidencia.countDocuments({ estado: 'en_proceso' }),
        Incidencia.countDocuments({ estado: 'resuelta' }),
        Incidencia.countDocuments({ estado: 'cerrada' }),
        Incidencia.countDocuments({})
      ]);

    return res.json({ pendientesAsignar, enProceso, resueltasAuditar, cerradas, total });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al obtener métricas' });
  }
};

/* GET /api/coordinador/actividad?limite=5 */
exports.obtenerActividadReciente = async (req, res) => {
  try {
    const limite = Math.min(Number(req.query.limite) || 5, 50);

    const eventos = await Incidencia.aggregate([
      { $unwind: '$historial_seguimiento' },
      { $sort: { 'historial_seguimiento.fecha': -1 } },
      { $limit: limite },
      {
        $project: {
          _id: 0,
          incidencia_id: '$_id',
          codigo: '$codigo',
          titulo: '$titulo',
          fecha: '$historial_seguimiento.fecha',
          usuario_id: '$historial_seguimiento.usuario_id',
          autor: '$historial_seguimiento.autor',
          accion: '$historial_seguimiento.accion',
          estado_nuevo: '$historial_seguimiento.estado_nuevo',
          comentario: '$historial_seguimiento.comentario'
        }
      }
    ]);

    return res.json(eventos);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al obtener actividad' });
  }
};