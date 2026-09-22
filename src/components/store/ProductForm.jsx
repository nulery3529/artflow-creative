import React, { useRef, useState } from "react";
import { Download, ImagePlus, Camera, Trash2, Loader2, Link2 } from "lucide-react";
import { centsToPriceInput, priceInputToCents } from "@/lib/storeClient";
import { downloadImage } from "@/lib/downloadImage";

const MAX_IMAGES = 8;
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

const fileToCompressedDataUrl = (file) =>
  new Promise((resolve, reject) => {
    if (!file?.type?.startsWith("image/")) {
      reject(new Error("Please choose an image."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that photo."));
    reader.onload = () => {
      const image = new window.Image();
      image.onerror = () => reject(new Error("Could not open that photo."));
      image.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
        const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
        const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      };
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });

// Seller-side product editor: create and update storefront products.
export default function ProductForm({ product, categories, onSave, onCancel }) {
  const [name, setName] = useState(product?.name || "");
  const [price, setPrice] = useState(centsToPriceInput(product?.price_cents));
  const [stock, setStock] = useState(String(product?.stock ?? 0));
  const [trackStock, setTrackStock] = useState(product?.track_stock !== false);
  const [status, setStatus] = useState(product?.status || "draft");
  const [categoryId, setCategoryId] = useState(product?.category_id || "");
  const [description, setDescription] = useState(product?.description || "");
  const [images, setImages] = useState(Array.isArray(product?.images) ? product.images.filter(Boolean).slice(0, MAX_IMAGES) : []);
  const [imageLink, setImageLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const cameraInputRef = useRef(null);
  const libraryInputRef = useRef(null);

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
        images,
      });
    } finally {
      setSaving(false);
    }
  };

  const addFiles = async (fileList) => {
    const available = Math.max(0, MAX_IMAGES - images.length);
    const selected = Array.from(fileList || []).slice(0, available);
    if (!selected.length) return;

    setProcessingPhoto(true);
    try {
      const next = [];
      for (const file of selected) {
        next.push(await fileToCompressedDataUrl(file));
      }
      setImages((current) => [...current, ...next].slice(0, MAX_IMAGES));
    } catch (error) {
      window.alert(error?.message || "Could not add that photo.");
    } finally {
      setProcessingPhoto(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (libraryInputRef.current) libraryInputRef.current.value = "";
    }
  };

  const addImageLink = () => {
    const url = imageLink.trim();
    if (!/^https?:\/\//i.test(url)) return;
    if (images.length >= MAX_IMAGES) return;
    setImages((current) => [...current, url].slice(0, MAX_IMAGES));
    setImageLink("");
  };

  const removeImage = (index) => {
    if (!window.confirm("Delete this product photo?")) return;
    setImages((current) => current.filter((_, i) => i !== index));
  };

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
            <option value="active">Available</option>
            <option value="sold">Sold</option>
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

      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Product photos</label>
          <p className="text-[11px] text-muted-foreground mt-1">Take a new photo or choose one already on your device. Up to {MAX_IMAGES} photos.</p>
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => addFiles(event.target.files)}
        />
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => addFiles(event.target.files)}
        />

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={processingPhoto || images.length >= MAX_IMAGES}
            className="h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {processingPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            Take Photo
          </button>
          <button
            type="button"
            onClick={() => libraryInputRef.current?.click()}
            disabled={processingPhoto || images.length >= MAX_IMAGES}
            className="h-12 rounded-2xl bg-muted text-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <ImagePlus className="w-4 h-4" />
            Choose Photo
          </button>
        </div>

        <div className="flex gap-2">
          <input
            value={imageLink}
            onChange={(event) => setImageLink(event.target.value)}
            placeholder="Or paste an image link"
            className="form-input flex-1"
          />
          <button
            type="button"
            onClick={addImageLink}
            disabled={!/^https?:\/\//i.test(imageLink.trim()) || images.length >= MAX_IMAGES}
            className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center disabled:opacity-50"
            aria-label="Add image link"
          >
            <Link2 className="w-4 h-4" />
          </button>
        </div>

        {images.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {images.map((url, index) => (
              <div key={`${index}-${String(url).slice(0, 30)}`} className="rounded-2xl border border-[hsl(var(--border))] bg-muted overflow-hidden">
                <div className="aspect-square overflow-hidden">
                  <img src={url} alt={`Product ${index + 1}`} className="w-full h-full object-cover" />
                </div>
                <div className="grid grid-cols-2 gap-1 p-1.5">
                  <button
                    type="button"
                    onClick={() => downloadImage(url, `${name || "product"}-${index + 1}`)}
                    className="h-9 rounded-xl bg-card flex items-center justify-center"
                    aria-label={`Download product photo ${index + 1}`}
                    title="Download photo"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"
                    aria-label={`Delete product photo ${index + 1}`}
                    title="Delete photo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={saving || processingPhoto} className="flex-1 h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold disabled:opacity-50">
          {saving ? "Saving…" : product?.id ? "Save changes" : "Create product"}
        </button>
        <button type="button" onClick={onCancel} className="h-12 px-5 rounded-2xl bg-muted text-foreground font-semibold">
          Cancel
        </button>
      </div>
    </form>
  );
}
