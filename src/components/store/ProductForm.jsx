import React, { useRef, useState } from "react";
import { Check, Clipboard, Download, ImagePlus, Camera, Trash2, Loader2, Link2, Save } from "lucide-react";
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
  const [hashtags, setHashtags] = useState(product?.hashtags || "");
  const [copiedField, setCopiedField] = useState("");
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
        hashtags: hashtags.trim(),
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

  const copyText = async (field, value) => {
    const text = String(value || "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField((current) => current === field ? "" : current), 1400);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      setCopiedField(field);
      window.setTimeout(() => setCopiedField((current) => current === field ? "" : current), 1400);
    }
  };

  const copyAllListingText = () => {
    const parts = [
      name.trim(),
      description.trim(),
      hashtags.trim(),
    ].filter(Boolean);
    copyText("all", parts.join("\n\n"));
  };

  const saveAllImages = async () => {
    for (let index = 0; index < images.length; index += 1) {
      await downloadImage(images[index], `${name || "product"}-${index + 1}`);
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    }
  };

  return (
    <form onSubmit={submit} className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))] space-y-4">
      <p className="font-heading text-lg">{product?.id ? "Edit product" : "New product"}</p>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold text-muted-foreground">Title</label>
          <button
            type="button"
            onClick={() => copyText("title", name)}
            disabled={!name.trim()}
            className="h-8 px-3 rounded-xl bg-muted text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
          >
            {copiedField === "title" ? <Check className="w-3.5 h-3.5" /> : <Clipboard className="w-3.5 h-3.5" />}
            {copiedField === "title" ? "Copied" : "Copy Title"}
          </button>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} className="form-input" placeholder="Sunset Over the Bay" required />
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

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold text-muted-foreground">Description</label>
          <button
            type="button"
            onClick={() => copyText("description", description)}
            disabled={!description.trim()}
            className="h-8 px-3 rounded-xl bg-muted text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
          >
            {copiedField === "description" ? <Check className="w-3.5 h-3.5" /> : <Clipboard className="w-3.5 h-3.5" />}
            {copiedField === "description" ? "Copied" : "Copy Description"}
          </button>
        </div>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="form-textarea" placeholder="Materials, size, condition, details…" />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold text-muted-foreground">Hashtags</label>
          <button
            type="button"
            onClick={() => copyText("hashtags", hashtags)}
            disabled={!hashtags.trim()}
            className="h-8 px-3 rounded-xl bg-muted text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
          >
            {copiedField === "hashtags" ? <Check className="w-3.5 h-3.5" /> : <Clipboard className="w-3.5 h-3.5" />}
            {copiedField === "hashtags" ? "Copied" : "Copy Hashtags"}
          </button>
        </div>
        <textarea
          value={hashtags}
          onChange={(e) => setHashtags(e.target.value)}
          rows={2}
          className="form-textarea"
          placeholder="#artprint #wallart #homedecor"
        />
      </div>

      <button
        type="button"
        onClick={copyAllListingText}
        disabled={!name.trim() && !description.trim() && !hashtags.trim()}
        className="w-full h-11 rounded-2xl bg-muted text-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {copiedField === "all" ? <Check className="w-4 h-4" /> : <Clipboard className="w-4 h-4" />}
        {copiedField === "all" ? "Listing Text Copied" : "Copy All Listing Text"}
      </button>

      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Product photos</label>
            <p className="text-[11px] text-muted-foreground mt-1">Take a new photo or choose one already on your device. Up to {MAX_IMAGES} photos.</p>
          </div>
          {images.length > 0 && (
            <button
              type="button"
              onClick={saveAllImages}
              className="h-9 px-3 rounded-xl bg-muted text-xs font-semibold flex items-center gap-1.5 shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              Save All Images
            </button>
          )}
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
                    className="h-9 rounded-xl bg-card text-[11px] font-semibold flex items-center justify-center gap-1"
                    aria-label={`Save product photo ${index + 1}`}
                    title="Save image"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="h-9 rounded-xl bg-rose-50 text-rose-600 text-[11px] font-semibold flex items-center justify-center gap-1"
                    aria-label={`Delete product photo ${index + 1}`}
                    title="Delete photo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
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
