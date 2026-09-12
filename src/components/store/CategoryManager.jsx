import React, { useState } from "react";
import { X, Plus } from "lucide-react";

// Seller-side category management chips.
export default function CategoryManager({ categories, onSave, onDelete }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async (event) => {
    event.preventDefault();
    const value = name.trim();
    if (!value || saving) return;
    setSaving(true);
    try {
      await onSave({ name: value });
      setName("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))] space-y-3">
      <p className="font-heading text-lg">Categories</p>
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <span key={category.id} className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full bg-muted text-sm">
              {category.name}
              <span className="text-xs text-muted-foreground">{category.product_count}</span>
              <button
                type="button"
                onClick={() => onDelete(category)}
                className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-background"
                aria-label={`Delete ${category.name}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <form onSubmit={add} className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} className="form-input h-12" placeholder="New category name" />
        <button type="submit" disabled={saving || !name.trim()} className="h-12 px-4 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold disabled:opacity-50 flex items-center gap-1">
          <Plus className="w-4 h-4" /> Add
        </button>
      </form>
    </div>
  );
}