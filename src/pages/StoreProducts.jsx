import React, { useEffect, useState } from "react";
import { CheckCircle2, Clock3, Download, History, PackagePlus, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import ProductForm from "@/components/store/ProductForm";
import CategoryManager from "@/components/store/CategoryManager";
import { storeAdmin, formatStoreMoney } from "@/lib/storeClient";
import { downloadImage } from "@/lib/downloadImage";

const statusStyles = {
  draft: "bg-muted text-foreground",
  active: "bg-emerald-100 text-emerald-900",
  archived: "bg-rose-100 text-rose-900",
  sold: "bg-slate-200 text-slate-800",
};

export default function StoreProducts() {
  const [products, setProducts] = useState(null);
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null); // null | "new" | product
  const [view, setView] = useState("available");
  const [changingStatusId, setChangingStatusId] = useState(null);

  const load = async () => {
    try {
      const [productData, categoryData] = await Promise.all([storeAdmin.products(), storeAdmin.categories()]);
      setProducts(productData.products);
      setCategories(categoryData.categories);
    } catch (error) {
      toast.error("Could not load products", { description: error?.message });
      setProducts([]);
    }
  };

  useEffect(() => { load(); }, []);

  const saveProduct = async (payload) => {
    try {
      await storeAdmin.productSave(payload);
      toast.success(payload.id ? "Product updated" : "Product created");
      setEditing(null);
      await load();
    } catch (error) {
      toast.error("Could not save the product", { description: error?.message });
    }
  };

  const deleteProduct = async (product) => {
    if (!window.confirm(`Delete "${product.name}"? This can't be undone.`)) return;
    try {
      await storeAdmin.productDelete(product.id);
      toast.success("Product deleted");
      await load();
    } catch (error) {
      toast.error("Could not delete the product", { description: error?.message });
    }
  };

  const setProductStatus = async (product, status) => {
    setChangingStatusId(product.id);
    try {
      await storeAdmin.productStatus(product.id, status);
      toast.success(status === "sold" ? "Moved to Sold History" : "Moved to Available");
      await load();
    } catch (error) {
      toast.error("Could not update product status", { description: error?.message });
    } finally {
      setChangingStatusId(null);
    }
  };


  const saveCategory = async (payload) => {
    try {
      await storeAdmin.categorySave(payload);
      await load();
    } catch (error) {
      toast.error("Could not save the category", { description: error?.message });
    }
  };

  const deleteCategory = async (category) => {
    if (!window.confirm(`Delete category "${category.name}"? Products keep existing without a category.`)) return;
    try {
      await storeAdmin.categoryDelete(category.id);
      await load();
    } catch (error) {
      toast.error("Could not delete the category", { description: error?.message });
    }
  };

  const availableProducts = (products || []).filter((product) => product.status !== "sold");
  const soldProducts = (products || []).filter((product) => product.status === "sold");
  const soldTodayProducts = soldProducts.filter((product) => {
    if (!product.sold_at) return false;
    const sold = new Date(product.sold_at);
    const today = new Date();
    return !Number.isNaN(sold.getTime()) && sold.toDateString() === today.toDateString();
  });
  const visibleProducts =
    view === "sold-today"
      ? soldTodayProducts
      : view === "sold"
        ? soldProducts
        : availableProducts;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl">Products</h1>
          <p className="text-sm text-muted-foreground">Manage what appears in your storefront</p>
        </div>
        <a
          href="/shop"
          className="hidden sm:block h-11 px-4 rounded-2xl bg-muted text-foreground text-sm font-semibold items-center"
        >
          View storefront
        </a>
      </div>

      <CategoryManager categories={categories} onSave={saveCategory} onDelete={deleteCategory} />

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setView("available")}
          className={`min-h-12 rounded-2xl border px-2 py-2 font-semibold flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm ${
            view === "available"
              ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-transparent"
              : "bg-card text-foreground border-[hsl(var(--border))]"
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          Available ({availableProducts.length})
        </button>
        <button
          type="button"
          onClick={() => setView("sold-today")}
          className={`min-h-12 rounded-2xl border px-2 py-2 font-semibold flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm ${
            view === "sold-today"
              ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-transparent"
              : "bg-card text-foreground border-[hsl(var(--border))]"
          }`}
        >
          <Clock3 className="w-4 h-4" />
          Sold Today ({soldTodayProducts.length})
        </button>
        <button
          type="button"
          onClick={() => setView("sold")}
          className={`min-h-12 rounded-2xl border px-2 py-2 font-semibold flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm ${
            view === "sold"
              ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-transparent"
              : "bg-card text-foreground border-[hsl(var(--border))]"
          }`}
        >
          <History className="w-4 h-4" />
          Sold History ({soldProducts.length})
        </button>
      </div>

      {editing !== null && (
        <ProductForm
          product={editing === "new" ? null : editing}
          categories={categories}
          onSave={saveProduct}
          onCancel={() => setEditing(null)}
        />
      )}

      {editing === null && (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="w-full h-14 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2"
        >
          <PackagePlus className="w-5 h-5" /> New product
        </button>
      )}

      {products === null ? (
        <div className="h-24 rounded-3xl bg-muted animate-pulse" />
      ) : visibleProducts.length === 0 ? (
        <div className="bg-card rounded-3xl border border-[hsl(var(--border))] p-10 text-center">
          <p className="font-heading text-lg">
            {view === "sold-today" ? "Nothing sold today yet" : view === "sold" ? "No sold products yet" : "No available products yet"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {view === "sold-today"
              ? "Products marked Sold today will appear here automatically."
              : view === "sold"
                ? "Products you mark Sold will appear here."
                : "Create a product or move one back from Sold History."}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-3xl border border-[hsl(var(--border))] divide-y divide-[hsl(var(--border))]">
          {visibleProducts.map((product) => (
            <div key={product.id} className="p-4 flex items-center gap-3">
              {Array.isArray(product.images) && product.images[0] ? (
                <div className="w-14 h-14 rounded-2xl overflow-hidden bg-muted shrink-0">
                  <img
                    src={product.images[0]}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : null}
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{product.name}</p>
                <p className="text-xs text-muted-foreground">
                  {product.category_name || "No category"} · {product.track_stock ? `${product.stock} in stock` : "stock off"}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${statusStyles[product.status] || "bg-muted"}`}>
                    {product.status}
                  </span>
                  <p className="font-heading text-sm text-foreground">
                    {formatStoreMoney(product.price_cents, product.currency)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setProductStatus(product, product.status === "sold" ? "active" : "sold")}
                  disabled={changingStatusId === product.id}
                  className={`h-10 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                    product.status === "sold"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-100 text-slate-700"
                  }`}
                  aria-label={product.status === "sold" ? `Mark ${product.name} available` : `Mark ${product.name} sold`}
                  title={product.status === "sold" ? "Move back to Available" : "Move to Sold History"}
                >
                  {product.status === "sold" ? <RotateCcw className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  {product.status === "sold" ? "Available" : "Sold"}
                </button>
                {Array.isArray(product.images) && product.images[0] ? (
                  <button
                    type="button"
                    onClick={() => downloadImage(product.images[0], product.name)}
                    className="w-10 h-10 rounded-xl bg-muted text-[hsl(var(--primary))] flex items-center justify-center"
                    aria-label={`Download image for ${product.name}`}
                    title="Download product image"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                ) : null}
                <button type="button" onClick={() => setEditing(product)} className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center" aria-label={`Edit ${product.name}`}>
                  <Pencil className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => deleteProduct(product)} className="w-10 h-10 rounded-xl bg-muted text-rose-500 flex items-center justify-center" aria-label={`Delete ${product.name}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
