const multer = require('multer');

// Almacenamiento en memoria: el buffer se pasa directo a Supabase
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const permitidos = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!permitidos.includes(file.mimetype)) {
      return cb(new Error('Tipo de archivo no permitido. Usa JPG, PNG, WEBP o PDF.'));
    }
    cb(null, true);
  }
});

module.exports = upload;