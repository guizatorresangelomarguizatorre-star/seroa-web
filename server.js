const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2'); 
const crypto = require('crypto'); 
const dns = require('dns');
const https = require('https');

// Mantenemos esto por si MySQL en Railway lo necesita
dns.setDefaultResultOrder('ipv4first'); 

// Importamos nuestras funciones modulares de seguridad
const { encriptar, desencriptar, generarHashBusqueda } = require('./security');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
const rutasBiometricos = require('./api_biometricos')(db);
app.use('/api', rutasBiometricos);
app.post('/api/registro', async (req, res) => {
    const { nombre, email, password, id_acceso } = req.body;

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

            // Si nos pasaron id_acceso en el body, intentamos vincular la invitación al nuevo usuario
            try {
                const nuevoUsuarioId = result.insertId;
                if (id_acceso) {
                    const nombrePlano = nombre || '';
                    const bindQuery = 'UPDATE acceso_pacientes SET id_usuario = ?, usuario_nombre = ? WHERE id_acceso = ? AND (id_usuario = 0 OR id_usuario IS NULL)';
                    db.query(bindQuery, [nuevoUsuarioId, nombrePlano, id_acceso], (bindErr, bindRes) => {
                        if (bindErr) console.error('Error vinculando acceso en registro:', bindErr);
                        else if (bindRes.affectedRows > 0) console.log(`/api/registro: Acceso ${id_acceso} vinculado al usuario ${nuevoUsuarioId}`);
                    });
                }
            } catch (bindEx) { console.error('Excepción vinculando acceso en registro:', bindEx); }

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
    const { email, password, bindAccessId, id_acceso } = req.body;
    const bindId = bindAccessId || id_acceso || null;
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

        let nombreDesencriptado = 'Usuario';
        try {
            nombreDesencriptado = usuario.nombre ? desencriptar(usuario.nombre) : 'Usuario';
        } catch (decryptErr) {
            console.error('[/api/login] Error desencriptando nombre:', decryptErr);
            nombreDesencriptado = usuario.nombre || 'Usuario';
        }

        // Si el cliente solicitó que el acceso invitado se vincule a este usuario, intentarlo
        if (bindId) {
            try {
                const updateQuery = 'UPDATE acceso_pacientes SET id_usuario = ?, usuario_nombre = ? WHERE id_acceso = ? AND (id_usuario = 0 OR id_usuario IS NULL)';
                const nombrePlano = nombreDesencriptado || '';
                db.query(updateQuery, [usuario.id, nombrePlano, bindId], (updErr, updRes) => {
                    if (updErr) console.error('Error vinculando acceso invitado en /api/login:', updErr);
                    else if (updRes.affectedRows > 0) console.log(`/api/login: Acceso ${bindId} vinculado al usuario ${usuario.id}`);
                });
            } catch (e) { console.error('Excepción al vincular acceso en login:', e); }
        }

        res.json({ 
            mensaje: "Inicio de sesión exitoso", 
            nombre: nombreDesencriptado,
            id: usuario.id
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
    const query = 'SELECT id, verificado, nombre FROM usuarios WHERE email_hash = ?';
    
    db.query(query, [emailHashBuscado], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        const usuario = results[0];
        let nombreDesencriptado = 'Usuario';
        try {
            nombreDesencriptado = usuario.nombre ? desencriptar(usuario.nombre) : 'Usuario';
        } catch (decryptErr) {
            console.error('[/api/status-verificacion] Error desencriptando nombre:', decryptErr);
            nombreDesencriptado = usuario.nombre || 'Usuario';
        }
        res.json({
            verificado: usuario.verificado === 1 || usuario.verificado === true,
            nombre: nombreDesencriptado,
            id: usuario.id
        });
    });
});

app.post('/api/pacientes', (req, res) => {
    const { nombre, peso_kg, edad, sexo, padecimiento, rango_spo2_min, rango_spo2_max, id_creador } = req.body;

    if (!nombre || !peso_kg || !edad || !sexo || !padecimiento || rango_spo2_min === undefined || rango_spo2_max === undefined || !id_creador) {
        return res.status(400).json({ error: 'Todos los campos son requeridos.' });
    }

    const query = `INSERT INTO pacientes (nombre, peso_kg, edad, sexo, padecimiento, rango_spo2_min, rango_spo2_max, id_creador) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    db.query(query, [nombre, peso_kg, edad, sexo, padecimiento, rango_spo2_min, rango_spo2_max, id_creador], (err, result) => {
        if (err) {
            console.error('Error MySQL al agregar paciente:', err);
            return res.status(500).json({ error: 'Error interno al guardar el paciente.' });
        }
        const id_paciente = result.insertId;
        const accesoQuery = `INSERT INTO acceso_pacientes (id_usuario, id_paciente, tipo_permiso, fecha_asignacion) VALUES (?, ?, 'Administrador', NOW())`;
        db.query(accesoQuery, [id_creador, id_paciente], (accesoErr) => {
            if (accesoErr) {
                console.error('Error MySQL al crear acceso paciente:', accesoErr);
                return res.status(500).json({ error: 'Paciente guardado, pero no se pudo crear el acceso compartido.' });
            }
            res.json({ mensaje: 'Paciente agregado con éxito.', id_paciente });
        });
    });
});

app.get('/api/pacientes', (req, res) => {
    const id_usuario = req.query.id_usuario;
    if (!id_usuario) {
        return res.status(400).json({ error: 'ID del usuario es requerido.' });
    }

    // Traer todos los pacientes vinculados al usuario, sin filtrar por tipo de permiso
   const query = `SELECT p.*, a.tipo_permiso, a.id_acceso
               FROM pacientes p
               JOIN acceso_pacientes a ON a.id_paciente = p.id_paciente
               WHERE a.id_usuario = ?
               ORDER BY p.id_paciente DESC`;
    db.query(query, [id_usuario], (err, results) => {
        if (err) {
            console.error('Error MySQL al cargar pacientes:', err);
            return res.status(500).json({ error: 'Error interno al leer pacientes.' });
        }
        res.json(results);
    });
});

app.put('/api/pacientes/:id', (req, res) => {
    const id_paciente = req.params.id;
    const { nombre, peso_kg, edad, sexo, padecimiento, rango_spo2_min, rango_spo2_max, id_usuario } = req.body;

    if (!id_usuario) {
        return res.status(400).json({ error: 'ID de usuario requerido.' });
    }

    const accesoQuery = 'SELECT tipo_permiso FROM acceso_pacientes WHERE id_usuario = ? AND id_paciente = ?';
    db.query(accesoQuery, [id_usuario, id_paciente], (accesoErr, accesoResult) => {
        if (accesoErr || accesoResult.length === 0) {
            return res.status(403).json({ error: 'No tienes permiso para editar este paciente.' });
        }

        const permiso = accesoResult[0].tipo_permiso;
        if (!['Administrador', 'Doctor'].includes(permiso)) {
            return res.status(403).json({ error: 'Solo Administrador o Doctor pueden editar los datos.' });
        }

        const updateQuery = `UPDATE pacientes SET nombre = ?, peso_kg = ?, edad = ?, sexo = ?, padecimiento = ?, rango_spo2_min = ?, rango_spo2_max = ? WHERE id_paciente = ?`;
        db.query(updateQuery, [nombre, peso_kg, edad, sexo, padecimiento, rango_spo2_min, rango_spo2_max, id_paciente], (err) => {
            if (err) {
                console.error('Error MySQL al actualizar paciente:', err);
                return res.status(500).json({ error: 'No se pudo actualizar el paciente.' });
            }
            res.json({ mensaje: 'Paciente actualizado correctamente.' });
        });
    });
});

app.post('/api/pacientes/compartir', (req, res) => {
    const { id_paciente, id_usuario } = req.body;
    console.log(`[/api/pacientes/compartir] Generando invitación: paciente=${id_paciente}, usuario=${id_usuario}`);

    if (!id_paciente || !id_usuario) {
        return res.status(400).json({ error: 'ID de paciente y usuario son requeridos.' });
    }

    const queryAcceso = 'SELECT tipo_permiso FROM acceso_pacientes WHERE id_usuario = ? AND id_paciente = ?';
    db.query(queryAcceso, [id_usuario, id_paciente], (err, accesoResult) => {
        if (err) {
            console.error('[/api/pacientes/compartir] Error de DB:', err);
            return res.status(500).json({ error: 'Error en la base de datos.' });
        }
        
        if (accesoResult.length === 0) {
            console.log(`[/api/pacientes/compartir] Usuario ${id_usuario} no tiene acceso a paciente ${id_paciente}`);
            return res.status(403).json({ error: 'No puedes compartir este paciente porque no tienes acceso.' });
        }

        const permiso = accesoResult[0].tipo_permiso;
        if (!['Administrador', 'Doctor'].includes(permiso)) {
            console.log(`[/api/pacientes/compartir] Usuario tiene permiso "${permiso}", se requiere Admin o Doctor`);
            return res.status(403).json({ error: 'Solo Administrador o Doctor pueden generar un enlace de invitado.' });
        }

        const insertCompartido = `INSERT INTO acceso_pacientes (id_usuario, id_paciente, tipo_permiso, fecha_asignacion) VALUES (NULL, ?, 'Invitado', NOW())`;
        db.query(insertCompartido, [id_paciente], (shareErr, shareResult) => {
            if (shareErr) {
                console.error('[/api/pacientes/compartir] Error MySQL:', shareErr);
                return res.status(500).json({ error: 'No se pudo crear el acceso de invitado.' });
            }
            
            const nuevoId = shareResult.insertId;
            console.log(`[/api/pacientes/compartir] Acceso invitado creado con ID: ${nuevoId}`);
            
            res.json({ mensaje: 'Enlace de invitado generado.', id_acceso: nuevoId });
        });
    });
});

app.get('/api/accesos', (req, res) => {
    const id_usuario = req.query.id_usuario;
    const id_paciente = req.query.id_paciente;
    if (!id_usuario && !id_paciente) {
        return res.status(400).json({ error: 'ID de usuario o ID de paciente requerido.' });
    }

    if (id_paciente) {
        const query = `SELECT a.id_acceso, a.id_paciente, a.id_usuario, a.tipo_permiso, a.fecha_asignacion,
                              p.nombre AS paciente_nombre,
                              COALESCE(u.nombre, 'Invitado') AS usuario_nombre
                       FROM acceso_pacientes a
                       JOIN pacientes p ON p.id_paciente = a.id_paciente
                       LEFT JOIN usuarios u ON u.id = a.id_usuario
                       WHERE a.id_paciente = ?
                       ORDER BY a.fecha_asignacion DESC`;
        db.query(query, [id_paciente], (err, results) => {
            if (err) {
                console.error('Error MySQL al cargar accesos por paciente:', err);
                return res.status(500).json({ error: 'Error interno al leer accesos.' });
            }
            const datos = results.map(row => {
                let usuarioNombre = (!row.id_usuario) ? 'Invitado (Pendiente)' : (row.usuario_nombre ? row.usuario_nombre : 'Usuario desconocido');
                if (row.id_usuario !== 0 && row.usuario_nombre) {
                    try {
                        usuarioNombre = desencriptar(row.usuario_nombre);
                    } catch (decryptErr) {
                        console.error('[/api/accesos] Error desencriptando usuario_nombre:', decryptErr);
                        usuarioNombre = row.usuario_nombre;
                    }
                }
                return {
                    ...row,
                    usuario_nombre: usuarioNombre
                };
            });
            return res.json(datos);
        });
        return;
    }

    const query = `SELECT a.id_acceso, a.id_paciente, a.tipo_permiso, a.fecha_asignacion, p.nombre AS paciente_nombre
                   FROM acceso_pacientes a
                   JOIN pacientes p ON p.id_paciente = a.id_paciente
                   WHERE a.id_usuario = ?
                   ORDER BY a.fecha_asignacion DESC`;
    db.query(query, [id_usuario], (err, results) => {
        if (err) {
            console.error('Error MySQL al cargar accesos:', err);
            return res.status(500).json({ error: 'Error interno al leer accesos.' });
        }
        res.json(results);
    });
});

app.put('/api/accesos/:id', (req, res) => {
    const id_acceso = req.params.id;
    const { id_usuario, id_paciente, nuevo_permiso } = req.body;

    if (!id_usuario || !id_paciente || !nuevo_permiso) {
        return res.status(400).json({ error: 'ID de usuario, ID de paciente y nuevo permiso son requeridos.' });
    }

    const permisoValido = ['Administrador', 'Doctor', 'Invitado'];
    if (!permisoValido.includes(nuevo_permiso)) {
        return res.status(400).json({ error: 'Permiso inválido.' });
    }

    const queryAcceso = 'SELECT tipo_permiso FROM acceso_pacientes WHERE id_usuario = ? AND id_paciente = ?';
    db.query(queryAcceso, [id_usuario, id_paciente], (err, accesoResult) => {
        if (err || accesoResult.length === 0) {
            return res.status(403).json({ error: 'No tienes permiso para modificar accesos.' });
        }

        const permiso = accesoResult[0].tipo_permiso;
        if (!['Administrador', 'Doctor'].includes(permiso)) {
            return res.status(403).json({ error: 'Solo Administrador o Doctor pueden modificar accesos.' });
        }

        const queryObjetivo = 'SELECT id_usuario FROM acceso_pacientes WHERE id_acceso = ?';
        db.query(queryObjetivo, [id_acceso], (targetErr, targetResult) => {
            if (targetErr || targetResult.length === 0) {
                return res.status(404).json({ error: 'Acceso objetivo no encontrado.' });
            }
            if (String(targetResult[0].id_usuario) === String(id_usuario)) {
                return res.status(403).json({ error: 'No puedes modificar tus propios permisos.' });
            }

            const updateQuery = 'UPDATE acceso_pacientes SET tipo_permiso = ? WHERE id_acceso = ?';
            db.query(updateQuery, [nuevo_permiso, id_acceso], (updateErr) => {
                if (updateErr) {
                    console.error('Error MySQL al actualizar permiso de acceso:', updateErr);
                    return res.status(500).json({ error: 'No se pudo actualizar el permiso de acceso.' });
                }
                res.json({ mensaje: 'Permiso actualizado con éxito.' });
            });
        });
    });
});

app.delete('/api/accesos/:id', (req, res) => {
    const id_acceso = req.params.id;
    const { id_usuario, id_paciente } = req.query;

    if (!id_usuario || !id_paciente) {
        return res.status(400).json({ error: 'ID de usuario y ID de paciente son requeridos.' });
    }

    const queryAcceso = 'SELECT tipo_permiso FROM acceso_pacientes WHERE id_usuario = ? AND id_paciente = ?';
    db.query(queryAcceso, [id_usuario, id_paciente], (err, accesoResult) => {
        if (err || accesoResult.length === 0) {
            return res.status(403).json({ error: 'No tienes permiso para revocar accesos.' });
        }

        const permiso = accesoResult[0].tipo_permiso;
        if (!['Administrador', 'Doctor'].includes(permiso)) {
            return res.status(403).json({ error: 'Solo Administrador o Doctor pueden revocar accesos.' });
        }

        const queryObjetivo = 'SELECT id_usuario FROM acceso_pacientes WHERE id_acceso = ?';
        db.query(queryObjetivo, [id_acceso], (targetErr, targetResult) => {
            if (targetErr || targetResult.length === 0) {
                return res.status(404).json({ error: 'Acceso objetivo no encontrado.' });
            }
            if (String(targetResult[0].id_usuario) === String(id_usuario)) {
                return res.status(403).json({ error: 'No puedes revocar tu propio acceso.' });
            }

            const deleteQuery = 'DELETE FROM acceso_pacientes WHERE id_acceso = ?';
            db.query(deleteQuery, [id_acceso], (deleteErr) => {
                if (deleteErr) {
                    console.error('Error MySQL al revocar acceso:', deleteErr);
                    return res.status(500).json({ error: 'No se pudo revocar el acceso.' });
                }
                res.json({ mensaje: 'Acceso revocado correctamente.' });
            });
        });
    });
});

app.get('/api/debug/acceso/:id', (req, res) => {
    const id_acceso = req.params.id;
    const query = `SELECT * FROM acceso_pacientes WHERE id_acceso = ?`;
    db.query(query, [id_acceso], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results.length > 0 ? results[0] : { error: 'No encontrado' });
    });
});

app.get('/api/invitado', (req, res) => {
    const id_acceso = req.query.acceso;
    console.log(`[/api/invitado] Buscando acceso: ${id_acceso}`);
    
    if (!id_acceso) {
        return res.status(400).json({ error: 'Código de acceso requerido.' });
    }

    // Primero verificar que el acceso existe y es de tipo 'Invitado'
    const checkQuery = `SELECT a.id_acceso, a.tipo_permiso, a.id_paciente FROM acceso_pacientes a WHERE a.id_acceso = ?`;
    db.query(checkQuery, [id_acceso], (checkErr, checkResults) => {
        if (checkErr) {
            console.error('[/api/invitado] Error verificando acceso:', checkErr);
            return res.status(500).json({ error: 'Error en la base de datos.' });
        }
        
        if (checkResults.length === 0) {
            console.log(`[/api/invitado] Acceso ${id_acceso} no existe`);
            return res.status(404).json({ error: 'Código de acceso inválido.' });
        }
        
        const acceso = checkResults[0];
        console.log(`[/api/invitado] Acceso encontrado: tipo="${acceso.tipo_permiso}", id_paciente=${acceso.id_paciente}`);
        
        // Si no es invitado, enviamos una alerta especial para que el frontend (invitado.js) fuerce el login o lo mande al index
        if (acceso.tipo_permiso !== 'Invitado') {
            console.log(`[/api/invitado] Acceso ${id_acceso} fue elevado a ${acceso.tipo_permiso}`);
            return res.status(200).json({ 
                requireLogin: true, 
                message: 'Este acceso tiene privilegios elevados. Redirigiendo a tu cuenta...',
                id_paciente: acceso.id_paciente
            });
        }
        
        // Si el cliente es un usuario autenticado y nos pasa userId, intentar vincular el acceso 'Invitado' al usuario real
        const guestBindUserId = req.query.userId ? Number(req.query.userId) : null;
        const guestBindUserName = req.query.userName || null;
        if (guestBindUserId && guestBindUserId > 0) {
            try {
                const bindQuery = 'UPDATE acceso_pacientes SET id_usuario = ? WHERE id_acceso = ? AND (id_usuario = 0 OR id_usuario IS NULL)';
                db.query(bindQuery, [guestBindUserId, id_acceso], (bindErr, bindRes) => {
                    if (bindErr) console.error('[/api/invitado] Error vinculando invitado a usuario:', bindErr);
                    else if (bindRes.affectedRows > 0) console.log(`[/api/invitado] Acceso ${id_acceso} vinculado al usuario ${guestBindUserId}`);
                });
            } catch (bindEx) { console.error('[/api/invitado] Excepción vinculando invitado:', bindEx); }
        }

        // Ahora traer datos del paciente
        const pacienteQuery = `SELECT p.id_paciente, p.nombre, p.peso_kg, p.edad, p.sexo, p.padecimiento, p.rango_spo2_min, p.rango_spo2_max
                              FROM pacientes p WHERE p.id_paciente = ?`;
        db.query(pacienteQuery, [acceso.id_paciente], (pacErr, pacResults) => {
            if (pacErr || pacResults.length === 0) {
                console.error('[/api/invitado] Error obteniendo paciente:', pacErr);
                return res.status(404).json({ error: 'Paciente no encontrado.' });
            }
            
            const paciente = pacResults[0];
            console.log(`[/api/invitado] Retornando paciente: ${paciente.id_paciente}`);
            
            // Usar try/catch para desencriptar de forma segura
            let nombreDesencriptado = 'Paciente';
            try {
                nombreDesencriptado = paciente.nombre ? desencriptar(paciente.nombre) : 'Paciente';
            } catch (decryptErr) {
                console.error('[/api/invitado] Error desencriptando nombre:', decryptErr);
                nombreDesencriptado = paciente.nombre || 'Paciente';
            }
            
            res.json({
                id_acceso: acceso.id_acceso,
                ...paciente,
                nombre: nombreDesencriptado,
                tipo_permiso: 'Invitado'
            });
        });
    });
});

app.post('/api/dispositivos', (req, res) => {
    const { ssid_wifi, password_wifi, estado_paro_emergencia, usuario_paro_emergencia, id_usuario } = req.body;

    if (!ssid_wifi || !password_wifi || !id_usuario) {
        return res.status(400).json({ error: 'SSID, contraseña y usuario son requeridos.' });
    }

    const query = `INSERT INTO dispositivos_seroa (ssid_wifi, password_wifi, estado_paro_emergencia, usuario_paro_emergencia, fecha_registro) VALUES (?, ?, ?, ?, NOW())`;
    db.query(query, [ssid_wifi, password_wifi, estado_paro_emergencia || 'Desactivado', usuario_paro_emergencia || null], (err, result) => {
        if (err) {
            console.error('Error MySQL al agregar dispositivo:', err);
            return res.status(500).json({ error: 'No se pudo registrar el dispositivo.' });
        }
        res.json({ mensaje: 'Dispositivo registrado con éxito.', id_dispositivo: result.insertId });
    });
});

app.get('/api/dispositivos', (req, res) => {
    const id_usuario = req.query.id_usuario;
    if (!id_usuario) {
        return res.status(400).json({ error: 'ID de usuario requerido.' });
    }

    const query = `SELECT id_dispositivo, ssid_wifi, password_wifi, estado_paro_emergencia, usuario_paro_emergencia, fecha_registro FROM dispositivos_seroa ORDER BY id_dispositivo DESC`;
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error MySQL al cargar dispositivos:', err);
            return res.status(500).json({ error: 'Error interno al leer dispositivos.' });
        }
        res.json(results);
    });
});

app.post('/api/dispositivos/:id/configurar', (req, res) => {
    const id_dispositivo = req.params.id;
    const { ssid_wifi, password_wifi, estado_paro_emergencia, usuario_paro_emergencia } = req.body;

    const query = `UPDATE dispositivos_seroa SET ssid_wifi = ?, password_wifi = ?, estado_paro_emergencia = ?, usuario_paro_emergencia = ? WHERE id_dispositivo = ?`;
    db.query(query, [ssid_wifi, password_wifi, estado_paro_emergencia, usuario_paro_emergencia, id_dispositivo], (err) => {
        if (err) {
            console.error('Error MySQL al actualizar dispositivo:', err);
            return res.status(500).json({ error: 'No se pudo actualizar el dispositivo.' });
        }
        res.json({ mensaje: 'Configuración de dispositivo guardada.' });
    });
});

app.post('/api/tanques', (req, res) => {
    const { id_dispositivo, presion_actual, porcentaje, tiempo_restante_minutos, ultima_actualizacion } = req.body;
    if (!id_dispositivo || presion_actual === undefined || porcentaje === undefined || tiempo_restante_minutos === undefined) {
        return res.status(400).json({ error: 'ID de dispositivo, presión, porcentaje y tiempo restante son requeridos.' });
    }

    const query = `INSERT INTO tanques (id_dispositivo, presion_actual, porcentaje, tiempo_restante_minutos, ultima_actualizacion) VALUES (?, ?, ?, ?, ?)`;
    db.query(query, [id_dispositivo, presion_actual, porcentaje, tiempo_restante_minutos, ultima_actualizacion || new Date()], (err, result) => {
        if (err) {
            console.error('Error MySQL al agregar tanque:', err);
            return res.status(500).json({ error: 'No se pudo registrar el tanque.' });
        }
        res.json({ mensaje: 'Tanque registrado con éxito.', id_tanque: result.insertId });
    });
});

app.get('/api/tanques', (req, res) => {
    const { id_dispositivo, id_paciente } = req.query;
    let query = 'SELECT * FROM tanques';
    const params = [];

    if (id_dispositivo) {
        query += ' WHERE id_dispositivo = ?';
        params.push(id_dispositivo);
    }

    query += ' ORDER BY id_tanque DESC LIMIT 10';
    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Error MySQL al cargar tanques:', err);
            return res.status(500).json({ error: 'Error interno al leer tanques.' });
        }
        res.json(results);
    });
});

// Almacenamiento híbrido: acumuladores por paciente para lecturas normales (promediar por hora)
const hourAggregates = {}; // { [id_paciente]: { hourLabel: 'YYYY-MM-DDTHH', sumSpo2, sumBpm, count } }

function hourLabelForDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    return `${y}-${m}-${day}T${h}`;
}

function flushAggregateForPatient(id_paciente) {
    const agg = hourAggregates[id_paciente];
    if (!agg || agg.count === 0) return;

    const avgSpo2 = Math.round(agg.sumSpo2 / agg.count);
    const avgBpm = Math.round(agg.sumBpm / agg.count);
    const id_registro = crypto.randomBytes(12).toString('hex');
    const fecha_hora = new Date().toISOString();

    const query = `INSERT INTO registros_biomedicos (id_registro, id_paciente, id_dispositivo, saturacion_oxigeno, ritmo_cardiaco, es_critico, fecha_hora) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    db.query(query, [id_registro, id_paciente, null, avgSpo2, avgBpm, 0, fecha_hora], (err) => {
        if (err) console.error('Error al guardar resumen horario en BD:', err);
        else console.log(`Resumen horario guardado paciente ${id_paciente} -> SpO2 ${avgSpo2}, BPM ${avgBpm} (count ${agg.count})`);
    });

    // reset
    delete hourAggregates[id_paciente];
}

// --- Escribir en Firebase Realtime DB (ruta privada por paciente)
const FIREBASE_DB = 'https://seroa-e8606-default-rtdb.firebaseio.com';
function writeRealtimePaciente(id_paciente, payload) {
    return new Promise((resolve, reject) => {
        if (!id_paciente) return resolve();
        try {
            const dataStr = JSON.stringify(payload || {});
            const path = `/Seroa/Pacientes/${encodeURIComponent(id_paciente)}/Actual.json`;
            const url = new URL(FIREBASE_DB + path);

            const options = {
                hostname: url.hostname,
                path: url.pathname + (url.search || ''),
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(dataStr)
                }
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => resolve(body));
            });

            req.on('error', (err) => {
                console.error('Error escribiendo Realtime Firebase:', err);
                reject(err);
            });

            req.write(dataStr);
            req.end();
        } catch (err) {
            console.error('Error preparando escritura a Firebase Realtime:', err);
            resolve();
        }
    });
}

app.post('/api/registros', (req, res) => {
    // Accept payloads from frontend (index.js) that include nivel_alerta or es_critico
    const { id_registro, id_paciente, id_dispositivo, saturacion_oxigeno, ritmo_cardiaco, es_critico, fecha_hora, nivel_alerta } = req.body;

    if (!id_paciente || saturacion_oxigeno === undefined || ritmo_cardiaco === undefined) {
        return res.status(400).json({ error: 'Faltan datos obligatorios para procesar el registro.' });
    }

    const spo2 = Number(saturacion_oxigeno);
    const bpm = Number(ritmo_cardiaco);
    const nivel = (nivel_alerta || (es_critico ? (es_critico === 2 ? 'Peligro' : 'Precaución') : 'Normal'));

    // Determine severity — consider anomalous only Precaución o Peligro
    const isAnomaly = nivel === 'Peligro' || nivel === 'Precaución';

    if (isAnomaly) {
        // Insert immediately as incident
        const idr = id_registro || crypto.randomBytes(12).toString('hex');
        const fecha = fecha_hora || new Date().toISOString();
        const esCrit = (nivel === 'Peligro') ? 2 : (nivel === 'Precaución' ? 1 : 0);

        const query = `INSERT INTO registros_biomedicos (id_registro, id_paciente, id_dispositivo, saturacion_oxigeno, ritmo_cardiaco, es_critico, fecha_hora) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        db.query(query, [idr, id_paciente, id_dispositivo || null, spo2, bpm, esCrit, fecha], (err) => {
            if (err) {
                console.error('Error MySQL al guardar incidente:', err);
                return res.status(500).json({ error: 'No se pudo guardar el incidente.' });
            }
            // Reset aggregate for this patient (rompe el promediado)
            if (hourAggregates[id_paciente]) delete hourAggregates[id_paciente];
            // También publicar lectura en Realtime DB bajo ruta privada del paciente
            try {
                const payload = {
                    spo2: spo2,
                    bpm: bpm,
                    nivel: nivel,
                    es_critico: esCrit,
                    timestamp: fecha,
                    estado: 'ACTIVO'
                };
                writeRealtimePaciente(id_paciente, payload).catch(e => console.error('Realtime write error (incidente):', e));
            } catch (wErr) { console.error('Error publicando incidente a Realtime:', wErr); }

            return res.json({ mensaje: 'Incidente guardado inmediatamente.' });
        });
        return;
    }

    // Normal reading: accumulate per hour
    const now = new Date(fecha_hora || Date.now());
    const label = hourLabelForDate(now);
    const agg = hourAggregates[id_paciente];

    if (!agg) {
        hourAggregates[id_paciente] = { hourLabel: label, sumSpo2: spo2, sumBpm: bpm, count: 1 };
        try {
            const payload = { spo2, bpm, nivel, timestamp: now.toISOString(), estado: 'ACTIVO' };
            writeRealtimePaciente(id_paciente, payload).catch(e => console.error('Realtime write error (nuevo agg):', e));
        } catch (wErr) { console.error('Error publicando lectura normal a Realtime:', wErr); }
        return res.json({ mensaje: 'Lectura normal acumulada.' });
    }

    if (agg.hourLabel !== label) {
        // hour changed -> flush previous
        flushAggregateForPatient(id_paciente);
        // start new aggregate with current reading
        hourAggregates[id_paciente] = { hourLabel: label, sumSpo2: spo2, sumBpm: bpm, count: 1 };
        try {
            const payload = { spo2, bpm, nivel, timestamp: now.toISOString(), estado: 'ACTIVO' };
            writeRealtimePaciente(id_paciente, payload).catch(e => console.error('Realtime write error (nuevo intervalo):', e));
        } catch (wErr) { console.error('Error publicando lectura normal a Realtime:', wErr); }
        return res.json({ mensaje: 'Lectura normal acumulada (nuevo intervalo horario, se flushó anterior).' });
    }

    // same hour -> accumulate
    agg.sumSpo2 += spo2;
    agg.sumBpm += bpm;
    agg.count += 1;
    try {
        const payload = { spo2, bpm, nivel, timestamp: now.toISOString(), estado: 'ACTIVO' };
        writeRealtimePaciente(id_paciente, payload).catch(e => console.error('Realtime write error (acumulada):', e));
    } catch (wErr) { console.error('Error publicando lectura normal a Realtime:', wErr); }
    return res.json({ mensaje: 'Lectura normal acumulada.' });
});

app.get('/api/registros', (req, res) => {
    const id_paciente = req.query.id_paciente;
    if (!id_paciente) {
        return res.status(400).json({ error: 'ID de paciente requerido.' });
    }

    const query = `SELECT id_registro, id_paciente, id_dispositivo, saturacion_oxigeno, ritmo_cardiaco, es_critico, fecha_hora
                   FROM registros_biomedicos
                   WHERE id_paciente = ?
                   ORDER BY fecha_hora DESC
                   LIMIT 50`;
    db.query(query, [id_paciente], (err, results) => {
        if (err) {
            console.error('Error MySQL al cargar registros:', err);
            return res.status(500).json({ error: 'Error interno al leer registros biométricos.' });
        }
        res.json(results);
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => console.log(`Seroa activo en puerto ${PORT}`));