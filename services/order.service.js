const { randomUUID } = require('crypto');
const { query, withTransaction } = require('../config/db');
const { env } = require('../config/env');
const { HttpError } = require('../utils/httpError');
const { ORDER_STATUSES, canTransition } = require('../utils/status');
const { sendWhatsAppMessage, isWhatsAppReady } = require('./whatsapp.service');
const { sendOrderConfirmation, sendStatusUpdate, sendAdminNewOrder } = require('./email.service');

async function createOrderForStore(store, payload) {
  // payload: { customer: { name, phone }, items: [{ productId, quantity }], shippingInfo?, shippingAmount? }
  if (!payload.items || !payload.items.length) {
    throw new HttpError(400, 'Order must contain at least one item');
  }

  const shippingAmount = Number(payload.shippingAmount) || 0;

  // Fetch products and validate stock BEFORE starting transaction
  const productIds = payload.items.map((i) => i.productId);
  const products = await query(
    `SELECT * FROM products 
     WHERE storeId = ? AND id IN (${productIds.map(() => '?').join(', ')})`,
    [store.id, ...productIds]
  );
  if (products.length !== productIds.length) {
    throw new HttpError(400, 'One or more products not found for this store');
  }

  for (const item of payload.items) {
    const product = products.find((p) => p.id === item.productId);
    const quantity = item.quantity || 1;
    const stock = product.stock ?? 0;

    if (stock === 0) {
      throw new HttpError(400, `Product '${product.name}' is out of stock`);
    }
    if (stock < quantity) {
      throw new HttpError(
        400,
        `Insufficient stock for product: ${product.name}. Available: ${stock}, Requested: ${quantity}`
      );
    }
  }

  return withTransaction(async (conn) => {
    const [customerRows] = await conn.execute(
      'SELECT * FROM customers WHERE storeId = ? AND phone = ? LIMIT 1',
      [store.id, payload.customer.phone]
    );
    let customer = customerRows[0];

    if (!customer) {
      const customerId = randomUUID();
      await conn.execute(
        `INSERT INTO customers (id, storeId, name, phone) VALUES (?, ?, ?, ?)`,
        [customerId, store.id, payload.customer.name, payload.customer.phone]
      );
      const [createdRows] = await conn.execute('SELECT * FROM customers WHERE id = ? LIMIT 1', [customerId]);
      customer = createdRows[0];
    }

    const itemsData = [];
    let totalAmount = 0;

    for (const item of payload.items) {
      const product = products.find((p) => p.id === item.productId);
      const price = product.price;
      const quantity = item.quantity || 1;
      totalAmount += Number(price) * quantity;

      itemsData.push({
        productId: product.id,
        quantity,
        price
      });
    }

    const totalWithShipping = totalAmount + shippingAmount;

    const orderId = randomUUID();
    await conn.execute(
      `INSERT INTO orders (
        id, storeId, customerId, totalAmount, shippingAmount,
        shippingInfo, status, paymentId, paymentStatus
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        store.id,
        customer.id,
        totalWithShipping,
        shippingAmount,
        payload.shippingInfo ? JSON.stringify(payload.shippingInfo) : null,
        'PLACED',
        payload.paymentId ?? null,
        payload.paymentStatus ?? 'PENDING',
      ]
    );

    for (const item of itemsData) {
      await conn.execute(
        `INSERT INTO order_items (id, orderId, productId, quantity, price) VALUES (?, ?, ?, ?, ?)`,
        [randomUUID(), orderId, item.productId, item.quantity, Number(item.price)]
      );
    }
    await conn.execute(
      `INSERT INTO order_logs (id, orderId, oldStatus, newStatus) VALUES (?, ?, ?, ?)`,
      [randomUUID(), orderId, null, 'PLACED']
    );

    // Decrement stock for each ordered item (inside same transaction)
    for (const item of itemsData) {
      await conn.execute(
        `UPDATE products SET stock = stock - ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        [item.quantity, item.productId]
      );
    }

    return getOrderDetailsById(conn, orderId, store.id);
  }).then((order) => {
    setImmediate(() => {
      const customer = order.customer;
      sendOrderConfirmation(order, customer, store.name).catch((err) =>
        // eslint-disable-next-line no-console
        console.error('[Email] order confirmation failed:', err.message)
      );
      sendAdminNewOrder(order, customer, store.name, env.email.adminEmail).catch((err) =>
        // eslint-disable-next-line no-console
        console.error('[Email] admin notification failed:', err.message)
      );
      if (env.whatsapp.enabled && isWhatsAppReady()) {
        const name = customer?.name || 'Customer';
        const orderId = order.id.slice(-8).toUpperCase();
        const msg = `Hi ${name}! Your order #${orderId} has been placed.\n\nTotal: ₹${Number(order.totalAmount || 0).toLocaleString('en-IN')}\n\nTrack your order on our website using your Order ID and phone number.`;
        sendWhatsAppMessage(customer?.phone, msg).catch((e) =>
          // eslint-disable-next-line no-console
          console.error('[WhatsApp] order confirmation failed:', e.message)
        );
      }
    });
    return order;
  });
}

async function listOrdersForStore(storeId, { page = 1, limit = 20, status } = {}) {
  const params = [storeId];
  let whereSql = 'WHERE o.storeId = ?';
  if (status) {
    whereSql += ' AND o.status = ?';
    params.push(status);
  }
  const offset = (page - 1) * limit;

  const orders = await query(
    `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customerId
     ${whereSql}
     ORDER BY o.createdAt DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const countRows = await query(
    `SELECT COUNT(*) AS count FROM orders o ${whereSql}`,
    params
  );
  const total = Number(countRows[0].count || 0);

  const hydratedOrders = await hydrateOrders(orders);

  return {
    orders: hydratedOrders,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

async function updateOrderStatusForStore(store, orderId, newStatus) {
  if (!ORDER_STATUSES.includes(newStatus)) {
    throw new HttpError(400, `Invalid status: ${newStatus}`);
  }

  // eslint-disable-next-line no-console
  console.log('[ORDERS] updateOrderStatusForStore called', {
    storeId: store.id,
    orderId,
    newStatus
  });

  return withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customerId
       WHERE o.id = ? AND o.storeId = ?
       LIMIT 1`,
      [orderId, store.id]
    );
    const orderRow = rows[0];
    const order = orderRow
      ? {
          ...orderRow,
          customer: {
            id: orderRow.customerId,
            name: orderRow.customer_name,
            phone: orderRow.customer_phone,
            email: orderRow.customer_email,
          },
        }
      : null;

    if (!order) throw new HttpError(404, 'Order not found');

    const oldStatus = order.status;
    if (!canTransition(oldStatus, newStatus)) {
      throw new HttpError(400, `Cannot transition from ${oldStatus} to ${newStatus}`);
    }

    await conn.execute(
      `UPDATE orders SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [newStatus, order.id]
    );
    await conn.execute(
      `INSERT INTO order_logs (id, orderId, oldStatus, newStatus) VALUES (?, ?, ?, ?)`,
      [randomUUID(), order.id, oldStatus, newStatus]
    );

    const [updatedRows] = await conn.execute(
      `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customerId
       WHERE o.id = ?
       LIMIT 1`,
      [order.id]
    );
    const updatedRow = updatedRows[0];
    const updated = {
      ...updatedRow,
      customer: {
        id: updatedRow.customerId,
        name: updatedRow.customer_name,
        phone: updatedRow.customer_phone,
        email: updatedRow.customer_email,
      },
    };

    setImmediate(() => {
      sendStatusUpdate(updated, updated.customer, newStatus, store.name).catch((err) =>
        // eslint-disable-next-line no-console
        console.error('[Email] status update failed:', err.message)
      );
      if (env.whatsapp.enabled && isWhatsAppReady()) {
        const labels = {
          CONFIRMED: 'confirmed',
          PACKED: 'packed and ready to ship',
          SHIPPED: 'shipped',
          DELIVERED: 'delivered'
        };
        const label = labels[newStatus];
        if (label && updated.customer?.phone) {
          const name = updated.customer.name || 'Customer';
          const orderId = updated.id.slice(-8).toUpperCase();
          const msg = `Hi ${name}! Your order #${orderId} has been ${label}.`;
          sendWhatsAppMessage(updated.customer.phone, msg).catch((e) =>
            // eslint-disable-next-line no-console
            console.error('[WhatsApp] status update failed:', e.message)
          );
        }
      }
    });

    return updated;
  });
}

function normalizePhone(phone, store) {
  // Very simple normalization: ensure + prefix; real implementation should be more robust.
  const trimmed = phone.replace(/\s+/g, '');
  if (trimmed.startsWith('+')) return trimmed;
  // Assume Indian numbers if no country code; adjust as needed.
  if (/^\d{10}$/.test(trimmed)) return `+91${trimmed}`;
  return `+${trimmed}`;
}

/** Normalize phone for comparison: strip spaces and dashes for flexible matching */
function normalizePhoneForCompare(phone) {
  return (phone || '').replace(/[\s\-]/g, '');
}

async function trackOrderForStore(store, orderId, phone) {
  const order = await getOrderDetailsById(null, orderId, store.id);

  if (!order) {
    throw new HttpError(404, 'Order not found. Please check your order ID and phone number.');
  }

  const storedPhone = normalizePhoneForCompare(order.customer?.phone || '');
  const providedPhone = normalizePhoneForCompare(phone);

  if (storedPhone !== providedPhone) {
    throw new HttpError(404, 'Order not found. Please check your order ID and phone number.');
  }

  return {
    id: order.id,
    status: order.status,
    totalAmount: order.totalAmount,
    shippingAmount: order.shippingAmount ?? 0,
    shippingInfo: order.shippingInfo,
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
      productName: item.product?.name,
      quantity: item.quantity,
      price: item.price
    })),
    statusLog: order.logs.map((log) => ({
      timestamp: log.timestamp,
      newStatus: log.newStatus
    }))
  };
}

async function getOrderDetailsById(conn, orderId, storeId) {
  const exec = conn ? conn.execute.bind(conn) : null;
  const orderRows = exec
    ? await exec(
        `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email
         FROM orders o
         LEFT JOIN customers c ON c.id = o.customerId
         WHERE o.id = ? AND o.storeId = ?
         LIMIT 1`,
        [orderId, storeId]
      ).then(([rows]) => rows)
    : await query(
        `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email
         FROM orders o
         LEFT JOIN customers c ON c.id = o.customerId
         WHERE o.id = ? AND o.storeId = ?
         LIMIT 1`,
        [orderId, storeId]
      );
  const row = orderRows[0];
  if (!row) return null;

  const itemsRows = exec
    ? await exec(
        `SELECT oi.*, p.name AS product_name, p.price AS product_price
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.productId
         WHERE oi.orderId = ?
         ORDER BY oi.createdAt ASC`,
        [orderId]
      ).then(([rows]) => rows)
    : await query(
        `SELECT oi.*, p.name AS product_name, p.price AS product_price
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.productId
         WHERE oi.orderId = ?
         ORDER BY oi.createdAt ASC`,
        [orderId]
      );

  const logsRows = exec
    ? await exec(
        `SELECT * FROM order_logs WHERE orderId = ? ORDER BY timestamp ASC`,
        [orderId]
      ).then(([rows]) => rows)
    : await query(
        `SELECT * FROM order_logs WHERE orderId = ? ORDER BY timestamp ASC`,
        [orderId]
      );

  return {
    ...row,
    shippingInfo: row.shippingInfo ? safeJsonParse(row.shippingInfo) : null,
    customer: {
      id: row.customerId,
      name: row.customer_name,
      phone: row.customer_phone,
      email: row.customer_email,
    },
    items: itemsRows.map((item) => ({
      ...item,
      product: {
        id: item.productId,
        name: item.product_name,
        price: item.product_price,
      },
    })),
    logs: logsRows,
  };
}

async function hydrateOrders(orders) {
  if (!orders.length) return [];
  const orderIds = orders.map((o) => o.id);
  const items = await query(
    `SELECT oi.*, p.name AS product_name, p.price AS product_price
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.productId
     WHERE oi.orderId IN (${orderIds.map(() => '?').join(', ')})`,
    orderIds
  );
  const logs = await query(
    `SELECT * FROM order_logs WHERE orderId IN (${orderIds.map(() => '?').join(', ')})`,
    orderIds
  );

  const itemMap = new Map();
  const logMap = new Map();
  for (const item of items) {
    if (!itemMap.has(item.orderId)) itemMap.set(item.orderId, []);
    itemMap.get(item.orderId).push({
      ...item,
      product: { id: item.productId, name: item.product_name, price: item.product_price },
    });
  }
  for (const log of logs) {
    if (!logMap.has(log.orderId)) logMap.set(log.orderId, []);
    logMap.get(log.orderId).push(log);
  }

  return orders.map((order) => ({
    ...order,
    shippingInfo: order.shippingInfo ? safeJsonParse(order.shippingInfo) : null,
    customer: {
      id: order.customerId,
      name: order.customer_name,
      phone: order.customer_phone,
      email: order.customer_email,
    },
    items: itemMap.get(order.id) || [],
    logs: logMap.get(order.id) || [],
  }));
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

module.exports = {
  createOrderForStore,
  listOrdersForStore,
  updateOrderStatusForStore,
  trackOrderForStore
};

