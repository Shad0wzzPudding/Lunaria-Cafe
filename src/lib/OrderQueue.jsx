export default function OrderQueue({ orders = [] }) {
  if (orders.length === 0) {
    return <p className="text-sm text-white/50">No orders yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {orders.map((order) => (
        <li
          key={order.id}
          className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2"
        >
          <span>{order.item}</span>
          <span className="text-xs uppercase tracking-wide text-violet-300">
            {order.status}
          </span>
        </li>
      ))}
    </ul>
  );
}
