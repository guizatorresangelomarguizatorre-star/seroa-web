const mysql = require('mysql2');

// Conexión directa forzada al Proxy Público para diagnóstico
const pool = mysql.createPool({
    host: 'switchback.proxy.rlwy.net',
    user: 'root',
    password: 'DYFgQxnovIUFCHrgUPusszxMGMYfUrux',
    database: 'railway',
    port: 35115,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

pool.getConnection((err, connection) => {
    if (err) {
        console.error('Error crítico conectando a MySQL:', err.message);
        return;
    }
    console.log('¡Conexión directa exitosa a la base de datos!');
    connection.release();
});

module.exports = pool;