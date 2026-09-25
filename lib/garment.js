// Garment prompts and reference-image preparation for Lucy VTON.

/** Prompt for a catalogue garment, optionally recoloured to one of its colourways. */
export function catalogPrompt(garment, colourway) {
  const colour = colourway && colourway !== garment.colourways?.[0]?.name ? `, recoloured to ${colourway.toLowerCase()}` : "";
  return `Substitute the current outfit with the complete outfit shown in the reference image: ${garment.fabric.toLowerCase()}${colour}.`;
}

/** Prompt for a photo the customer uploaded themselves. */
export function uploadPrompt(name) {
  const named = name && name.length <= 48 ? `, including the ${name.toLowerCase()}` : "";
  return `Substitute the current outfit with the complete outfit shown in the reference image${named}.`;
}

/** "Blue_linen-shirt (2).jpg" → "Blue linen shirt" */
export function nameFromFile(file) {
  return (file?.name || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\(\d+\)/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Letterboxes any garment image onto a clean white 768px square JPEG
 *  (Decart recommends ≥512px on a plain background). Accepts a Blob or a same-origin URL. */
export async function normalizeImage(source) {
  if (typeof source !== "string" && (!ACCEPTED.has(source.type) || source.size > 8 * 1024 * 1024)) {
    throw new Error("Use a JPG, PNG or WebP image under 8 MB");
  }
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const size = 768;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight) * 0.94;
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, (size - w) / 2, (size - h) / 2, w, h);
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not prepare image"))), "image/jpeg", 0.92),
    );
    return { blob, preview: canvas.toDataURL("image/jpeg", 0.7) };
  } finally {
    if (typeof source !== "string") URL.revokeObjectURL(url);
  }
}
