import React from "react";
import { Link } from "react-router-dom";
import { Heart, ShoppingBag, UserRound } from "lucide-react";
import Logo from "@/components/Logo";
import { useStoreCart } from "@/lib/storeClient";

export default function ShopHeader() {
  const { cartCount } = useStoreCart();

  return (
    <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-xl border-b border-[hsl(var(--border))]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
        <Link to="/shop" className="flex items-center gap-3 min-w-0">
          <Logo size={34} />
          <div className="min-w-0">
            <p className="font-heading text-sm leading-tight">Art Flow Creative</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Shop</p>
          </div>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/shop/account"
            className="w-11 h-11 rounded-2xl bg-card border border-[hsl(var(--border))] flex items-center justify-center"
            aria-label="Wishlist and account"
          >
            <Heart className="w-5 h-5" />
          </Link>
          <Link
            to="/shop/account"
            className="hidden sm:flex w-11 h-11 rounded-2xl bg-card border border-[hsl(var(--border))] items-center justify-center"
            aria-label="Account"
          >
            <UserRound className="w-5 h-5" />
          </Link>
          <Link
            to="/shop/cart"
            className="relative w-11 h-11 rounded-2xl bg-card border border-[hsl(var(--border))] flex items-center justify-center"
            aria-label="Cart"
          >
            <ShoppingBag className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-[10px] flex items-center justify-center px-1">
                {cartCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}