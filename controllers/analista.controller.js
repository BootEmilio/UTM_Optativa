const Incidencia = require('../models/Incidencia');

// Slugs del enum → label legible para el frontend
const CATEGORIA_LABELS = {
  computo_redes: 'Equipo de cómputo y redes',
  infraestructura: 'Infraestructura',
  academico: 'Académico'
};

// Orden fijo de estados para el chart
const ESTADOS_ORDEN = [
  { key: 'abierta', label: 'Abiertas' },
  { key: 'en_proceso', label: 'En proceso' },
  { key: 'en_espera', label: 'En espera' },
  { key: 'resuelta', label: 'Resueltas' },
  { key: 'cerrada', label: 'Cerradas' }
];

/* -------------------------------------------------------------
 * Mapas para reportes (labels legibles)
 * ------------------------------------------------------------- */

const PRIORIDAD_LABELS = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Crítica'
};

const ESTADO_LABELS = {
  abierta: 'Abiertas',
  en_proceso: 'En proceso',
  en_espera: 'En espera',
  resuelta: 'Resueltas',
  cerrada: 'Cerradas'
};

// Dimensión → { campo en Mongo, mapa de labels }
const DIMENSIONES_REPORTE = {
  category: {
    campo: '$categoria',
    labels: CATEGORIA_LABELS,
    vacio: 'Sin categoría'
  },
  building: {
    campo: '$ubicacion.edificio',
    labels: null, // string libre, no se mapea
    vacio: 'Sin edificio'
  },
  priority: {
    campo: '$prioridad',
    labels: PRIORIDAD_LABELS,
    vacio: 'Sin prioridad'
  },
  status: {
    campo: '$estado',
    labels: ESTADO_LABELS,
    vacio: 'Sin estado'
  }
};

// Filtros válidos por dimensión (para validar query params)
const FILTROS_VALIDOS = {
  category: ['computo_redes', 'infraestructura', 'academico'],
  priority: ['baja', 'media', 'alta', 'critica'],
  status: ['abierta', 'en_proceso', 'en_espera', 'resuelta', 'cerrada']
  // building: libre, se valida como string
};

const EXPR_HORAS_CICLO = {
  $divide: [
    { $subtract: ['$fecha_resolucion', '$fecha_creacion'] },
    1000 * 60 * 60
  ]
};

/* -------------------------------------------------------------
 * Helper: etiquetas legibles para tags de falla
 * ------------------------------------------------------------- */
const TAG_LABELS = {
  conectividad: 'Falla de conectividad',
  red: 'Falla de red',
  wifi: 'Falla de Wi-Fi',
  acceso_plataforma: 'Acceso a plataforma',
  autenticacion: 'Autenticación',
  electrico: 'Problemas eléctricos',
  energia: 'Problemas eléctricos',
  hardware: 'Falla de hardware',
  software: 'Falla de software',
  mobiliario: 'Mobiliario',
  // agrega los que uses en tu operación
};

const tagLabel = (tag) => TAG_LABELS[tag] || tag;

/* -------------------------------------------------------------
 * Helper: resolver periodo de fallas (reusa el de resoluciones)
 * ------------------------------------------------------------- */
// reusa resolverPeriodoResoluciones y etiquetaPeriodoResoluciones

const esStringNoVacio = (v) => typeof v === 'string' && v.trim().length > 0;

const resolverPeriodoResoluciones = (period, from, to) => {
  if (period === 'last_30_days') {
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from: desde, to: hasta };
  }
  // reusa el resto (this_month, last_month, custom)
  return resolverPeriodo(period, from, to);
};

const etiquetaPeriodoResoluciones = (period) => {
  if (period === 'last_30_days') return 'Últimos 30 días';
  return etiquetaPeriodo(period);
};

const construirFiltroReportes = (query) => {
  const filtro = {};
  const errores = [];

  // category
  if (query.category && query.category !== 'all') {
    if (!FILTROS_VALIDOS.category.includes(query.category)) {
      errores.push(`category inválida: ${query.category}`);
    } else {
      filtro.categoria = query.category;
    }
  }

  // priority
  if (query.priority && query.priority !== 'all') {
    if (!FILTROS_VALIDOS.priority.includes(query.priority)) {
      errores.push(`priority inválida: ${query.priority}`);
    } else {
      filtro.prioridad = query.priority;
    }
  }

  // building: string libre, pero rechaza objetos (NoSQL injection)
  if (query.building && query.building !== 'all') {
    if (typeof query.building !== 'string' || !query.building.trim()) {
      errores.push('building inválido');
    } else {
      filtro['ubicacion.edificio'] = query.building.trim();
    }
  }

  if (errores.length > 0) {
    const err = new Error(errores.join('; '));
    err.statusCode = 400;
    throw err;
  }

  return filtro;
};

/**
 * Devuelve { from, to } válidos o lanza error con statusCode 400.
 * Nunca propaga valores no-string al constructor Date (evita NoSQL injection
 * tipo ?from[$gt]=).
 */
const resolverPeriodo = (period, from, to) => {
  // Periodo custom: exige strings parseables
  if (period === 'custom') {
    if (!esStringNoVacio(from) || !esStringNoVacio(to)) {
      const err = new Error('from y to son obligatorios en period=custom');
      err.statusCode = 400;
      throw err;
    }
    const d1 = new Date(from);
    const d2 = new Date(to);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
      const err = new Error('Fechas inválidas');
      err.statusCode = 400;
      throw err;
    }
    if (d1 > d2) {
      const err = new Error('from no puede ser mayor que to');
      err.statusCode = 400;
      throw err;
    }
    return { from: d1, to: d2 };
  }

  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = ahora.getMonth();

  if (period === 'last_month') {
    return {
      from: new Date(anio, mes - 1, 1),
      to: new Date(anio, mes, 0, 23, 59, 59, 999)
    };
  }

  // default: this_month (también cubre period ausente o desconocido)
  return {
    from: new Date(anio, mes, 1),
    to: new Date(anio, mes + 1, 0, 23, 59, 59, 999)
  };
};

const etiquetaPeriodo = (period) => {
  if (period === 'last_month') return 'Mes anterior';
  if (period === 'custom') return 'Personalizado';
  return 'Este mes';
};

/**
 * Wrapper que centraliza el manejo de errores de periodo.
 * Si resolverPeriodo lanza 400, devuelve 400; si es otro error, 500.
 */
const conPeriodo = async (req, res, fn) => {
  try {
    const { period = 'this_month', from, to } = req.query;
    const rango = resolverPeriodo(period, from, to);
    const data = await fn(rango, period);
    return res.json(data);
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ message: error.message });
    }
    console.error(error);
    return res.status(500).json({ message: 'Error al procesar analytics' });
  }
};

/* -------------------------------------------------------------
 * GET /api/analytics/dashboard
 * ------------------------------------------------------------- */
exports.obtenerDashboard = (req, res) =>
  conPeriodo(req, res, async ({ from: desde, to: hasta }, period) => {
    const filtroBase = { fecha_creacion: { $gte: desde, $lte: hasta } };

    const [summaryAgg, byCategoryAgg, byStatusAgg] = await Promise.all([
      Incidencia.aggregate([
        { $match: filtroBase },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            open: { $sum: { $cond: [{ $eq: ['$estado', 'abierta'] }, 1, 0] } },
            inProgress: { $sum: { $cond: [{ $eq: ['$estado', 'en_proceso'] }, 1, 0] } },
            onHold: { $sum: { $cond: [{ $eq: ['$estado', 'en_espera'] }, 1, 0] } },
            closed: { $sum: { $cond: [{ $eq: ['$estado', 'cerrada'] }, 1, 0] } },
            critical: { $sum: { $cond: [{ $eq: ['$prioridad', 'critica'] }, 1, 0] } }
          }
        }
      ]),
      Incidencia.aggregate([
        { $match: filtroBase },
        { $group: { _id: '$categoria', value: { $sum: 1 } } },
        { $sort: { value: -1 } }
      ]),
      Incidencia.aggregate([
        { $match: filtroBase },
        { $group: { _id: '$estado', value: { $sum: 1 } } }
      ])
    ]);

    const s = summaryAgg[0] || {
      total: 0, open: 0, inProgress: 0, onHold: 0, closed: 0, critical: 0
    };

    const porEstado = byStatusAgg.reduce((acc, i) => {
      acc[i._id] = i.value;
      return acc;
    }, {});

    return {
      period: { label: etiquetaPeriodo(period), from: desde, to: hasta },
      summary: {
        total: s.total,
        open: s.open,
        inProgress: s.inProgress,
        onHold: s.onHold,
        closed: s.closed,
        critical: s.critical
      },
      byCategory: byCategoryAgg.map((c) => ({
        label: CATEGORIA_LABELS[c._id] || c._id || 'Sin categoría',
        slug: c._id,
        value: c.value
      })),
      byStatus: ESTADOS_ORDEN.map((e) => ({
        label: e.label,
        status: e.key,
        value: porEstado[e.key] || 0
      }))
    };
  });

/* -------------------------------------------------------------
 * GET /api/analytics/summary
 * ------------------------------------------------------------- */
exports.obtenerSummary = (req, res) =>
  conPeriodo(req, res, async ({ from: desde, to: hasta }) => {
    const agg = await Incidencia.aggregate([
      { $match: { fecha_creacion: { $gte: desde, $lte: hasta } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          open: { $sum: { $cond: [{ $eq: ['$estado', 'abierta'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$estado', 'en_proceso'] }, 1, 0] } },
          onHold: { $sum: { $cond: [{ $eq: ['$estado', 'en_espera'] }, 1, 0] } },
          closed: { $sum: { $cond: [{ $eq: ['$estado', 'cerrada'] }, 1, 0] } },
          critical: { $sum: { $cond: [{ $eq: ['$prioridad', 'critica'] }, 1, 0] } }
        }
      }
    ]);

    const s = agg[0] || {
      total: 0, open: 0, inProgress: 0, onHold: 0, closed: 0, critical: 0
    };
    delete s._id;
    return s;
  });

/* -------------------------------------------------------------
 * GET /api/analytics/incidents-by-category
 * ------------------------------------------------------------- */
exports.obtenerPorCategoria = (req, res) =>
  conPeriodo(req, res, async ({ from: desde, to: hasta }) => {
    const agg = await Incidencia.aggregate([
      { $match: { fecha_creacion: { $gte: desde, $lte: hasta } } },
      { $group: { _id: '$categoria', value: { $sum: 1 } } },
      { $sort: { value: -1 } }
    ]);

    return agg.map((c) => ({
      label: CATEGORIA_LABELS[c._id] || c._id || 'Sin categoría',
      slug: c._id,
      value: c.value
    }));
  });

/* -------------------------------------------------------------
 * GET /api/analytics/incidents-by-status
 * ------------------------------------------------------------- */
exports.obtenerPorEstado = (req, res) =>
  conPeriodo(req, res, async ({ from: desde, to: hasta }) => {
    const agg = await Incidencia.aggregate([
      { $match: { fecha_creacion: { $gte: desde, $lte: hasta } } },
      { $group: { _id: '$estado', value: { $sum: 1 } } }
    ]);

    const mapa = agg.reduce((acc, i) => {
      acc[i._id] = i.value;
      return acc;
    }, {});

    return ESTADOS_ORDEN.map((e) => ({
      label: e.label,
      status: e.key,
      value: mapa[e.key] || 0
    }));
  });

  exports.obtenerReporte = (req, res) =>
  conPeriodo(req, res, async ({ from: desde, to: hasta }, period) => {
    // 1. Validar dimensión
    const { dimension } = req.query;
    if (!dimension || !DIMENSIONES_REPORTE[dimension]) {
      const err = new Error(
        `dimension inválida. Válidas: ${Object.keys(DIMENSIONES_REPORTE).join(', ')}`
      );
      err.statusCode = 400;
      throw err;
    }

    // 2. Validar y construir filtros cruzados
    const filtroFiltros = construirFiltroReportes(req.query);

    // 3. Filtro base: fechas + filtros cruzados
    const filtroBase = {
      fecha_creacion: { $gte: desde, $lte: hasta },
      ...filtroFiltros
    };

    // 4. Aggregation dinámica
    const cfg = DIMENSIONES_REPORTE[dimension];

    const agg = await Incidencia.aggregate([
      { $match: filtroBase },
      {
        $group: {
          _id: cfg.campo,
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // 5. Calcular total y porcentajes
    const total = agg.reduce((sum, r) => sum + r.count, 0);

    const rows = agg.map((r) => {
      const raw = r._id;
      const label =
        raw == null || raw === ''
          ? cfg.vacio
          : cfg.labels?.[raw] ?? String(raw);

      return {
        label,
        count: r.count,
        percentage: total > 0 ? Math.round((r.count / total) * 100) : 0,
        // slug solo cuando hay enum mapeable (útil para futuros drill-downs)
        ...(cfg.labels && raw ? { slug: raw } : {})
      };
    });

    return {
      period: { label: etiquetaPeriodo(period), from: desde, to: hasta },
      dimension,
      dimensionLabel:
        dimension === 'category' ? 'Categoría'
        : dimension === 'building' ? 'Edificio'
        : dimension === 'priority' ? 'Prioridad'
        : 'Estado',
      filters: {
        category: req.query.category || 'all',
        building: req.query.building || 'all',
        priority: req.query.priority || 'all'
      },
      rows,
      total
    };
  });

  exports.obtenerTiemposResolucion = async (req, res) => {
  try {
    // 1. Periodo (filtra por fecha_resolucion, no fecha_creacion)
    const { period = 'last_30_days', from, to } = req.query;
    const { from: desde, to: hasta } = resolverPeriodoResoluciones(period, from, to);

    // 2. Límite de casos representativos (validado)
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), 20)
      : 5;

    // 3. Filtro base: solo resueltas con fecha_resolucion válida
    const filtroBase = {
      fecha_resolucion: { $gte: desde, $lte: hasta, $ne: null },
      fecha_creacion: { $exists: true }
    };

    // 4. Aggregations en paralelo
    const [summaryAgg, byPriorityAgg, casesAgg] = await Promise.all([
      // 4a. Resumen global
      Incidencia.aggregate([
        { $match: filtroBase },
        {
          $project: {
            horasCiclo: EXPR_HORAS_CICLO,
            horasRegistradas: { $ifNull: ['$horas_invertidas', 0] }
          }
        },
        {
          $group: {
            _id: null,
            totalResolved: { $sum: 1 },
            avgCycleHours: { $avg: '$horasCiclo' },
            minCycleHours: { $min: '$horasCiclo' },
            maxCycleHours: { $max: '$horasCiclo' },
            avgLoggedHours: { $avg: '$horasRegistradas' }
          }
        }
      ]),

      // 4b. Promedio por prioridad
      Incidencia.aggregate([
        { $match: filtroBase },
        {
          $project: {
            prioridad: 1,
            horasCiclo: EXPR_HORAS_CICLO,
            horasRegistradas: { $ifNull: ['$horas_invertidas', 0] }
          }
        },
        {
          $group: {
            _id: '$prioridad',
            avgCycleHours: { $avg: '$horasCiclo' },
            avgLoggedHours: { $avg: '$horasRegistradas' },
            count: { $sum: 1 }
          }
        }
      ]),

      // 4c. Casos representativos (los más recientes resueltos)
      Incidencia.find(filtroBase)
        .select('codigo prioridad fecha_creacion fecha_resolucion horas_invertidas')
        .sort({ fecha_resolucion: -1 })
        .limit(limit)
        .lean()
    ]);

    // 5. Normalizar resumen
    const s = summaryAgg[0] || {
      totalResolved: 0,
      avgCycleHours: null,
      minCycleHours: null,
      maxCycleHours: null,
      avgLoggedHours: null
    };

    // 6. Orden fijo de prioridades: critica → alta → media → baja
    const ORDEN_PRIORIDAD = ['critica', 'alta', 'media', 'baja'];
    const porPrioridad = byPriorityAgg.reduce((acc, p) => {
      acc[p._id] = p;
      return acc;
    }, {});

    const byPriority = ORDEN_PRIORIDAD
      .filter((p) => porPrioridad[p]) // solo las que tienen datos
      .map((p) => {
        const row = porPrioridad[p];
        return {
          priority: p,
          label: PRIORIDAD_LABELS[p] || p,
          avgCycleHours: redondear1(row.avgCycleHours),
          avgLoggedHours: redondear1(row.avgLoggedHours),
          count: row.count
        };
      });

    // 7. Mapear casos representativos
    const representativeCases = casesAgg.map((c) => {
      const cycleHours = calcularHorasCiclo(c.fecha_creacion, c.fecha_resolucion);
      return {
        id: c.codigo,
        priority: c.prioridad,
        label: PRIORIDAD_LABELS[c.prioridad] || c.prioridad,
        cycleHours: redondear1(cycleHours),
        loggedHours: redondear1(c.horas_invertidas || 0),
        resolvedAt: c.fecha_resolucion
      };
    });

    return res.json({
      period: {
        label: etiquetaPeriodoResoluciones(period),
        from: desde,
        to: hasta
      },
      summary: {
        avgCycleHours: redondear1(s.avgCycleHours),
        minCycleHours: redondear1(s.minCycleHours),
        maxCycleHours: redondear1(s.maxCycleHours),
        avgLoggedHours: redondear1(s.avgLoggedHours),
        totalResolved: s.totalResolved
      },
      byPriority,
      representativeCases
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ message: error.message });
    }
    console.error(error);
    return res.status(500).json({ message: 'Error al obtener tiempos de resolución' });
  }
};

/* -------------------------------------------------------------
 * Helpers locales del endpoint
 * ------------------------------------------------------------- */
function redondear1(n) {
  if (n == null || Number.isNaN(n)) return null;
  return Math.round(n * 10) / 10;
}

function calcularHorasCiclo(desde, hasta) {
  if (!desde || !hasta) return null;
  const ms = new Date(hasta).getTime() - new Date(desde).getTime();
  return ms > 0 ? ms / (1000 * 60 * 60) : null;
}

exports.obtenerFallasRecurrentes = async (req, res) => {
  try {
    // 1. Periodo y límite validados
    const { period = 'last_30_days', from, to } = req.query;
    const { from: desde, to: hasta } = resolverPeriodoResoluciones(period, from, to);

    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), 10)
      : 3;

    // 2. Filtro base: por fecha_creacion (fallas se reportan, no se resuelven)
    const filtroBase = { fecha_creacion: { $gte: desde, $lte: hasta } };

    // 3. Aggregation: agrupar por tag, fallback a categoría
    //    $ifNull + $cond: si tags está vacío, usa ["categoria:<slug>"]
    const agg = await Incidencia.aggregate([
      { $match: filtroBase },
      {
        $project: {
          // Normaliza a array de claves de falla
          claves: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ['$tags', []] } }, 0] },
              '$tags',
              [{ $concat: ['categoria:', '$categoria'] }]
            ]
          },
          edificio: { $ifNull: ['$ubicacion.edificio', null] },
          prioridad: { $ifNull: ['$prioridad', 'media'] }
        }
      },
      // Un doc por cada clave (unarray)
      { $unwind: '$claves' },
      {
        $group: {
          _id: '$claves',
          count: { $sum: 1 },
          // Acumular edificios y prioridades para calcular moda después
          edificios: { $push: '$edificio' },
          prioridades: { $push: '$prioridad' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: limit }
    ]);

    // 4. Total de reportes del periodo (para share)
    //    OJO: total de docs únicos, no de claves (un doc puede tener 2 tags)
    const totalReports = await Incidencia.countDocuments(filtroBase);

    // 5. Calcular moda de edificio y prioridad por falla
    const moda = (arr) => {
      const conteo = arr.reduce((acc, v) => {
        if (v == null) return acc;
        acc[v] = (acc[v] || 0) + 1;
        return acc;
      }, {});
      const entradas = Object.entries(conteo);
      if (entradas.length === 0) return null;
      return entradas.sort((a, b) => b[1] - a[1])[0][0];
    };

    const failures = agg.map((f) => {
      const slug = f._id;
      // Si viene como "categoria:computo_redes", extrae el slug real
      const esCategoria = slug.startsWith('categoria:');
      const clave = esCategoria ? slug.slice('categoria:'.length) : slug;

      const nombre = esCategoria
        ? (CATEGORIA_LABELS[clave] || clave)
        : tagLabel(clave);

      const edificioModa = moda(f.edificios) || 'Sin edificio';
      const prioridadModa = moda(f.prioridades) || 'media';

      return {
        name: nombre,
        slug: clave,
        description: esCategoria
          ? `Incidencias de categoría ${nombre.toLowerCase()}`
          : `Incidencias etiquetadas como ${nombre.toLowerCase()}`,
        count: f.count,
        share: totalReports > 0
          ? Math.round((f.count / totalReports) * 1000) / 10
          : 0,
        building: edificioModa,
        prioritySlug: prioridadModa,
        priority: PRIORIDAD_LABELS[prioridadModa] || prioridadModa
      };
    });

    return res.json({
      period: {
        label: etiquetaPeriodoResoluciones(period),
        from: desde,
        to: hasta
      },
      totalReports,
      failures
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ message: error.message });
    }
    console.error(error);
    return res.status(500).json({ message: 'Error al obtener fallas recurrentes' });
  }
};