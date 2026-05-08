const mysql = require('mysql2');

// Creamos un grupo de conexiones (pool) para que sea más eficiente
const pool = mysql.createPool({
  host: process.env.MYSQLHOST || 'localhost',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || '',
  database: process.env.MYSQLDATABASE || 'seroa', // Asegúrate de que coincida con el nombre de tu BD
  port: process.env.MYSQLPORT || 3306, // 3306 es el puerto estándar universal para MySQL
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

// Exportamos 'pool' normal, quitando el .promise() para que 
// encaje perfecto con las funciones de tu server.js
module.exports = pool;