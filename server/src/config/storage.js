const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

const cfg = {
  endpoint: process.env.NEON_STORAGE_ENDPOINT,
  region: process.env.NEON_STORAGE_REGION,
  accessKeyId: process.env.NEON_STORAGE_ACCESS_KEY_ID,
  secretAccessKey: process.env.NEON_STORAGE_SECRET_ACCESS_KEY,
  bucket: process.env.NEON_STORAGE_BUCKET,
};

const enabled = Boolean(cfg.endpoint && cfg.region && cfg.accessKeyId && cfg.secretAccessKey && cfg.bucket);

let client = null;
if (enabled) {
  client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  console.log(`Neon Object Storage enabled (bucket: ${cfg.bucket})`);
}

const isEnabled = () => enabled;

const putObject = async (key, buffer, contentType) => {
  await client.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: buffer, ContentType: contentType }));
  return `${cfg.endpoint.replace(/\/$/, "")}/${cfg.bucket}/${key}`;
};

const deleteObject = async (key) => {
  await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
};

const keyFromUrl = (url) => {
  const marker = `/${cfg.bucket}/`;
  const i = typeof url === "string" ? url.indexOf(marker) : -1;
  return i === -1 ? null : url.slice(i + marker.length).split("?")[0];
};

module.exports = { isEnabled, putObject, deleteObject, keyFromUrl, bucket: cfg.bucket };
