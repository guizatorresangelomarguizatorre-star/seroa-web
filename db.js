const mysql = require('mysql2');

// Le decimos que use la URL completa directamente desde las variables de Railway
const pool = mysql.createPool(process.env.MYSQL_URL);

pool.getConnection((err, connection) => {
    if (err) {
        console.error('Error conectando a MySQL:', err.message);
        return;
    }
    console.log('¡Conexión exitosa a la base de datos interna de Railway!');
    connection.release();
});

module.exports = pool;