require('dotenv').config();
const cors = require('cors');
const express = require('express');
const mongoose = require('mongoose');
const authRoutes = require('./routes/auth.route');
const adminRoutes = require('./routes/admin.route');
const incidenciaRoutes = require('./routes/incidencias.route');
const coordinadorRoutes = require('./routes/coordinador.route');
const analistaRoutes = require('./routes/analista.route');

const app = express();
app.use(express.json());

const allowedOrigins = [
  'http://localhost:3000',
  'https://web-optativa.onrender.com',
];

app.use(cors({
  origin: function (origin, callback) {
    // Permite peticiones sin origen (como Postman o curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true, // Importante si usas cookies o sesiones
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'] // Tu front manda el token aquí
}));

app.use('/api/admin', adminRoutes);
app.use('/api/analista', analistaRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/incidencias',  incidenciaRoutes);
app.use('/api/coordinador', coordinadorRoutes);
// app.use('/api/incidencias', require('./routes/incidencias.routes'));

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB conectado');
    app.listen(process.env.PORT, () =>
      console.log(`Servidor en puerto ${process.env.PORT}`)
    );
  })
  .catch(err => console.error('Error Mongo:', err));