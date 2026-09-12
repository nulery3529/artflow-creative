import React from "react";
import { useNavigate } from "react-router-dom";
import { Image } from "@/components/ui/image";
import { formatStoreMoney } from "@/lib/storeClient";

export default function ProductCard({ product }) {
  const navigate = useNavigate();
  const images = Array.isArray(product.images) ? product.images : [];
  const image = images[0] || "";
  const soldOut = product.track_stock && (product.stock || 0) <= 0;

  return (
    <button
      type="button"
      onClick={() => navigate(`/shop/product/${product.id}`)}
      className="text-left bg-card rounded-3xl border border-[hsl(var(--border))] overflow-hidden transition hover:border-[hsl(var(--primary))]"
    >
      <div className="aspect-square relative bg-muted">
        {image ? (
          <Image src={image} alt={product.name} className="w-full h-full" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <span className="font-display text-4xl">{String(product.name || "").slice(0, 1).toUpperCase()}</span>
          </div>
        )}
        {soldOut && (
          <span className="absolute top-3 right-3 px-2 py-1 rounded-full bg-background/90 text-[10px] font-semibold">
            Sold out
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="font-semibold truncate">{product.name}</p>
        {product.category_name && <p className="text-xs text-muted-foreground truncate">{product.category_name}</p>}
        <p className="mt-1 font-heading text-foreground">{formatStoreMoney(product.price_cents, product.currency)}</p>
      </div>
    </button>
  );
}