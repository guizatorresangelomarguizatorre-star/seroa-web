const mysql = require('mysql2');

// Conexión pública con encriptación SSL obligatoria
const pool = mysql.createPool({
    host: 'switchback.proxy.rlwy.net',
    user: 'root',
    password: 'DYFgQxnovIUFCHrgUPusszxMGMYfUrux',
    database: 'railway',
    port: 35115,
    ssl: {
        rejectUnauthorized: false // <--- ¡LA LLAVE MÁGICA PARA LA NUBE!
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

pool.getConnection((err, connection) => {
    if (err) {
        console.error('Error crítico conectando a MySQL:', err.message);
        return;
    }
    console.log('¡Conexión segura SSL exitosa a la bóveda de Seroa!');
    connection.release();
});

module.exports = pool;