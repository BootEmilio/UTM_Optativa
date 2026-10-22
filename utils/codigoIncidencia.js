const Incidencia = require('../models/Incidencia');

async function generarCodigo() {
  const year = new Date().getFullYear();
  const prefijo = `INC-${year}-`;
  const ultima = await Incidencia.findOne({ codigo: { $regex: `^${prefijo}` } })
    .sort({ codigo: -1 })
    .lean();

  let consecutivo = 1;
  if (ultima) {
    const num = parseInt(ultima.codigo.split('-').pop(), 10);
    consecutivo = num + 1;
  }
  return `${prefijo}${String(consecutivo).padStart(4, '0')}`;
}

module.exports = { generarCodigo };