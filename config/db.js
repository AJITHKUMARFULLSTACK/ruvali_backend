const mysql = require('mysql2/promise');
const { HttpError } = require('../utils/httpError');

const dbConfigured = Boolean(
  process.env.DB_HOST &&
    process.env.DB_USER &&
    process.env.DB_NAME
);

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || '',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  queueLimit: 0,
});

function assertDbConfigured() {
  if (!dbConfigured) {
    throw new HttpError(
      503,
      'Database is not configured. Set DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME.'
    );
  }
}

async function query(sql, params = []) {
  assertDbConfigured();
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function withTransaction(handler) {
  assertDbConfigured();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await handler(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function testDbConnection() {
  assertDbConfigured();
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
  query,
  withTransaction,
  dbConfigured,
  testDbConnection,
};

