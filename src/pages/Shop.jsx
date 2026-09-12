import React, { useEffect, useMemo, useState } from "react";
import ShopHeader from "@/components/store/ShopHeader";
import ProductCard from "@/components/store/ProductCard";
import { storeApi } from "@/lib/storeClient";

export default function Shop() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("");

  useEffect(() => {
    storeApi.catalog().then(setData).catch((e) => setError(e?.message || "Could not load the shop"));
  }, []);

  const products = useMemo(
    () => (data?.products || []).filter((product) => !category || product.category_id === category),
    [data, category]
  );
  const categories = (data?.categories || []).filter((c) => c.product_count > 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ShopHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-24 space-y-6">
        <section className="pt-8 pb-2 text-center">
          <h1 className="font-display text-3xl sm:text-4xl artflow-gradient-text">Original art, straight from the studio</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-2 max-w-xl mx-auto">
            One-of-a-kind pieces, prints, and creative work — shipped with care.
          </p>
        </section>

        {error && <p className="text-sm text-center text-muted-foreground">{error}</p>}

        {!data ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-3xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {categories.length > 1 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
                <button
                  type="button"
                  onClick={() => setCategory("")}
                  className={`h-10 px-4 rounded-full text-sm font-semibold whitespace-nowrap border ${
                    !category ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-transparent" : "bg-card border-[hsl(var(--border))]"
                  }`}
                >
                  All
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={`h-10 px-4 rounded-full text-sm font-semibold whitespace-nowrap border ${
                      category === c.id ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-transparent" : "bg-card border-[hsl(var(--border))]"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            {products.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <div className="bg-card rounded-3xl border border-[hsl(var(--border))] p-10 text-center">
                <p className="font-heading text-lg">No artwork for sale yet</p>
                <p className="text-sm text-muted-foreground mt-1">Check back soon — new pieces are added regularly.</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}