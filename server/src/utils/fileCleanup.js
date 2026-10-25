const fs = require("fs");
const path = require("path");
const { UPLOAD_DIR } = require("../config/uploads");
const storage = require("../config/storage");

const deleteUploadByUrl = (src) => {
  if (typeof src !== "string") return;

  if (storage.isEnabled()) {
    let key = null;
    if (src.includes(`/${storage.bucket}/`)) key = storage.keyFromUrl(src);
    else {
      const marker = "/uploads/";
      const idx = src.indexOf(marker);
      if (idx !== -1) key = path.basename(src.slice(idx + marker.length).split("?")[0]);
    }
    if (key) storage.deleteObject(key).catch(() => {});
    return;
  }

  const marker = "/uploads/";
  const idx = src.indexOf(marker);
  if (idx === -1) return;
  const name = path.basename(src.slice(idx + marker.length).split("?")[0]);
  if (name) fs.promises.unlink(path.join(UPLOAD_DIR, name)).catch(() => {});
};

module.exports = { deleteUploadByUrl };
