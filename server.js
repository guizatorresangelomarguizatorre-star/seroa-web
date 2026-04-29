const express = require('express');
const path = require('path'); // Herramienta nativa de Node para leer carpetas
const app = express();
const PORT = process.env.PORT || 3000;

// Le decimos explícitamente dónde buscar los archivos estáticos (CSS, JS, imágenes)
app.use(express.static(path.join(__dirname, 'public')));

// Ruta de emergencia: Si entran a la raíz '/', mándalos al index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor de Seroa corriendo en el puerto ${PORT}`);
});