const express = require('express');
const path = require('path');
const app = express();

// Railway nos asigna un puerto, si no existe usamos el 3000
const PORT = process.env.PORT || 3000;

// Servir archivos estáticos desde la carpeta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Ruta principal que sirve el index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor de Seroa activo en puerto ${PORT}`);
});