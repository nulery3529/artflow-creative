import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Heart, Minus, Plus, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import ShopHeader from "@/components/store/ShopHeader";
import ProductCard from "@/components/store/ProductCard";
import { Image } from "@/components/ui/image";
import { storeApi, formatStoreMoney, useStoreCart, notifyStoreSync } from "@/lib/storeClient";

export default function ShopProduct() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { wishlist, refresh } = useStoreCart();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    storeApi.product(id).then(setData).catch((e) => setError(e?.message || "Could not load this piece"));
  }, [id]);

  if (error) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <ShopHeader />
        <main className="max-w-3xl mx-auto px-4 py-16 text-center">
          <p className="font-heading text-xl">{error}</p>
          <button onClick={() => navigate("/shop")} className="mt-4 h-12 px-6 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold">
            Back to the shop
          </button>
        </main>
      </div>
    );
  }

  const product = data?.product;
  if (!product) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <ShopHeader />
        <main className="max-w-3xl mx-auto px-4 py-10">
          <div className="aspect-square rounded-3xl bg-muted animate-pulse" />
        </main>
      </div>
    );
  }

  const images = Array.isArray(product.images) ? product.images : [];
  const soldOut = product.track_stock && (product.stock || 0) <= 0;
  const maxQty = product.track_stock ? Math.max(product.stock || 0, 0) : 99;
  const saved = wishlist.some((item) => item.product_id === product.id);

  const addToCart = async () => {
    if (adding || soldOut) return;
    setAdding(true);
    try {
      await storeApi.cartAction("add", { product_id: product.id, quantity });
      await refresh();
      notifyStoreSync();
      toast.success("Added to cart");
    } catch (e) {
      toast.error(e?.message || "Could not add to cart");
    } finally {
      setAdding(false);
    }
  };

  const toggleWishlist = async () => {
    try {
      await storeApi.cartAction(saved ? "wishlist_remove" : "wishlist_add", { product_id: product.id });
      await refresh();
      notifyStoreSync();
      toast.success(saved ? "Removed from wishlist" : "Saved to wishlist");
    } catch (e) {
      toast.error(e?.message || "Could not update wishlist");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ShopHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-24 space-y-8">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-semibold pt-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="aspect-square rounded-3xl overflow-hidden bg-muted border border-[hsl(var(--border))]">
            {images[0] ? (
              <Image src={images[0]} alt={product.name} className="w-full h-full" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground font-display text-6xl">
                {String(product.name).slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>

          <div className="space-y-5">
            {product.category_name && (
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{product.category_name}</p>
            )}
            <h1 className="font-display text-3xl">{product.name}</h1>
            <p className="font-heading text-2xl text-foreground">{formatStoreMoney(product.price_cents, product.currency)}</p>
            <p className={`text-sm font-semibold ${soldOut ? "text-rose-500" : "text-emerald-600"}`}>
              {soldOut ? "Sold out" : product.track_stock ? `In stock · ${product.stock} available` : "Available"}
            </p>

            {product.description && (
              <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{product.description}</p>
            )}

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 h-12 px-2 rounded-2xl bg-card border border-[hsl(var(--border))]">
                <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="w-9 h-9 flex items-center justify-center" aria-label="Decrease quantity">
                  <Minus className="w-4 h-4" />
                </button>
                <span className="font-semibold w-6 text-center">{quantity}</span>
                <button type="button" onClick={() => setQuantity((q) => Math.min(Math.max(maxQty, 1), q + 1))} className="w-9 h-9 flex items-center justify-center" aria-label="Increase quantity">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={toggleWishlist}
                className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${saved ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-transparent" : "bg-card border-[hsl(var(--border))]"}`}
                aria-label="Toggle wishlist"
              >
                <Heart className="w-5 h-5" fill={saved ? "currentColor" : "none"} />
              </button>
            </div>

            <button
              type="button"
              onClick={addToCart}
              disabled={soldOut || adding}
              className="w-full h-14 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <ShoppingBag className="w-5 h-5" />
              {adding ? "Adding…" : soldOut ? "Sold out" : "Add to cart"}
            </button>
          </div>
        </div>

        {data?.related?.length > 0 && (
          <section className="space-y-4">
            <h2 className="font-heading text-lg">You might also like</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {data.related.map((item) => (
                <ProductCard key={item.id} product={{ ...item, category_name: product.category_name }} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}