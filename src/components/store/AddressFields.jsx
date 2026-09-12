import React from "react";

const FIELDS = [
  { key: "recipient_name", label: "Recipient name", placeholder: "Full name" },
  { key: "line1", label: "Street address", placeholder: "Street and number" },
  { key: "line2", label: "Apartment / unit", placeholder: "Optional" },
  { key: "city", label: "City", placeholder: "City" },
  { key: "region", label: "State / province", placeholder: "Optional" },
  { key: "postal_code", label: "Postal code", placeholder: "Optional" },
  { key: "country", label: "Country", placeholder: "Country" },
];

// Shared shipping-address fields for checkout and the buyer account page.
export default function AddressFields({ value = {}, onChange }) {
  const set = (key, text) => onChange({ ...value, [key]: text });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {FIELDS.map(({ key, label, placeholder }) => (
        <div key={key} className={key === "line1" ? "sm:col-span-2" : ""}>
          <label className="text-xs font-semibold text-muted-foreground">{label}</label>
          <input
            value={value[key] || ""}
            onChange={(e) => set(key, e.target.value)}
            placeholder={placeholder}
            className="form-input mt-1"
          />
        </div>
      ))}
    </div>
  );
}