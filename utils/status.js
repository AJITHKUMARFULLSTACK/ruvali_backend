const ORDER_STATUSES = ['PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'];

function canTransition(oldStatus, newStatus) {
  if (!oldStatus) return newStatus === 'PLACED';
  const oldIdx = ORDER_STATUSES.indexOf(oldStatus);
  const newIdx = ORDER_STATUSES.indexOf(newStatus);
  if (oldIdx === -1 || newIdx === -1) return false;
  return newIdx === oldIdx + 1; // strict forward-only flow
}

module.exports = { ORDER_STATUSES, canTransition };

