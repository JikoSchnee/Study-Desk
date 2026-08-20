const value = String(process.env.STUDY_DESK_TRANSFER_KEY_CURRENT || "").trim();
let decoded = Buffer.alloc(0);
try { decoded = Buffer.from(value, "base64"); } catch {}
if (decoded.length !== 32) {
  console.error("Release builds require STUDY_DESK_TRANSFER_KEY_CURRENT as a 32-byte Base64 key. Generate one with: openssl rand -base64 32");
  process.exit(1);
}
