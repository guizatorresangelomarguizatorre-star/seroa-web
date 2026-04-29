const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Imprimir en los logs la ruta actual (para depuración)
console.log("Directorio actual:", __dirname);

// Servir archivos de la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

// Ruta principal: intenta cargar index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
        if (err) {
            console.error("Error enviando index.html:", err);
            res.status(404).send("Archivo index.html no encontrado en la carpeta public");
        }
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor Seroa v0.1.0 activo en puerto ${PORT}`);
});