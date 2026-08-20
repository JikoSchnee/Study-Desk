const { brotliCompressSync, brotliDecompressSync, constants: zlibConstants } = require("node:zlib");
const { createCipheriv, createDecipheriv, hkdfSync, randomBytes } = require("node:crypto");

const MAGIC = Buffer.from("STUDYDK1", "ascii");
const FORMAT_VERSION = 1;
const HEADER_BYTES = 8 + 1 + 2 + 16 + 12;
const TAG_BYTES = 16;
const INFO = Buffer.from("study-desk/offline-transfer/v1", "utf8");
const compiledCurrentKey = __STUDY_DESK_TRANSFER_KEY_CURRENT__;
const compiledPreviousKeys = __STUDY_DESK_TRANSFER_KEY_PREVIOUS__;
const compiledKeyVersion = __STUDY_DESK_TRANSFER_KEY_VERSION__;

function keyRing() {
  const version = Number(compiledKeyVersion || "1");
  const current = String(compiledCurrentKey || "").trim();
  if (!current) throw new Error("此安装包没有配置加密迁移密钥，请联系发布者重新构建。 ");
  const keys = { [version]: Buffer.from(current, "base64") };
  const previous = compiledPreviousKeys ? JSON.parse(compiledPreviousKeys) : {};
  for (const [keyVersion, value] of Object.entries(previous)) keys[Number(keyVersion)] = Buffer.from(value, "base64");
  for (const key of Object.values(keys)) if (key.length !== 32) throw new Error("加密迁移密钥格式无效。 ");
  return { version, keys, environment: { STUDY_DESK_TRANSFER_KEY_VERSION: String(version), STUDY_DESK_TRANSFER_KEY_CURRENT: current, STUDY_DESK_TRANSFER_KEY_PREVIOUS: JSON.stringify(previous) } };
}

function derive(master, salt) { return Buffer.from(hkdfSync("sha256", master, salt, INFO, 32)); }

function encrypt(value) {
  const ring = keyRing(); const salt = randomBytes(16); const nonce = randomBytes(12); const header = Buffer.alloc(HEADER_BYTES);
  MAGIC.copy(header); header.writeUInt8(FORMAT_VERSION, 8); header.writeUInt16BE(ring.version, 9); salt.copy(header, 11); nonce.copy(header, 27);
  const compressed = brotliCompressSync(Buffer.from(JSON.stringify(value), "utf8"), { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 6 } });
  const cipher = createCipheriv("aes-256-gcm", derive(ring.keys[ring.version], salt), nonce); cipher.setAAD(header);
  return Buffer.concat([header, cipher.update(compressed), cipher.final(), cipher.getAuthTag()]);
}

function decrypt(value) {
  if (value.length < HEADER_BYTES + TAG_BYTES || !value.subarray(0, 8).equals(MAGIC)) throw new Error("不是有效的 Study Desk 加密迁移文件。 ");
  if (value.readUInt8(8) !== FORMAT_VERSION) throw new Error("此迁移文件版本暂不受支持。 ");
  const ring = keyRing(); const master = ring.keys[value.readUInt16BE(9)];
  if (!master) throw new Error("此迁移文件使用了当前应用不支持的密钥版本。 ");
  try {
    const decipher = createDecipheriv("aes-256-gcm", derive(master, value.subarray(11, 27)), value.subarray(27, HEADER_BYTES));
    decipher.setAAD(value.subarray(0, HEADER_BYTES)); decipher.setAuthTag(value.subarray(value.length - TAG_BYTES));
    return JSON.parse(brotliDecompressSync(Buffer.concat([decipher.update(value.subarray(HEADER_BYTES, value.length - TAG_BYTES)), decipher.final()])).toString("utf8"));
  } catch { throw new Error("迁移文件已损坏、被修改或不属于此版本的 Study Desk。 "); }
}

module.exports = { encrypt, decrypt, keyRing };
