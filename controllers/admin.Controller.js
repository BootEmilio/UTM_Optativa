// controllers/admin.Controller.js
const bcrypt = require("bcrypt");
const Incidencia = require('../models/Incidencia');
const Usuario = require('../models/Usuario');
const supabase = require('../db/supabase');

/* -------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------- */
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

const ESTADOS_VALIDOS = ['abierta', 'en_proceso', 'en_espera', 'resuelta', 'cerrada', 'reabierta'];
const PRIORIDADES_VALIDAS = ['baja', 'media', 'alta', 'critica'];
const ROLES_VALIDOS = ['reportante', 'tecnico_soporte', 'coordinador_soporte', 'directivo', 'administrador'];

const tienePermiso = (user, permiso) =>
  Array.isArray(user?.permisos) && user.permisos.includes(permiso);

/* =============================================================
 * 1) DASHBOARD GLOBAL  (analitica:ver)
 * ============================================================= */
exports.obtenerDashboardGlobal = async (req, res) => {
  try {
    const [porEstado, porPrioridad, porCategoria, totales] = await Promise.all([
      Incidencia.aggregate([{ $group: { _id: '$estado', total: { $sum: 1 } } }]),
      Incidencia.aggregate([{ $group: { _id: '$prioridad', total: { $sum: 1 } } }]),
      Incidencia.aggregate([{ $group: { _id: '$categoria', total: { $sum: 1 } } }]),
      Incidencia.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            sinAsignar: {
              $sum: { $cond: [{ $eq: ['$tecnico_asignado.usuario_id', null] }, 1, 0] }
            },
            criticasAbiertas: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$prioridad', 'critica'] },
                      { $in: ['$estado', ['abierta', 'en_proceso', 'en_espera', 'reabierta']] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ])
    ]);

    return res.json({
      totales: totales[0] || { total: 0, sinAsignar: 0, criticasAbiertas: 0 },
      porEstado,
      porPrioridad,
      porCategoria
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al obtener dashboard global' });
  }
};

/* =============================================================
 * 2) LISTAR TODAS LAS INCIDENCIAS  (incidencias:ver_area)
 * ============================================================= */
exports.listarTodasIncidencias = async (req, res) => {
  try {
    const { estado, categoria, prioridad, edificio, busqueda, tecnico_id, sin_asignar } = req.query;

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 20, 200);
    const filtro = {};

    if (estado && ESTADOS_VALIDOS.includes(estado)) filtro.estado = estado;
    if (categoria) filtro.categoria = categoria;
    if (prioridad && PRIORIDADES_VALIDAS.includes(prioridad)) filtro.prioridad = prioridad;
    if (edificio) filtro['ubicacion.edificio'] = edificio;
    if (tecnico_id) filtro['tecnico_asignado.usuario_id'] = tecnico_id;
    if (sin_asignar === 'true') filtro['tecnico_asignado.usuario_id'] = null;

    if (busqueda) {
      const rx = new RegExp(busqueda, 'i');
      filtro.$or = [{ titulo: rx }, { descripcion: rx }, { codigo: rx }];
    }

    const [items, total] = await Promise.all([
      Incidencia.find(filtro)
        .sort({ fecha_creacion: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Incidencia.countDocuments(filtro)
    ]);

    return res.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al listar incidencias' });
  }
};

/* =============================================================
 * 3) OBTENER CUALQUIER INCIDENCIA  (incidencias:ver_area)
 * ============================================================= */
exports.obtenerIncidencia = async (req, res) => {
  try {
    const incidencia = await Incidencia.findById(req.params.id).lean();
    if (!incidencia) return res.status(404).json({ message: 'Incidencia no encontrada' });
    return res.json(incidencia);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al obtener la incidencia' });
  }
};

/* =============================================================
 * 4) EDITAR INCIDENCIA  (incidencias:agregar_informacion)
 *    Campos sensibles (estado/prioridad) se validan por separado.
 * ============================================================= */
exports.editarIncidencia = async (req, res) => {
  try {
    const permitidos = [
      'titulo', 'descripcion', 'categoria', 'ubicacion',
      'detalle_especifico', 'tags'
    ];

    // estado y prioridad solo si el admin tiene el permiso específico
    if (tienePermiso(req.user, 'incidencias:actualizar_estado') ||
        tienePermiso(req.user, 'incidencias:supervisar_avances') ||
        tienePermiso(req.user, 'incidencias:cerrar') ||
        tienePermiso(req.user, 'incidencias:reabrir')) {
      permitidos.push('estado');
    }
    if (tienePermiso(req.user, 'incidencias:establecer_prioridad')) {
      permitidos.push('prioridad');
    }

    const cambios = {};
    for (const campo of permitidos) {
      if (req.body[campo] !== undefined) cambios[campo] = req.body[campo];
    }

    if (Object.keys(cambios).length === 0) {
      return res.status(400).json({ message: 'No se enviaron campos para editar' });
    }
    if (cambios.estado && !ESTADOS_VALIDOS.includes(cambios.estado)) {
      return res.status(400).json({ message: 'Estado no válido' });
    }
    if (cambios.prioridad && !PRIORIDADES_VALIDAS.includes(cambios.prioridad)) {
      return res.status(400).json({ message: 'Prioridad no válida' });
    }

    const incidencia = await Incidencia.findById(req.params.id);
    if (!incidencia) return res.status(404).json({ message: 'No encontrada' });

    if (cambios.estado === 'resuelta' && !incidencia.fecha_resolucion) {
      incidencia.fecha_resolucion = new Date();
    }
    if (['abierta', 'reabierta', 'en_proceso', 'en_espera'].includes(cambios.estado)) {
      incidencia.fecha_resolucion = null;
    }

    Object.assign(incidencia, cambios);

    const descripcionCambios = Object.entries(cambios)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join(', ');

    registrarHistorial(
      incidencia, req.user, 'edicion_admin', incidencia.estado,
      req.body.comentario || `Admin editó: ${descripcionCambios}`
    );

    await incidencia.save();
    return res.json({ message: 'Incidencia actualizada', incidencia });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al editar incidencia' });
  }
};

/* =============================================================
 * 5) ASIGNAR / REASIGNAR TÉCNICO
 *    (incidencias:asignar_tecnico | incidencias:reasignar_tecnico)
 * ============================================================= */
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

    // Validación fina: si es reasignación debe tener el permiso de reasignar
    if (esReasignacion && !tienePermiso(req.user, 'incidencias:reasignar_tecnico')) {
      return res.status(403).json({ message: 'No puede reasignar incidencias' });
    }
    if (!esReasignacion && !tienePermiso(req.user, 'incidencias:asignar_tecnico')) {
      return res.status(403).json({ message: 'No puede asignar incidencias' });
    }

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

/* =============================================================
 * 6) CAMBIAR ESTADO  (múltiples permisos)
 * ============================================================= */
exports.cambiarEstado = async (req, res) => {
  try {
    const { estado, comentario } = req.body;
    if (!ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ message: 'Estado no válido' });
    }

    // Validación por transición → permiso
    const permisoPorEstado = {
      en_proceso: 'incidencias:actualizar_estado',
      en_espera:  'incidencias:supervisar_avances',
      resuelta:   'incidencias:actualizar_estado', // o 'resolver'
      cerrada:    'incidencias:cerrar',
      reabierta:  'incidencias:reabrir',
      abierta:    'incidencias:reabrir'
    };
    const permisoRequerido = permisoPorEstado[estado];
    if (permisoRequerido && !tienePermiso(req.user, permisoRequerido)) {
      return res.status(403).json({ message: `Se requiere permiso ${permisoRequerido}` });
    }

    const incidencia = await Incidencia.findById(req.params.id);
    if (!incidencia) return res.status(404).json({ message: 'No encontrada' });

    incidencia.estado = estado;
    if (estado === 'resuelta' && !incidencia.fecha_resolucion) {
      incidencia.fecha_resolucion = new Date();
    }
    if (['abierta', 'reabierta'].includes(estado)) {
      incidencia.fecha_resolucion = null;
    }

    registrarHistorial(
      incidencia, req.user, 'actualizacion_estado', estado,
      comentario || `Admin cambió estado a ${estado}.`
    );

    await incidencia.save();
    return res.json({ message: 'Estado actualizado', incidencia });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al actualizar estado' });
  }
};

/* =============================================================
 * 7) CAMBIAR PRIORIDAD  (incidencias:establecer_prioridad)
 * ============================================================= */
exports.cambiarPrioridad = async (req, res) => {
  try {
    const { prioridad, comentario } = req.body;
    if (!PRIORIDADES_VALIDAS.includes(prioridad)) {
      return res.status(400).json({ message: 'Prioridad no válida' });
    }

    const incidencia = await Incidencia.findById(req.params.id);
    if (!incidencia) return res.status(404).json({ message: 'No encontrada' });

    const anterior = incidencia.prioridad;
    incidencia.prioridad = prioridad;

    registrarHistorial(
      incidencia, req.user, 'prioridad', incidencia.estado,
      comentario || `Admin cambió prioridad de ${anterior} a ${prioridad}.`
    );

    await incidencia.save();
    return res.json({ message: 'Prioridad actualizada', incidencia });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al actualizar prioridad' });
  }
};

/* =============================================================
 * 8) COMENTAR / DOCUMENTAR / REGISTRAR HORAS
 *    (incidencias:agregar_informacion | documentar_intervencion)
 * ============================================================= */
exports.comentar = async (req, res) => {
  try {
    const { comentario, accion = 'comentario', horas } = req.body;
    if (!comentario) return res.status(400).json({ message: 'comentario es obligatorio' });

    const incidencia = await Incidencia.findById(req.params.id);
    if (!incidencia) return res.status(404).json({ message: 'No encontrada' });

    if (horas && Number(horas) > 0) {
      if (!tienePermiso(req.user, 'incidencias:registrar_horas')) {
        return res.status(403).json({ message: 'No puede registrar horas' });
      }
      incidencia.horas_invertidas = (incidencia.horas_invertidas || 0) + Number(horas);
    }

    registrarHistorial(
      incidencia, req.user, accion, incidencia.estado, comentario,
      horas ? Number(horas) : null
    );

    await incidencia.save();
    return res.json({ message: 'Registro agregado', incidencia });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al agregar registro' });
  }
};

/* =============================================================
 * 9) ELIMINAR INCIDENCIA  (incidencias:auditar_resueltas como comodín)
 *    Si quieres más granular, crea el permiso "incidencias:eliminar".
 * ============================================================= */
exports.eliminarIncidencia = async (req, res) => {
  try {
    const incidencia = await Incidencia.findByIdAndDelete(req.params.id);
    if (!incidencia) return res.status(404).json({ message: 'No encontrada' });

    if (incidencia.evidencias_adjuntas?.length) {
      const paths = incidencia.evidencias_adjuntas
        .map((e) => e.url_storage)
        .filter(Boolean)
        .map((url) => url.split(`/${process.env.SUPABASE_BUCKET}/`)[1])
        .filter(Boolean);

      if (paths.length) {
        await supabase.storage.from(process.env.SUPABASE_BUCKET).remove(paths);
      }
    }

    return res.json({ message: 'Incidencia eliminada', id: incidencia._id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al eliminar incidencia' });
  }
};

/* =============================================================
 * 10) USUARIOS
 * ============================================================= */
exports.listarUsuarios = async (req, res) => {
  try {
    const { rol, activo, busqueda } = req.query;
    const filtro = {};
    if (rol && ROLES_VALIDOS.includes(rol)) filtro.rol = rol;
    if (activo !== undefined) filtro.activo = activo === 'true';
    if (busqueda) {
      const rx = new RegExp(busqueda, 'i');
      filtro.$or = [{ nombre: rx }, { apellidos: rx }, { correo: rx }];
    }

    const usuarios = await Usuario.find(filtro)
      .select('-password -__v')
      .sort({ fecha_registro: -1 })
      .lean();

    return res.json(usuarios);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al listar usuarios' });
  }
};

exports.obtenerUsuario = async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id).select('-password -__v').lean();
    if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });
    return res.json(usuario);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al obtener usuario' });
  }
};

exports.cambiarRolUsuario = async (req, res) => {
  try {
    const { rol } = req.body;
    if (!ROLES_VALIDOS.includes(rol)) {
      return res.status(400).json({ message: 'Rol no válido' });
    }

    const usuario = await Usuario.findByIdAndUpdate(
      req.params.id,
      { rol },
      { new: true, runValidators: true }
    ).select('-password -__v');

    if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });
    return res.json({ message: 'Rol actualizado', usuario });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al cambiar rol' });
  }
};

exports.cambiarEstadoUsuario = async (req, res) => {
  try {
    const { activo } = req.body;
    if (typeof activo !== 'boolean') {
      return res.status(400).json({ message: 'activo debe ser boolean' });
    }

    // Validación fina: permiso distinto si activa vs desactiva
    if (activo && !tienePermiso(req.user, 'usuarios:habilitar')) {
      return res.status(403).json({ message: 'No puede habilitar usuarios' });
    }
    if (!activo && !tienePermiso(req.user, 'usuarios:deshabilitar')) {
      return res.status(403).json({ message: 'No puede deshabilitar usuarios' });
    }

    const usuario = await Usuario.findByIdAndUpdate(
      req.params.id,
      { activo },
      { new: true }
    ).select('-password -__v');

    if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });
    return res.json({ message: `Usuario ${activo ? 'activado' : 'desactivado'}`, usuario });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al cambiar estado' });
  }
};

exports.eliminarUsuario = async (req, res) => {
  try {
    if (req.params.id === req.user.sub) {
      return res.status(400).json({ message: 'No puedes eliminarte a ti mismo' });
    }
    if (!tienePermiso(req.user, 'usuarios:deshabilitar')) {
      return res.status(403).json({ message: 'No puede eliminar usuarios' });
    }

    const usuario = await Usuario.findByIdAndDelete(req.params.id);
    if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });

    return res.json({ message: 'Usuario eliminado', id: usuario._id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al eliminar usuario' });
  }
};

exports.agregarUsuario = async (req, res) => {
    try {

        const usuario = new Usuario({
            ...req.body,
            password_hash: req.body.password,
            fecha_creacion: new Date()
        });

        await usuario.save();

        return res.status(201).json({
            message: "Usuario agregado",
            usuario
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            message: "Error al agregar usuario"
        });
    }
};

/* =============================================================
 * 11) MÉTRICAS / ACTIVIDAD / TÉCNICOS
 * ============================================================= */
exports.obtenerMetricas = async (req, res) => {
  try {
    const [
      pendientesAsignar, enProceso, resueltasAuditar, cerradas, total, abiertas, criticas
    ] = await Promise.all([
      Incidencia.countDocuments({ estado: 'abierta', 'tecnico_asignado.usuario_id': null }),
      Incidencia.countDocuments({ estado: 'en_proceso' }),
      Incidencia.countDocuments({ estado: 'resuelta' }),
      Incidencia.countDocuments({ estado: 'cerrada' }),
      Incidencia.countDocuments({}),
      Incidencia.countDocuments({ estado: 'abierta' }),
      Incidencia.countDocuments({ prioridad: 'critica', estado: { $ne: 'cerrada' } })
    ]);

    return res.json({
      pendientesAsignar, enProceso, resueltasAuditar, cerradas,
      total, abiertas, criticasAbiertas: criticas
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al obtener métricas' });
  }
};

exports.obtenerActividadGlobal = async (req, res) => {
  try {
    const limite = Math.min(Number(req.query.limite) || 20, 200);

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
          estado: { $in: ['abierta', 'en_proceso', 'en_espera', 'reabierta'] }
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

