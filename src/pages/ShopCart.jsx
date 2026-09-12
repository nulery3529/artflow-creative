import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { Minus, Plus, ShoppingBag, Trash2, Heart } from "lucide-react";
import { toast } from "sonner";
import ShopHeader from "@/components/store/ShopHeader";
import { Image } from "@/components/ui/image";
import { storeApi, formatStoreMoney, useStoreCart, notifyStoreSync } from "@/lib/storeClient";

export default function ShopCart() {
  const navigate = useNavigate();
  const { cart, wishlist, cartCount, refresh } = useStoreCart();

  const setQuantity = async (product, quantity) => {
    try {
      await storeApi.cartAction("update", { product_id: product.product_id, quantity });
      await refresh();
      notifyStoreSync();
    } catch (e) {
      toast.error(e?.message || "Could not update the cart");
    }
  };

  const remove = async (product) => {
    try {
      await storeApi.cartAction("remove", { product_id: product.product_id });
      await refresh();
      notifyStoreSync();
    } catch (e) {
      toast.error(e?.message || "Could not remove the item");
    }
  };

  const moveWishlistToCart = async (product) => {
    try {
      await storeApi.cartAction("add", { product_id: product.product_id, quantity: 1 });
      await storeApi.cartAction("wishlist_remove", { product_id: product.product_id });
      await refresh();
      notifyStoreSync();
      toast.success("Moved to cart");
    } catch (e) {
      toast.error(e?.message || "Could not move the item");
    }
  };

  const removeWishlist = async (product) => {
    try {
      await storeApi.cartAction("wishlist_remove", { product_id: product.product_id });
      await refresh();
      notifyStoreSync();
    } catch (e) {
      toast.error(e?.message || "Could not update the wishlist");
    }
  };

  const subtotal = (cart || []).reduce((sum, item) => sum + item.price_cents * item.quantity, 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ShopHeader />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pb-24 space-y-6">
        <h1 className="font-heading text-2xl pt-6">Your cart</h1>

        {cart === null ? (
          <div className="h-24 rounded-3xl bg-muted animate-pulse" />
        ) : cart.length === 0 ? (
          <div className="bg-card rounded-3xl border border-[hsl(var(--border))] p-10 text-center space-y-2">
            <ShoppingBag className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="font-heading text-lg">Your cart is empty</p>
            <p className="text-sm text-muted-foreground">Find something you love in the shop.</p>
            <Link to="/shop" className="inline-block mt-3 h-12 px-6 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold items-center flex justify-center">
              Browse artwork
            </Link>
          </div>
        ) : (
          <>
            <div className="bg-card rounded-3xl border border-[hsl(var(--border))] divide-y divide-[hsl(var(--border))]">
              {cart.map((item) => {
                const image = Array.isArray(item.images) ? item.images[0] : "";
                return (
                  <div key={item.product_id} className="p-4 flex gap-4">
                    <Link to={`/shop/product/${item.product_id}`} className="w-20 h-20 rounded-2xl overflow-hidden bg-muted shrink-0">
                      {image ? <Image src={image} alt={item.name} className="w-full h-full" /> : <div className="w-full h-full" />}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{item.name}</p>
                      <p className="text-sm text-muted-foreground">{formatStoreMoney(item.price_cents, item.currency)}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex items-center h-10 rounded-xl bg-muted">
                          <button type="button" onClick={() => setQuantity(item, Math.max(0, item.quantity - 1))} className="w-10 h-10 flex items-center justify-center" aria-label="Decrease">
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-8 text-center font-semibold">{item.quantity}</span>
                          <button type="button" onClick={() => setQuantity(item, item.quantity + 1)} className="w-10 h-10 flex items-center justify-center" aria-label="Increase">
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        <button type="button" onClick={() => remove(item)} className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground" aria-label="Remove">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="font-heading text-foreground whitespace-nowrap">{formatStoreMoney(item.price_cents * item.quantity, item.currency)}</p>
                  </div>
                );
              })}
            </div>

            <div className="bg-card rounded-3xl border border-[hsl(var(--border))] p-5 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold">{formatStoreMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Shipping</span>
                <span className="text-muted-foreground">Calculated at checkout</span>
              </div>
              <button
                type="button"
                onClick={() => navigate("/shop/checkout")}
                className="w-full h-14 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold"
              >
                Checkout
              </button>
              <p className="text-xs text-muted-foreground text-center">{cartCount} item{cartCount === 1 ? "" : "s"} in your cart</p>
            </div>
          </>
        )}

        {wishlist.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-heading text-lg flex items-center gap-2"><Heart className="w-4 h-4" /> Saved for later</h2>
            <div className="bg-card rounded-3xl border border-[hsl(var(--border))] divide-y divide-[hsl(var(--border))]">
              {wishlist.map((item) => {
                const image = Array.isArray(item.images) ? item.images[0] : "";
                return (
                  <div key={item.product_id} className="p-4 flex items-center gap-3">
                    <Link to={`/shop/product/${item.product_id}`} className="w-14 h-14 rounded-2xl overflow-hidden bg-muted shrink-0">
                      {image ? <Image src={image} alt={item.name} className="w-full h-full" /> : <div className="w-full h-full" />}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{item.name}</p>
                      <p className="text-sm text-muted-foreground">{formatStoreMoney(item.price_cents, item.currency)}</p>
                    </div>
                    <button type="button" onClick={() => moveWishlistToCart(item)} className="h-10 px-3 rounded-xl bg-muted text-sm font-semibold">
                      Add to cart
                    </button>
                    <button type="button" onClick={() => removeWishlist(item)} className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground" aria-label="Remove from wishlist">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}