import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, CreditCard } from "lucide-react";
import { toast } from "sonner";
import ShopHeader from "@/components/store/ShopHeader";
import AddressFields from "@/components/store/AddressFields";
import { storeApi, formatStoreMoney, useStoreCart, useStoreCustomer, isStoreLoggedIn, notifyStoreSync } from "@/lib/storeClient";

const emptyAddress = { label: "Shipping", recipient_name: "", line1: "", line2: "", city: "", region: "", postal_code: "", country: "US" };

export default function ShopCheckout() {
  const navigate = useNavigate();
  const { cart, refresh } = useStoreCart();
  const { customer } = useStoreCustomer();
  const [params] = useSearchParams();

  const [addresses, setAddresses] = useState(null);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [address, setAddress] = useState(emptyAddress);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [placedOrder, setPlacedOrder] = useState(null);

  const paidReturn = params.get("paid") === "1";
  const paidOrderNumber = params.get("order") || "";

  useEffect(() => {
    if (isStoreLoggedIn()) {
      storeApi.addresses().then((data) => {
        setAddresses(data.addresses || []);
        const preferred = (data.addresses || []).find((a) => a.is_default) || (data.addresses || [])[0];
        if (preferred) setSelectedAddressId(preferred.id);
      }).catch(() => setAddresses([]));
    }
  }, []);

  useEffect(() => {
    if (customer) {
      setEmail((current) => current || customer.email || "");
      setName((current) => current || customer.name || "");
    }
  }, [customer]);

  const selectSavedAddress = (id) => {
    setSelectedAddressId(id);
    const saved = (addresses || []).find((a) => a.id === id);
    if (saved) {
      setAddress({
        label: saved.label, recipient_name: saved.recipient_name, line1: saved.line1, line2: saved.line2,
        city: saved.city, region: saved.region, postal_code: saved.postal_code, country: saved.country,
      });
    } else {
      setAddress(emptyAddress);
    }
  };

  const subtotal = (cart || []).reduce((sum, item) => sum + item.price_cents * item.quantity, 0);

  const placeOrder = async (event) => {
    event.preventDefault();
    if (placing) return;
    setPlacing(true);
    try {
      const data = await storeApi.placeOrder({ email, name, address, notes });
      await refresh();
      notifyStoreSync();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      setPlacedOrder(data.order);
    } catch (error) {
      toast.error(error?.message || "Could not place the order");
    } finally {
      setPlacing(false);
    }
  };

  if (paidReturn) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <ShopHeader />
        <main className="max-w-xl mx-auto px-4 py-16 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600" />
          <h1 className="font-heading text-2xl mt-4">Payment received — thank you!</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {paidOrderNumber ? `Order ${paidOrderNumber} ` : "Your order "}is confirmed. You'll receive updates by email.
          </p>
          <button onClick={() => navigate("/shop")} className="mt-6 h-12 px-6 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold">
            Back to the shop
          </button>
        </main>
      </div>
    );
  }

  if (placedOrder) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <ShopHeader />
        <main className="max-w-xl mx-auto px-4 py-16 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600" />
          <h1 className="font-heading text-2xl mt-4">Order placed!</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Your order number is <span className="font-semibold text-foreground">{placedOrder.order_number}</span>.
            We've reserved your pieces and will confirm payment and shipping by email.
          </p>
          <div className="bg-card rounded-3xl border border-[hsl(var(--border))] p-5 mt-6 text-left space-y-1">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total</span><span className="font-heading">{formatStoreMoney(placedOrder.total_cents, placedOrder.currency)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Status</span><span className="font-semibold capitalize">{placedOrder.status}</span></div>
          </div>
          <div className="flex gap-3 mt-6 justify-center">
            <button onClick={() => navigate("/shop")} className="h-12 px-6 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold">
              Keep browsing
            </button>
            <button onClick={() => navigate("/shop/account")} className="h-12 px-6 rounded-2xl bg-muted text-foreground font-semibold">
              View my orders
            </button>
          </div>
        </main>
      </div>
    );
  }

  const cartEmpty = cart !== null && cart.length === 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ShopHeader />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pb-24 space-y-6">
        <h1 className="font-heading text-2xl pt-6">Checkout</h1>

        {cartEmpty && (
          <div className="bg-card rounded-3xl border border-[hsl(var(--border))] p-10 text-center">
            <p className="font-heading text-lg">Your cart is empty</p>
            <button onClick={() => navigate("/shop")} className="mt-4 h-12 px-6 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold">
              Browse artwork
            </button>
          </div>
        )}

        {cart && cart.length > 0 && (
          <form onSubmit={placeOrder} className="space-y-5">
            <section className="bg-card rounded-3xl border border-[hsl(var(--border))] p-5 space-y-4">
              <p className="font-heading text-lg">Contact</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="form-input mt-1" placeholder="you@example.com" required />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} className="form-input mt-1" placeholder="Full name" />
                </div>
              </div>
            </section>

            <section className="bg-card rounded-3xl border border-[hsl(var(--border))] p-5 space-y-4">
              <p className="font-heading text-lg">Shipping address</p>
              {addresses && addresses.length > 0 && (
                <div className="space-y-2">
                  {addresses.map((saved) => (
                    <label key={saved.id} className="flex items-center gap-3 p-3 rounded-2xl bg-muted cursor-pointer text-sm">
                      <input type="radio" name="saved-address" checked={selectedAddressId === saved.id} onChange={() => selectSavedAddress(saved.id)} />
                      <span className="flex-1">
                        <span className="font-semibold">{saved.recipient_name || saved.label}</span>
                        <span className="text-muted-foreground"> · {saved.line1}, {saved.city} {saved.postal_code}</span>
                      </span>
                    </label>
                  ))}
                  <label className="flex items-center gap-3 p-3 rounded-2xl bg-muted cursor-pointer text-sm">
                    <input type="radio" name="saved-address" checked={selectedAddressId === ""} onChange={() => selectSavedAddress("")} />
                    <span>Use a new address</span>
                  </label>
                </div>
              )}
              <AddressFields value={address} onChange={(value) => { setAddress(value); setSelectedAddressId(""); }} />
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Order notes (optional)</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="form-textarea mt-1" placeholder="Anything the artist should know" />
              </div>
            </section>

            <section className="bg-card rounded-3xl border border-[hsl(var(--border))] p-5 space-y-3">
              <p className="font-heading text-lg">Order summary</p>
              {cart.map((item) => (
                <div key={item.product_id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground truncate">{item.name} × {item.quantity}</span>
                  <span className="font-semibold">{formatStoreMoney(item.price_cents * item.quantity, item.currency)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-[hsl(var(--border))] pt-3">
                <span className="font-semibold">Total</span>
                <span className="font-heading text-foreground">{formatStoreMoney(subtotal)}</span>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" />
                Card payments activate automatically once Stripe is connected — until then your order is placed as pending and confirmed by the artist.
              </p>
            </section>

            <button type="submit" disabled={placing} className="w-full h-14 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold disabled:opacity-50">
              {placing ? "Placing order…" : "Place order"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
