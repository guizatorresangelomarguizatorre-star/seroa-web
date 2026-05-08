const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2'); // Importamos mysql2 directamente aquí

// Importamos nuestras funciones modulares de seguridad
const { encriptar, desencriptar, generarHashBusqueda } = require('./security');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// === CONEXIÓN MAESTRA A BASE DE DATOS ===
// Integrada directamente con SSL forzado y ruta pública para evitar bloqueos
const db = mysql.createPool({
    host: 'switchback.proxy.rlwy.net',
    user: 'root',
    password: 'DYFgQxnovIUFCHrgUPusszxMGMYfUrux',
    database: 'railway',
    port: 35115,
    ssl: {
        rejectUnauthorized: false // Permite la conexión segura a Railway
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Verificación de conexión al arrancar el servidor
db.getConnection((err, connection) => {
    if (err) {
        console.error('Error crítico conectando a la BD:', err.message);
    } else {
        console.log('¡Conexión blindada SSL exitosa a Seroa BD!');
        connection.release();
    }
});

// === RUTAS DEL SISTEMA ===

app.post('/api/registro', async (req, res) => {
    const { nombre, email, password } = req.body;
    try {
        // Usamos las funciones importadas
        const nombreEncriptado = encriptar(nombre);
        const emailEncriptado = encriptar(email.toLowerCase());
        const emailHash = generarHashBusqueda(email); 
        
        const salt = await bcrypt.genSalt(10);
        const passwordHashed = await bcrypt.hash(password, salt);

        const query = "INSERT INTO usuarios (nombre, email_encriptado, email_hash, password) VALUES (?, ?, ?, ?)";
        db.query(query, [nombreEncriptado, emailEncriptado, emailHash, passwordHashed], (err) => {
            if (err) {
                console.error("Error MySQL:", err);
                return res.status(500).json({ error: "El usuario ya existe o hay un error en base de datos" });
            }
            res.json({ mensaje: "Registro exitoso y 100% blindado." });
        });
    } catch (e) { 
        console.error("Error Servidor:", e);
        res.status(500).json({ error: "Error interno" }); 
    }
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    // Usamos la función importada
    const emailHashBuscado = generarHashBusqueda(email);

    db.query("SELECT * FROM usuarios WHERE email_hash = ?", [emailHashBuscado], async (err, results) => {
        if (err || results.length === 0) return res.status(401).json({ error: "Credenciales inválidas" });
        
        const usuario = results[0];
        
        const esValida = await bcrypt.compare(password, usuario.password);
        if (!esValida) return res.status(401).json({ error: "Credenciales inválidas" });

        res.json({ 
            mensaje: "Inicio de sesión exitoso", 
            nombre: desencriptar(usuario.nombre) // Usamos la función importada
        });
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => console.log(`Seroa activo en puerto ${PORT}`));