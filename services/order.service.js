const { prisma } = require('../config/prisma');
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
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, storeId: store.id }
  });
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

  return prisma.$transaction(async (tx) => {
    let customer = await tx.customer.findFirst({
      where: { storeId: store.id, phone: payload.customer.phone }
    });

    if (!customer) {
      customer = await tx.customer.create({
        data: {
          storeId: store.id,
          name: payload.customer.name,
          phone: payload.customer.phone
        }
      });
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

    const order = await tx.order.create({
      data: {
        storeId: store.id,
        customerId: customer.id,
        totalAmount: totalWithShipping,
        shippingAmount,
        shippingInfo: payload.shippingInfo || null,
        status: 'PLACED',
        paymentId: payload.paymentId ?? null,
        paymentStatus: payload.paymentStatus ?? 'PENDING',
        items: {
          create: itemsData
        },
        logs: {
          create: {
            oldStatus: null,
            newStatus: 'PLACED'
          }
        }
      },
      include: {
        customer: true,
        items: { include: { product: true } },
        logs: true
      }
    });

    // Decrement stock for each ordered item (inside same transaction)
    for (const item of itemsData) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } }
      });
    }

    return order;
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
  const where = { storeId, ...(status ? { status } : {}) };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: true,
        items: { include: { product: true } },
        logs: true
      },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.order.count({ where })
  ]);

  return {
    orders,
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

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, storeId: store.id },
      include: { customer: true }
    });

    if (!order) throw new HttpError(404, 'Order not found');

    const oldStatus = order.status;
    if (!canTransition(oldStatus, newStatus)) {
      throw new HttpError(400, `Cannot transition from ${oldStatus} to ${newStatus}`);
    }

    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        status: newStatus,
        logs: {
          create: {
            oldStatus,
            newStatus
          }
        }
      },
      include: { customer: true }
    });

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
  const order = await prisma.order.findFirst({
    where: { id: orderId, storeId: store.id },
    include: {
      customer: true,
      items: { include: { product: true } },
      logs: { orderBy: { timestamp: 'asc' } }
    }
  });

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

module.exports = {
  createOrderForStore,
  listOrdersForStore,
  updateOrderStatusForStore,
  trackOrderForStore
};

