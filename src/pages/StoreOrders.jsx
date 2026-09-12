import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Users } from "lucide-react";
import { toast } from "sonner";
import { storeAdmin, formatStoreMoney } from "@/lib/storeClient";

const ORDER_STATUSES = ["pending", "paid", "processing", "shipped", "completed", "cancelled"];

const statusStyles = {
  pending: "bg-amber-100 text-amber-900",
  paid: "bg-emerald-100 text-emerald-900",
  processing: "bg-blue-100 text-blue-900",
  shipped: "bg-indigo-100 text-indigo-900",
  completed: "bg-emerald-200 text-emerald-950",
  cancelled: "bg-rose-100 text-rose-900",
};

export default function StoreOrders() {
  const [orders, setOrders] = useState(null);
  const [customers, setCustomers] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [details, setDetails] = useState(null);

  const load = async () => {
    try {
      const [orderData, customerData] = await Promise.all([storeAdmin.orders(), storeAdmin.customers()]);
      setOrders(orderData.orders);
      setCustomers(customerData.customers);
    } catch (error) {
      toast.error("Could not load store orders", { description: error?.message });
      setOrders([]);
      setCustomers([]);
    }
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (order, status) => {
    try {
      await storeAdmin.orderUpdate(order.id, status);
      toast.success(`Order ${order.order_number} marked ${status}`);
      await load();
    } catch (error) {
      toast.error("Could not update the order", { description: error?.message });
    }
  };

  const toggleExpand = async (order) => {
    if (expandedId === order.id) {
      setExpandedId(null);
      setDetails(null);
      return;
    }
    setExpandedId(order.id);
    setDetails(null);
    try {
      const data = await storeAdmin.order(order.id);
      setDetails(data.order);
    } catch (error) {
      toast.error("Could not load the order", { description: error?.message });
    }
  };

  const address = details?.shipping_address || {};
  const pendingCount = (orders || []).filter((o) => o.status === "pending").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl">Store orders</h1>
        <p className="text-sm text-muted-foreground">
          Orders placed through your storefront{pendingCount > 0 ? ` · ${pendingCount} awaiting confirmation` : ""}
        </p>
      </div>

      {orders === null ? (
        <div className="h-24 rounded-3xl bg-muted animate-pulse" />
      ) : orders.length === 0 ? (
        <div className="bg-card rounded-3xl border border-[hsl(var(--border))] p-10 text-center">
          <p className="font-heading text-lg">No storefront orders yet</p>
          <p className="text-sm text-muted-foreground mt-1">Orders placed in your shop will appear here.</p>
        </div>
      ) : (
        <div className="bg-card rounded-3xl border border-[hsl(var(--border))] divide-y divide-[hsl(var(--border))]">
          {orders.map((order) => (
            <div key={order.id} className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => toggleExpand(order)} className="w-11 h-11 rounded-2xl bg-muted flex items-center justify-center shrink-0" aria-label="Toggle details">
                  {expandedId === order.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{order.order_number}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {order.email} · {order.item_count} item{order.item_count === 1 ? "" : "s"} ·{" "}
                    {new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </div>
                <p className="font-heading text-foreground">{formatStoreMoney(order.total_cents, order.currency)}</p>
                <select
                  value={order.status}
                  onChange={(e) => updateStatus(order, e.target.value)}
                  className={`h-11 px-3 rounded-2xl text-xs font-semibold capitalize border-transparent ${statusStyles[order.status] || "bg-muted text-foreground"}`}
                >
                  {ORDER_STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>

              {expandedId === order.id && (
                <div className="rounded-2xl bg-muted/60 p-4 space-y-3">
                  {!details ? (
                    <div className="h-6 rounded-xl bg-muted animate-pulse" />
                  ) : (
                    <>
                      {(details.items || []).map((item, index) => (
                        <div key={index} className="flex justify-between text-sm">
                          <span className="truncate">{item.name} × {item.quantity}</span>
                          <span className="font-semibold">{formatStoreMoney(item.price_cents * item.quantity, details.currency)}</span>
                        </div>
                      ))}
                      <div className="border-t border-[hsl(var(--border))] pt-3 text-sm space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ship to</p>
                        <p>{details.customer_name || address.recipient_name || order.email}</p>
                        <p className="text-muted-foreground">
                          {address.line1}{address.line2 ? `, ${address.line2}` : ""}, {address.city} {address.region} {address.postal_code}, {address.country}
                        </p>
                        {details.notes && <p className="text-muted-foreground italic">"{details.notes}"</p>}
                        <p className="text-xs text-muted-foreground">
                          Payment: {details.payments?.[0]?.provider || "stripe"} · {details.payments?.[0]?.status || "pending"}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="font-heading text-lg flex items-center gap-2"><Users className="w-5 h-5" /> Customers</h2>
        {customers === null ? (
          <div className="h-24 rounded-3xl bg-muted animate-pulse" />
        ) : customers.length === 0 ? (
          <div className="bg-card rounded-3xl border border-[hsl(var(--border))] p-8 text-center text-sm text-muted-foreground">
            Customers appear here when they create a store account.
          </div>
        ) : (
          <div className="bg-card rounded-3xl border border-[hsl(var(--border))] divide-y divide-[hsl(var(--border))]">
            {customers.map((customer) => (
              <div key={customer.id} className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-muted flex items-center justify-center font-semibold shrink-0">
                  {String(customer.name || customer.email || "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{customer.name || "Unnamed"}</p>
                  <p className="text-xs text-muted-foreground truncate">{customer.email}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold">{formatStoreMoney(customer.lifetime_cents)}</p>
                  <p className="text-xs text-muted-foreground">{customer.order_count} order{customer.order_count === 1 ? "" : "s"}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}