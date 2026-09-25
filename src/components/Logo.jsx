import React from "react";

const LOGO_URL = "/artflow-icon.svg";

export default function Logo({ size = 36, className = "" }) {
  return (
    <img
      src={LOGO_URL}
      alt="Art Flow Creative"
      draggable={false}
      width={size}
      height={size}
      className={`shrink-0 rounded-[23%] object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
