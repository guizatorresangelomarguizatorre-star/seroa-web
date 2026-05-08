const mysql = require('mysql2');

// Usamos las URL maestras de Railway. 
// Primero intenta la pública, luego la interna, y por último la local de tu PC (XAMPP).
const dbUrl = process.env.MYSQL_PUBLIC_URL || process.env.MYSQL_URL || 'mysql://root:@localhost:3306/seroa';

const pool = mysql.createPool(dbUrl);

pool.getConnection((err, connection) => {
  if (err) {
    console.error(' Error conectando a MySQL:', err.message);
    return;
  }
  console.log(' Conexión exitosa a la base de datos de Seroa.');
  connection.release();
});

module.exports = pool;