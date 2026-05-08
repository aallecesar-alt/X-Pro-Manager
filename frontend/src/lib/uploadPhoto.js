import api from "./api";

/**
 * Upload a profile/team photo to Cloudinary using a signed signature
 * from our backend, then return the secure URL + public_id.
 */
export async function uploadProfilePhoto(file) {
  if (!file) throw new Error("no file");
  if (file.size > 8 * 1024 * 1024) throw new Error("File too large (max 8MB)");
  const sig = (await api.get("/cloudinary/signature", { params: { folder: "profiles/" } })).data;
  const fd = new FormData();
  fd.append("file", file);
  fd.append("api_key", sig.api_key);
  fd.append("timestamp", sig.timestamp);
  fd.append("signature", sig.signature);
  fd.append("folder", sig.folder);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`, {
    method: "POST",
    body: fd,
  });
  const json = await res.json();
  if (!json.secure_url) throw new Error(json.error?.message || "upload failed");
  return { photo_url: json.secure_url, photo_public_id: json.public_id };
}
