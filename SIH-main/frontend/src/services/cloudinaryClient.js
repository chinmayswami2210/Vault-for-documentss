// Cloudinary Client Service for Direct Uploads & Backend Synchronization

const CLOUDINARY_CONFIG_KEY = "trace_vault_cloudinary_config";

export function getLocalCloudinaryConfig() {
  try {
    const saved = localStorage.getItem(CLOUDINARY_CONFIG_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return {
    cloudName: "",
    uploadPreset: "",
    apiKey: "",
    autoSync: true
  };
}

export function saveLocalCloudinaryConfig(config) {
  try {
    localStorage.setItem(CLOUDINARY_CONFIG_KEY, JSON.stringify(config));
  } catch (e) {}
}

/**
 * Fetch server-configured Cloudinary status
 */
export async function fetchServerCloudinaryStatus() {
  try {
    const res = await fetch("/api/evidence/cloudinary-status");
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    // Backend offline
  }
  return { configured: false, cloud_name: null };
}

/**
 * Upload directly to Cloudinary via REST API (unsigned preset mode)
 */
export async function uploadDirectToCloudinary(fileDataUriOrBlob, fileName, options = {}) {
  const localCfg = getLocalCloudinaryConfig();
  const cloudName = options.cloudName || localCfg.cloudName;
  const uploadPreset = options.uploadPreset || localCfg.uploadPreset || "trace_vault_preset";

  if (!cloudName) {
    throw new Error("Cloudinary Cloud Name is required for direct upload.");
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;
  const formData = new FormData();
  formData.append("file", fileDataUriOrBlob);
  formData.append("upload_preset", uploadPreset);
  formData.append("folder", "trace_vault_evidence");
  if (fileName) {
    formData.append("public_id", `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9_-]/g, "_")}`);
  }

  const res = await fetch(endpoint, {
    method: "POST",
    body: formData
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || "Cloudinary direct upload failed");
  }

  return {
    secure_url: data.secure_url,
    public_id: data.public_id,
    bytes: data.bytes,
    format: data.format
  };
}

/**
 * Sync an offline evidence item to Cloudinary via backend or direct upload
 */
export async function syncEvidenceItem(item, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // 1. First attempt backend sync endpoint
  try {
    const res = await fetch("/api/evidence/sync-offline", {
      method: "POST",
      headers,
      body: JSON.stringify({ items: [item] })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results.length > 0 && data.results[0].status === "synced") {
        return {
          success: true,
          evidence: data.results[0].evidence,
          cloudinary_url: data.results[0].cloudinary_url
        };
      }
    }
  } catch (err) {
    console.warn("Backend sync request failed, attempting direct Cloudinary sync if configured:", err);
  }

  // 2. Direct Cloudinary upload attempt if client has cloudName configured
  const localCfg = getLocalCloudinaryConfig();
  if (localCfg.cloudName && (item.image_base64 || item.file_data)) {
    try {
      const cloudRes = await uploadDirectToCloudinary(
        item.image_base64 || item.file_data,
        item.file_name,
        localCfg
      );
      
      const updatedItem = {
        ...item,
        cloudinary_url: cloudRes.secure_url,
        cloudinary_id: cloudRes.public_id,
        sync_status: "synced"
      };

      // Also notify backend if reachable
      try {
        await fetch("/api/evidence/sync-offline", {
          method: "POST",
          headers,
          body: JSON.stringify({ items: [updatedItem] })
        });
      } catch (e) {}

      return {
        success: true,
        evidence: updatedItem,
        cloudinary_url: cloudRes.secure_url
      };
    } catch (directErr) {
      console.error("Direct Cloudinary upload failed:", directErr);
    }
  }

  // 3. Fallback sync to central vault backend if Cloudinary is not configured
  const fallbackSyncedItem = {
    ...item,
    sync_status: "local"
  };

  try {
    const res = await fetch("/api/evidence/sync-offline", {
      method: "POST",
      headers,
      body: JSON.stringify({ items: [fallbackSyncedItem] })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        return {
          success: true,
          evidence: data.results[0].evidence,
          cloudinary_url: data.results[0].cloudinary_url || null
        };
      }
    }
  } catch (e) {}

  return {
    success: true,
    isMock: true,
    evidence: fallbackSyncedItem,
    cloudinary_url: null
  };
}
