const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2'); 
const crypto = require('crypto'); 
const dns = require('dns');

// Mantenemos esto por si MySQL en Railway lo necesita
dns.setDefaultResultOrder('ipv4first'); 

// Importamos nuestras funciones modulares de seguridad
const { encriptar, desencriptar, generarHashBusqueda } = require('./security');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// === CONEXIÓN MAESTRA A BASE DE DATOS ===
const db = mysql.createPool({
    host: 'switchback.proxy.rlwy.net',
    user: 'root',
    password: 'DYfgQxnovIUFCHrgUPusszxMGMYfUrux',
    database: 'railway',
    port: 35115,
    ssl: {
        rejectUnauthorized: false
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
        // 1. BLINDAJE
        const passwordHash = await bcrypt.hash(password, 10);
        const nombreEncriptado = encriptar(nombre);
        const emailEncriptado = encriptar(email);
        const emailHash = generarHashBusqueda(email);

        // 2. Token de verificación
        const tokenVerificacion = crypto.randomBytes(32).toString('hex');

        // 3. Insertamos en BD
        const query = 'INSERT INTO usuarios (nombre, email_encriptado, email_hash, password, verificado, token_verificacion) VALUES (?, ?, ?, ?, FALSE, ?)';
        
        db.query(query, [nombreEncriptado, emailEncriptado, emailHash, passwordHash, tokenVerificacion], async (err, result) => {
            if (err) {
                console.error("Error MySQL al registrar:", err); 
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
                }
                return res.status(500).json({ error: 'Error al registrar en la base de datos.' });
            }

            // 4. Diseñamos el enlace
            const urlVerificacion = `https://seroa-web-production.up.railway.app/api/verificar-correo?token=${tokenVerificacion}`;

            // 5. El diseño de tu correo HTML
            const contenidoHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e4ecec; border-radius: 12px;">
                    <h2 style="color: #309b9f; text-align: center;">¡Bienvenido a Seroa!</h2>
                    <p>Hola <strong>${nombre}</strong>,</p>
                    <p>Tu cuenta para el sistema de monitoreo inteligente ha sido creada. Para poder ingresar a la plataforma médica, es necesario validar tu dirección de correo electrónico haciendo clic en el siguiente botón:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${urlVerificacion}" style="background: linear-gradient(135deg, #309b9f, #6fc873); color: white; padding: 12px 25px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">Verificar mi Cuenta</a>
                    </div>
                    <p style="font-size: 0.85rem; color: #777; text-align: center;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br>${urlVerificacion}</p>
                    <hr style="border: 0; border-top: 1px solid #e4ecec; margin-top: 20px;">
                    <p style="font-size: 0.8rem; color: #999; text-align: center;">Seroa - El aliento que da vida.<br>Este es un correo automático, por favor no lo respondas.</p>
                </div>
            `;

            // 6. Lanzamos el correo por la vía libre (API Web de Brevo)
            try {
                const respuestaBrevo = await fetch('https://api.brevo.com/v3/smtp/email', {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json',
                        'api-key': process.env.BREVO_API, 
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify({
                        // 👇 ¡PON TU CORREO AQUÍ! 👇
                        sender: { name: 'Seroa Plataforma', email: 'seroaweb@gmail.com' }, 
                        to: [{ email: email }],
                        subject: 'Verifica tu cuenta - Seroa',
                        htmlContent: contenidoHtml
                    })
                });

                if (!respuestaBrevo.ok) {
                    const errorData = await respuestaBrevo.text();
                    console.error("Error devuelto por Brevo:", errorData);
                    return res.status(500).json({ error: 'Tu usuario se guardó, pero la plataforma de correos rechazó el envío.' });
                }
                
                // Si todo sale perfecto
                res.json({ mensaje: 'Registro exitoso. Por favor, revisa tu bandeja de entrada para verificar tu cuenta.' });

            } catch (errorFetch) {
                console.error("Error crítico de red al contactar a Brevo:", errorFetch);
                return res.status(500).json({ error: 'Fallo de conexión web al intentar enviar el correo.' });
            }
        });

    } catch (error) {
        console.error("Error interno del servidor en Registro:", error);
        res.status(500).json({ error: 'Error interno en el servidor.' });
    }
});

// Verificar correo
app.get('/api/verificar-correo', (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(400).send('Token de verificación ausente.');
    }

    const queryBuscar = 'SELECT id FROM usuarios WHERE token_verificacion = ?';
    
    db.query(queryBuscar, [token], (err, results) => {
        if (err || results.length === 0) {
            return res.status(400).send('El enlace de verificación no es válido o ya caducó.');
        }

        const usuarioId = results[0].id;

        const queryActualizar = 'UPDATE usuarios SET verificado = TRUE, token_verificacion = NULL WHERE id = ?';
        
        db.query(queryActualizar, [usuarioId], (updateErr, updateResult) => {
            if (updateErr) {
                return res.status(500).send('Error al activar la cuenta.');
            }
            res.redirect('/login.html?verificado=true');
        });
    });
});

// LOGIN
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const emailHashBuscado = generarHashBusqueda(email);

    db.query("SELECT * FROM usuarios WHERE email_hash = ?", [emailHashBuscado], async (err, results) => {
        if (err || results.length === 0) return res.status(401).json({ error: "Credenciales inválidas" });
        
        const usuario = results[0];
        
        if (!usuario.verificado) {
            return res.status(403).json({ 
                error: "Tu cuenta aún no está activa. Por favor, revisa tu bandeja de entrada y verifica tu correo antes de entrar." 
            });
        }   
        const esValida = await bcrypt.compare(password, usuario.password);
        if (!esValida) return res.status(401).json({ error: "Credenciales inválidas" });

        res.json({ 
            mensaje: "Inicio de sesión exitoso", 
            nombre: desencriptar(usuario.nombre) 
        });
    });
});

// Comprobar en tiempo real si el usuario ya verificó su correo
app.get('/api/status-verificacion', (req, res) => {
    const { email } = req.query;

    if (!email) {
        return res.status(400).json({ error: 'Email requerido.' });
    }

    const emailHashBuscado = generarHashBusqueda(email);
    const query = 'SELECT verificado, nombre FROM usuarios WHERE email_hash = ?';
    
    db.query(query, [emailHashBuscado], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        const usuario = results[0];
        res.json({
            verificado: usuario.verificado === 1 || usuario.verificado === true,
            nombre: desencriptar(usuario.nombre)
        });
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => console.log(`Seroa activo en puerto ${PORT}`));