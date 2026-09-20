const safeName = (value = "artwork") =>
  String(value || "artwork")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "artwork";

const extensionFromType = (type = "") => {
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  if (type.includes("svg")) return "svg";
  return "jpg";
};

export async function downloadImage(imageUrl, name = "artwork") {
  if (!imageUrl) return false;

  try {
    const response = await fetch(imageUrl, { credentials: "omit" });
    if (!response.ok) throw new Error(`Image download ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${safeName(name)}.${extensionFromType(blob.type)}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    return true;
  } catch {
    // Some marketplace CDNs block cross-origin downloads. Opening the original
    // image still gives the user a full-size copy they can save on the device.
    window.open(imageUrl, "_blank", "noopener,noreferrer");
    return false;
  }
}
