import React from "react";

// Brand mark is served by Art Flow itself so the app has no external logo
// dependency and continues to work as an installed PWA when offline.
const LOGO_URL = "/artflow-icon.svg";

export default function Logo({ size = 36, className = "" }) {
  return (
    <div
      style={{ width: size, height: size, backgroundColor: "#ffffff" }}
      className={`rounded-[30%] overflow-hidden shrink-0 flex items-center justify-center ${className}`}
    >
      <img
        src={LOGO_URL}
        alt="Art Flow Creative"
        draggable={false}
        style={{ width: "86%", height: "86%", objectFit: "contain" }}
      />
    </div>
  );
}
