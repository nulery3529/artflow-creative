import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Heart, LogOut, MapPin, Package, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import ShopHeader from "@/components/store/ShopHeader";
import StoreAuthForm from "@/components/store/StoreAuthForm";
import AddressFields from "@/components/store/AddressFields";
import ProductCard from "@/components/store/ProductCard";
import { Image } from "@/components/ui/image";
import {
  storeApi, formatStoreMoney, useStoreCart, useStoreCustomer, setCustomerToken, notifyStoreSync,
} from "@/lib/storeClient";

const emptyAddress = { label: "Shipping", recipient_name: "", line1: "", line2: "", city: "", region: "", postal_code: "", country: "US" };
const statusStyles = {
  pending: "bg-amber-100 text-amber-900",
  paid: "bg-emerald-100 text-emerald-900",
  processing: "bg-blue-100 text-blue-900",
  shipped: "bg-indigo-100 text-indigo-900",
  completed: "bg-emerald-200 text-emerald-950",
  cancelled: "bg-rose-100 text-rose-900",
};

export default function ShopAccount() {
  const navigate = useNavigate();
  const { customer, refresh } = useStoreCustomer();
  const { wishlist, refresh: refreshCart } = useStoreCart();
  const [tab, setTab] = useState("orders");
  const [orders, setOrders] = useState(null);
  const [addresses, setAddresses] = useState(null);
  const [addressForm, setAddressForm] = useState(null);
  const [savingAddress, setSavingAddress] = useState(false);

  useEffect(() => {
    if (!customer) return;
    if (tab === "orders") {
      setOrders(null);
      storeApi.orders().then((data) => setOrders(data.orders)).catch(() => setOrders([]));
    }
    if (tab === "addresses" && addresses === null) {
      storeApi.addresses().then((data) => setAddresses(data.addresses || [])).catch(() => setAddresses([]));
    }
  }, [customer, tab]);

  const logout = async () => {
    try { await storeApi.logout(); } catch { /* local clear is enough */ }
    setCustomerToken("");
    refresh();
  };

  const saveAddress = async (event) => {
    event.preventDefault();
    if (savingAddress) return;
    setSavingAddress(true);
    try {
      const data = await storeApi.saveAddress(addressForm);
      setAddresses(data.addresses);
      setAddressForm(null);
      toast.success("Address saved");
    } catch (error) {
      toast.error(error?.message || "Could not save the address");
    } finally {
      setSavingAddress(false);
    }
  };

  const deleteAddress = async (id) => {
    try {
      const data = await storeApi.deleteAddress(id);
      setAddresses(data.addresses);
    } catch (error) {
      toast.error(error?.message || "Could not delete the address");
    }
  };

  const moveWishlistToCart = async (product) => {
    try {
      await storeApi.cartAction("add", { product_id: product.product_id, quantity: 1 });
      await storeApi.cartAction("wishlist_remove", { product_id: product.product_id });
      await refreshCart();
      notifyStoreSync();
      toast.success("Moved to cart");
    } catch (error) {
      toast.error(error?.message || "Could not move the item");
    }
  };

  const removeWishlist = async (product) => {
    try {
      await storeApi.cartAction("wishlist_remove", { product_id: product.product_id });
      await refreshCart();
      notifyStoreSync();
    } catch (error) {
      toast.error(error?.message || "Could not update the wishlist");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ShopHeader />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pb-24 space-y-6">
        {customer === undefined && <div className="h-16 rounded-3xl bg-muted animate-pulse mt-8" />}

        {customer === null && (
          <div className="pt-8">
            <StoreAuthForm onAuthenticated={() => { refresh(); navigate("/shop"); }} />
          </div>
        )}

        {customer && (
          <>
            <section className="bg-card rounded-3xl border border-[hsl(var(--border))] p-5 flex items-center gap-4 mt-6">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center font-heading text-lg">
                {String(customer.name || customer.email || "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{customer.name || "Art collector"}</p>
                <p className="text-sm text-muted-foreground truncate">{customer.email}</p>
              </div>
              <button type="button" onClick={logout} className="h-11 px-4 rounded-2xl bg-muted text-sm font-semibold flex items-center gap-2">
                <LogOut className="w-4 h-4" /> Log out
              </button>
            </section>

            <div className="flex gap-2">
              {[
                { key: "orders", label: "Orders", icon: Package },
                { key: "addresses", label: "Addresses", icon: MapPin },
                { key: "wishlist", label: "Wishlist", icon: Heart },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`h-11 px-4 rounded-2xl text-sm font-semibold flex items-center gap-2 ${
                    tab === key ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "bg-card border border-[hsl(var(--border))]"
                  }`}
                >
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>

            {tab === "orders" && (
              orders === null ? <div className="h-24 rounded-3xl bg-muted animate-pulse" /> :
              orders.length === 0 ? (
                <div className="bg-card rounded-3xl border border-[hsl(var(--border))] p-10 text-center">
                  <p className="font-heading text-lg">No orders yet</p>
                  <Link to="/shop" className="inline-block mt-3 h-12 px-6 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold leading-[3rem]">
                    Browse artwork
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div key={order.id} className="bg-card rounded-3xl border border-[hsl(var(--border))] p-5 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">{order.order_number}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${statusStyles[order.status] || "bg-muted text-foreground"}`}>
                          {order.status}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {(order.items || []).map((item, index) => (
                          <div key={index} className="flex items-center gap-3">
                            {item.image ? (
                              <div className="w-12 h-12 rounded-xl overflow-hidden bg-muted shrink-0">
                                <Image src={item.image} alt={item.name} className="w-full h-full" />
                              </div>
                            ) : <div className="w-12 h-12 rounded-xl bg-muted shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate">{item.name}</p>
                              <p className="text-xs text-muted-foreground">Qty {item.quantity}</p>
                            </div>
                            <p className="text-sm font-semibold">{formatStoreMoney(item.price_cents * item.quantity, order.currency)}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between border-t border-[hsl(var(--border))] pt-3">
                        <span className="text-sm text-muted-foreground">Total</span>
                        <span className="font-heading">{formatStoreMoney(order.total_cents, order.currency)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {tab === "addresses" && (
              <div className="space-y-4">
                {(addresses || []).map((saved) => (
                  <div key={saved.id} className="bg-card rounded-3xl border border-[hsl(var(--border))] p-5 flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1 text-sm">
                      <p className="font-semibold">{saved.recipient_name || saved.label}</p>
                      <p className="text-muted-foreground">
                        {saved.line1}{saved.line2 ? `, ${saved.line2}` : ""}, {saved.city} {saved.region} {saved.postal_code}, {saved.country}
                      </p>
                      {saved.is_default && <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-muted text-[10px] font-semibold">Default</span>}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setAddressForm({ ...saved })} className="h-10 px-3 rounded-xl bg-muted text-sm font-semibold">Edit</button>
                      <button type="button" onClick={() => deleteAddress(saved.id)} className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground" aria-label="Delete address">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {addressForm ? (
                  <form onSubmit={saveAddress} className="bg-card rounded-3xl border border-[hsl(var(--border))] p-5 space-y-4">
                    <p className="font-heading text-lg">{addressForm.id ? "Edit address" : "New address"}</p>
                    <AddressFields value={addressForm} onChange={setAddressForm} />
                    <div className="flex gap-3">
                      <button type="submit" disabled={savingAddress} className="flex-1 h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold disabled:opacity-50">
                        {savingAddress ? "Saving…" : "Save address"}
                      </button>
                      <button type="button" onClick={() => setAddressForm(null)} className="h-12 px-5 rounded-2xl bg-muted text-foreground font-semibold">Cancel</button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddressForm({ ...emptyAddress })}
                    className="w-full h-12 rounded-2xl bg-muted text-foreground font-semibold flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Add an address
                  </button>
                )}
              </div>
            )}

            {tab === "wishlist" && (
              wishlist.length === 0 ? (
                <div className="bg-card rounded-3xl border border-[hsl(var(--border))] p-10 text-center">
                  <p className="font-heading text-lg">Your wishlist is empty</p>
                  <p className="text-sm text-muted-foreground mt-1">Tap the heart on any piece to save it for later.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {wishlist.map((product) => (
                    <div key={product.product_id} className="space-y-2">
                      <ProductCard product={{ ...product, id: product.product_id }} />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => moveWishlistToCart(product)} className="flex-1 h-10 rounded-xl bg-muted text-xs font-semibold">
                          Add to cart
                        </button>
                        <button type="button" onClick={() => removeWishlist(product)} className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground" aria-label="Remove">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </>
        )}
      </main>
    </div>
  );
}