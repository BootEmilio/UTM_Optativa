require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const authRoutes = require('./routes/auth.route');
const incidenciaRoutes = require('./routes/incidencias.route');

const app = express();
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/incidencias', require('./routes/incidencias.route'));
// app.use('/api/incidencias', require('./routes/incidencias.routes'));

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB conectado');
    app.listen(process.env.PORT, () =>
      console.log(`Servidor en puerto ${process.env.PORT}`)
    );
  })
  .catch(err => console.error('Error Mongo:', err));