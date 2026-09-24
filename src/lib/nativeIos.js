function nativeShareHandler() {
  if (typeof window === "undefined") return null;
  return window.webkit?.messageHandlers?.artflowNative || null;
}

function utf8Base64(text = "") {
  const bytes = new TextEncoder().encode(String(text));
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function canUseNativeShare() {
  const handler = nativeShareHandler();
  return Boolean(handler?.postMessage);
}

export function shareNativeTextFile(filename, content, mimeType = "text/plain") {
  const handler = nativeShareHandler();
  if (!handler?.postMessage) return false;

  try {
    handler.postMessage({
      action: "shareFile",
      filename: String(filename || "artflow-export.txt"),
      mimeType: String(mimeType || "text/plain"),
      base64Data: utf8Base64(content),
    });
    return true;
  } catch {
    return false;
  }
}
