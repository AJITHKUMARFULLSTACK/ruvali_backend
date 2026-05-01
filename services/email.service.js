const nodemailer = require('nodemailer');
const { env } = require('../config/env');

function isEmailConfigured() {
  return Boolean(env.email.user?.trim() && env.email.pass?.trim());
}

function createTransporter() {
  return nodemailer.createTransport({
    host: env.email.host,
    port: env.email.port,
    secure: false,
    auth: {
      user: env.email.user,
      pass: env.email.pass
    }
  });
}

async function sendOrderConfirmation(order, customer, storeName) {
  if (!isEmailConfigured()) return;
  const email = customer?.email?.trim();
  if (!email) return;

  try {
    const shippingInfo = order.shippingInfo || {};
    const items = order.items || [];
    const subtotal = items.reduce((sum, i) => sum + Number(i.price || 0) * (i.quantity || 1), 0);
    const shippingAmount = Number(order.shippingAmount) || 0;
    const totalAmount = Number(order.totalAmount) || subtotal + shippingAmount;
    const orderIdShort = order.id?.slice(-8)?.toUpperCase() || order.id;
    const dateStr = order.createdAt
      ? new Date(order.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
      : '';

    const rows = items
      .map(
        (i) =>
          `<tr><td style="padding:8px 0;border-bottom:1px solid #eee">${escapeHtml(i.product?.name || 'Item')}</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center">${i.quantity || 1}</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">₹${Number(i.price || 0).toLocaleString('en-IN')}</td></tr>`
      )
      .join('');

    const html = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="margin-bottom: 4px;">${escapeHtml(storeName)}</h2>
  <p style="color: #666;">Thank you for your order!</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;">
  
  <p><strong>Order ID:</strong> #${orderIdShort}</p>
  <p><strong>Status:</strong> Order Placed</p>
  <p><strong>Date:</strong> ${dateStr}</p>

  <h3 style="margin-top: 24px;">Items</h3>
  <table style="width: 100%; border-collapse: collapse;">
    ${rows}
  </table>

  <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;">
  <p><strong>Subtotal:</strong> ₹${subtotal.toLocaleString('en-IN')}</p>
  <p><strong>Shipping:</strong> ₹${shippingAmount.toLocaleString('en-IN')}</p>
  <p style="font-size: 18px;"><strong>Total: ₹${totalAmount.toLocaleString('en-IN')}</strong></p>

  <h3 style="margin-top: 24px;">Shipping to</h3>
  <p>${escapeHtml(shippingInfo.fullName || '')}<br>
     ${escapeHtml(shippingInfo.address || '')}<br>
     ${escapeHtml(shippingInfo.city || '')}, ${escapeHtml(shippingInfo.state || '')} ${escapeHtml(shippingInfo.pincode || '')}</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
  <p style="color: #999; font-size: 12px;">
    To track your order, visit our website and use your order ID and phone number.
  </p>
</div>`;

    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"${env.email.fromName}" <${env.email.user}>`,
      to: email,
      subject: `Order Confirmed — #${orderIdShort}`,
      html
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Email] sendOrderConfirmation error:', err.message);
  }
}

async function sendStatusUpdate(order, customer, newStatus, storeName) {
  if (!isEmailConfigured()) return;
  const email = customer?.email?.trim();
  if (!email) return;
  if (newStatus === 'PLACED') return;

  const statusLabels = {
    CONFIRMED: 'confirmed',
    PACKED: 'packed and ready to ship',
    SHIPPED: 'shipped',
    DELIVERED: 'delivered'
  };
  const statusLabel = statusLabels[newStatus] || newStatus.toLowerCase();
  const orderIdShort = order.id?.slice(-8)?.toUpperCase() || order.id;

  try {
    const html = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="margin-bottom: 4px;">${escapeHtml(storeName)}</h2>
  <p style="color: #666;">Your order has been ${statusLabel}.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;">
  <p><strong>Order ID:</strong> #${orderIdShort}</p>
  <p><strong>Status:</strong> ${statusLabel}</p>
  <p style="color: #999; font-size: 12px; margin-top: 24px;">
    To track your order, visit our website and use your order ID and phone number.
  </p>
</div>`;

    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"${env.email.fromName}" <${env.email.user}>`,
      to: email,
      subject: `Your order has been ${statusLabel} — #${orderIdShort}`,
      html
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Email] sendStatusUpdate error:', err.message);
  }
}

async function sendAdminNewOrder(order, customer, storeName, adminEmail) {
  if (!isEmailConfigured()) return;
  const to = adminEmail?.trim();
  if (!to) return;

  try {
    const items = order.items || [];
    const rows = items
      .map(
        (i) =>
          `<tr><td style="padding:8px 0;border-bottom:1px solid #eee">${escapeHtml(i.product?.name || 'Item')}</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center">${i.quantity || 1}</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">₹${Number(i.price || 0).toLocaleString('en-IN')}</td></tr>`
      )
      .join('');
    const shippingInfo = order.shippingInfo || {};
    const orderIdShort = order.id?.slice(-8)?.toUpperCase() || order.id;
    const totalAmount = Number(order.totalAmount || 0).toLocaleString('en-IN');

    const html = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="margin-bottom: 4px;">New order alert</h2>
  <p style="color: #666;">${escapeHtml(storeName)}</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;">
  <p><strong>Order ID:</strong> #${orderIdShort}</p>
  <p><strong>Customer:</strong> ${escapeHtml(customer?.name || '')}</p>
  <p><strong>Phone:</strong> ${escapeHtml(customer?.phone || '')}</p>
  <p><strong>Email:</strong> ${escapeHtml(customer?.email || '')}</p>

  <h3 style="margin-top: 24px;">Items</h3>
  <table style="width: 100%; border-collapse: collapse;">
    ${rows}
  </table>

  <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;">
  <p style="font-size: 18px;"><strong>Total: ₹${totalAmount}</strong></p>

  <h3 style="margin-top: 24px;">Shipping address</h3>
  <p>${escapeHtml(shippingInfo.fullName || '')}<br>
     ${escapeHtml(shippingInfo.address || '')}<br>
     ${escapeHtml(shippingInfo.city || '')}, ${escapeHtml(shippingInfo.state || '')} ${escapeHtml(shippingInfo.pincode || '')}</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
  <p style="color: #666; font-size: 14px;">
    Login to admin panel to manage this order.
  </p>
</div>`;

    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"${env.email.fromName}" <${env.email.user}>`,
      to,
      subject: `New order #${orderIdShort} — ₹${totalAmount}`,
      html
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Email] sendAdminNewOrder error:', err.message);
  }
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  isEmailConfigured,
  createTransporter,
  sendOrderConfirmation,
  sendStatusUpdate,
  sendAdminNewOrder
};
