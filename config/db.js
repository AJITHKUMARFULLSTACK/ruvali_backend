const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || '',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  queueLimit: 0,
});

async function testDbConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
    return 'connected';
  } finally {
    connection.release();
  }
}

module.exports = {
  pool,
  testDbConnection,
};

