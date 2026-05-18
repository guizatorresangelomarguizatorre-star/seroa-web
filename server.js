const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2'); 
const nodemailer = require('nodemailer');
const crypto = require('crypto'); 

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
    password: 'DYfgQxnovIUFCHrgUPusszxMGMYfUrux',
    database: 'railway',
    port: 35115,
    ssl: {
        rejectUnauthorized: false // Permite la conexión segura a Railway
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
           user: process.env.EMAIL_USER,
           pass: process.env.EMAIL_PASS
     }
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
        // 1. Generamos un token único y aleatorio de 64 caracteres
        const tokenVerificacion = crypto.randomBytes(32).toString('hex');

        // 2. Insertamos el usuario en la base de datos 
        // (Las nuevas columnas 'verificado' entra en FALSE y guardamos el token)
        const query = 'INSERT INTO usuarios (nombre, email, password, verificado, token_verificacion) VALUES (?, ?, ?, FALSE, ?)';
        
        db.query(query, [nombre, email, password, tokenVerificacion], async (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
                }
                return res.status(500).json({ error: 'Error al registrar en la base de datos.' });
            }

            // 3. Diseñamos el enlace de verificación que irá en el correo
            const urlVerificacion = `https://seroa-web-production.up.railway.app/api/verificar-correo?token=${tokenVerificacion}`;

            // 4. Creamos el diseño del correo electrónico en HTML
            const mailOptions = {
                from: `"Seroa Plataforma" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: 'Verifica tu cuenta - Seroa',
                html: `
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
                `
            };

            // 5. Enviamos el correo de forma asíncrona
            transporter.sendMail(mailOptions, (mailErr, info) => {
                if (mailErr) {
                    console.error("Error enviando correo:", mailErr);
                    // Registramos al usuario pero avisamos que el correo falló temporalmente
                    return res.json({ mensaje: 'Cuenta creada, pero hubo un problema al enviar el correo de verificación.' });
                }
                
                // Respuesta exitosa total
                res.json({ mensaje: 'Registro exitoso. Por favor, revisa tu bandeja de entrada para verificar tu cuenta.' });
            });
        });

    } catch (error) {
        res.status(500).json({ error: 'Error interno en el servidor.' });
    }
});
            //Verificar correo
app.get('/api/verificar-correo', (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(400).send('Token de verificación ausente.');
    }

    // Buscamos al usuario que tenga guardado ese token exacto
    const queryBuscar = 'SELECT id FROM usuarios WHERE token_verificacion = ?';
    
    db.query(queryBuscar, [token], (err, results) => {
        if (err || results.length === 0) {
            return res.status(400).send('El enlace de verificación no es válido o ya caducó.');
        }

        const usuarioId = results[0].id;

        // Si lo encuentra, cambiamos verificado a TRUE y borramos el token para que no se use dos veces
        const queryActualizar = 'UPDATE usuarios SET verificado = TRUE, token_verificacion = NULL WHERE id = ?';
        
        db.query(queryActualizar, [usuarioId], (updateErr, updateResult) => {
            if (updateErr) {
                return res.status(500).send('Error al activar la cuenta.');
            }

            // Redirección directa a tu login.html pasándole una señal por la URL
            res.redirect('/login.html?verificado=true');
        });
    });
});
                    //LOGIN
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    // Usamos la función importada para buscar el correo encriptado
    const emailHashBuscado = generarHashBusqueda(email);

    db.query("SELECT * FROM usuarios WHERE email_hash = ?", [emailHashBuscado], async (err, results) => {
        if (err || results.length === 0) return res.status(401).json({ error: "Credenciales inválidas" });
        
        const usuario = results[0];
        
        // ==========================================
        // NUEVA VALIDACIÓN: BLOQUEO POR CORREO NO VERIFICADO
        // ==========================================
        if (!usuario.verificado) {
            return res.status(403).json({ 
                error: "Tu cuenta aún no está activa. Por favor, revisa tu bandeja de entrada y verifica tu correo antes de entrar." 
            });
        }
        // ==========================================
        
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