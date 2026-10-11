// Shrinks a photo in the browser before it's uploaded: phone photos are
// often 3-8 MB, over what a server action accepts (next.config.ts) and far
// more than a license photo or screenshot needs. Longest side capped, saved
// as JPEG. Anything the browser can't decode (e.g. HEIC outside Safari), or
// that doesn't get smaller, is left as is.
// CLIENT-ONLY.

export async function shrinkImage(
  file: File,
  { maxSide = 2000, quality = 0.85, minBytes = 1_000_000 }: { maxSide?: number; quality?: number; minBytes?: number } = {}
): Promise<File> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || file.size < minBytes) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // JPEG has no transparency: a white background for PNG screenshots.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

// What a form upload may weigh (next.config.ts bodySizeLimit is 4mb, and
// the rest of the form rides along).
export const MAX_FORM_UPLOAD_BYTES = 3.8 * 1024 * 1024;

// Flags a file that's still too big on the input itself, so the browser
// blocks the submit with a clear message instead of a failed upload.
function checkSize(input: HTMLInputElement, files: File[]) {
  const tooBig = files.find((f) => f.size > MAX_FORM_UPLOAD_BYTES);
  input.setCustomValidity(tooBig ? `"${tooBig.name}" is too large. Please keep it under 4MB.` : "");
  if (tooBig) input.reportValidity();
}

// onChange for an <input type="file"> inside a form that submits FormData:
// swaps the picked photos for shrunk copies in place, so the form sends
// those instead.
export function shrinkOnPick(options?: Parameters<typeof shrinkImage>[1]) {
  return async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const picked = Array.from(input.files ?? []);
    if (picked.length === 0 || typeof DataTransfer === "undefined") return checkSize(input, picked);
    const shrunk = await Promise.all(picked.map((f) => shrinkImage(f, options)));
    if (!shrunk.every((f, i) => f === picked[i])) {
      const dt = new DataTransfer();
      shrunk.forEach((f) => dt.items.add(f));
      input.files = dt.files;
    }
    checkSize(input, shrunk);
  };
}

// onChange for a file input that isn't a photo (e.g. a spreadsheet).
export function limitFileSize(e: React.ChangeEvent<HTMLInputElement>) {
  checkSize(e.currentTarget, Array.from(e.currentTarget.files ?? []));
}
