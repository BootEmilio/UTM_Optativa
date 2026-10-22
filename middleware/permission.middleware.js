/**
 * Verifica que el usuario tenga TODOS los permisos indicados.
 * Uso: checkPermisos('incidencias:crear')
 *      checkPermisos(['incidencias:ver_area','incidencias:cerrar'])
 */
const checkPermisos = (...requeridos) => {
  const permisosRequeridos = requeridos.flat();
  return (req, res, next) => {
    if (!req.user || !Array.isArray(req.user.permisos)) {
      return res.status(403).json({ message: 'Sin información de permisos' });
    }
    const faltantes = permisosRequeridos.filter(p => !req.user.permisos.includes(p));
    if (faltantes.length > 0) {
      return res.status(403).json({
        message: 'No tiene permisos para esta acción',
        faltantes
      });
    }
    next();
  };
};

/**
 * Verifica que el usuario tenga AL MENOS uno de los permisos indicados.
 */
const checkAlgunPermiso = (...requeridos) => {
  const permisosRequeridos = requeridos.flat();
  return (req, res, next) => {
    if (!req.user || !Array.isArray(req.user.permisos)) {
      return res.status(403).json({ message: 'Sin información de permisos' });
    }
    const tiene = permisosRequeridos.some(p => req.user.permisos.includes(p));
    if (!tiene) {
      return res.status(403).json({
        message: 'No tiene permisos para esta acción',
        requeridos: permisosRequeridos
      });
    }
    next();
  };
};

/**
 * Verifica que el rol del usuario esté dentro de los permitidos.
 */
const checkRol = (...rolesPermitidos) => {
  const roles = rolesPermitidos.flat();
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      return res.status(403).json({
        message: 'Rol no autorizado',
        rolActual: req.user?.rol,
        rolesPermitidos: roles
      });
    }
    next();
  };
};

module.exports = { checkPermisos, checkAlgunPermiso, checkRol };