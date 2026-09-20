import React, { useState } from "react";
import { Image } from "@/components/ui/image";
import { centsToPriceInput, priceInputToCents } from "@/lib/storeClient";
import { Download } from "lucide-react";
import { downloadImage } from "@/lib/downloadImage";

// Seller-side product editor: create and update storefront products.
export default function ProductForm({ product, categories, onSave, onCancel }) {
  const [name, setName] = useState(product?.name || "");
  const [price, setPrice] = useState(centsToPriceInput(product?.price_cents));
  const [stock, setStock] = useState(String(product?.stock ?? 0));
  const [trackStock, setTrackStock] = useState(product?.track_stock !== false);
  const [status, setStatus] = useState(product?.status || "draft");
  const [categoryId, setCategoryId] = useState(product?.category_id || "");
  const [description, setDescription] = useState(product?.description || "");
  const [imagesText, setImagesText] = useState((Array.isArray(product?.images) ? product.images : []).join("\n"));
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        id: product?.id,
        name: name.trim(),
        price_cents: priceInputToCents(price),
        stock: Math.max(0, Math.round(Number(stock) || 0)),
        track_stock: trackStock,
        status,
        category_id: categoryId || null,
        description: description.trim(),
        images: imagesText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
      });
    } finally {
      setSaving(false);
    }
  };

  const previewImages = imagesText.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^https?:\/\//i.test(line)).slice(0, 8);

  return (
    <form onSubmit={submit} className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))] space-y-4">
      <p className="font-heading text-lg">{product?.id ? "Edit product" : "New product"}</p>

      <div>
        <label className="text-xs font-semibold text-muted-foreground">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="form-input mt-1" placeholder="Sunset Over the Bay" required />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Price (USD)</label>
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="form-input mt-1" placeholder="49.00" />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Stock</label>
          <input inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} className="form-input mt-1" />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="form-input mt-1">
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Category</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="form-input mt-1">
            <option value="">None</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={trackStock} onChange={(e) => setTrackStock(e.target.checked)} className="w-4 h-4" />
        Track stock (blocks buying when it reaches zero)
      </label>

      <div>
        <label className="text-xs font-semibold text-muted-foreground">Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="form-textarea mt-1" placeholder="Materials, size, story behind the piece…" />
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground">Image links (one per line)</label>
        <textarea value={imagesText} onChange={(e) => setImagesText(e.target.value)} rows={3} className="form-textarea mt-1" placeholder="https://…" />
        {previewImages.length > 0 && (
          <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar">
            {previewImages.map((url, index) => (
              <div key={url} className="relative w-20 h-20 rounded-2xl overflow-hidden bg-muted shrink-0 group">
                <Image src={url} alt="Preview" className="w-full h-full" />
                <button
                  type="button"
                  onClick={() => downloadImage(url, `${name || "artwork"}-${index + 1}`)}
                  className="absolute inset-0 bg-black/55 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex items-center justify-center"
                  aria-label={`Download preview ${index + 1}`}
                >
                  <Download className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="flex-1 h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold disabled:opacity-50">
          {saving ? "Saving…" : product?.id ? "Save changes" : "Create product"}
        </button>
        <button type="button" onClick={onCancel} className="h-12 px-5 rounded-2xl bg-muted text-foreground font-semibold">
          Cancel
        </button>
      </div>
    </form>
  );
}
