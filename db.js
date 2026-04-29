const mysql = require('mysql2');

// Creamos un grupo de conexiones (pool) para que sea más eficiente
const pool = mysql.createPool({
  host: process.env.MYSQLHOST || 'localhost',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || '',
  database: process.env.MYSQLDATABASE || 'seroa_db',
  port: process.env.MYSQLPORT || 8080, // Cambiamos al 8080 que configuramos en tu XAMPP
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Probamos la conexión al arrancar
pool.getConnection((err, connection) => {
  if (err) {
    console.error(' Error conectando a MySQL:', err.message);
    return;
  }
  console.log(' Conexión exitosa a la base de datos de Seroa.');
  connection.release();
});

module.exports = pool.promise();