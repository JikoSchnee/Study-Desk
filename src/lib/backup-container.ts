import "server-only";
import { brotliCompressSync, brotliDecompressSync, constants as zlibConstants } from "node:zlib";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const MAGIC = Buffer.from("STUDYDK1", "ascii");
const FORMAT_VERSION = 1;
const SALT_BYTES = 16;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + 1 + 2 + SALT_BYTES + NONCE_BYTES;
const HKDF_INFO = Buffer.from("study-desk/offline-transfer/v1", "utf8");

export type TransferKeyRing = { currentVersion: number; keys: Record<number, Buffer> };

function decodeKey(value: string) {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("迁移主密钥必须是 32 字节 Base64。 ");
  return key;
}

export function transferKeyRingFromEnvironment(): TransferKeyRing {
  const currentVersion = Number(process.env.STUDY_DESK_TRANSFER_KEY_VERSION ?? "1");
  const current = process.env.STUDY_DESK_TRANSFER_KEY_CURRENT?.trim();
  if (!Number.isInteger(currentVersion) || currentVersion < 1 || !current) throw new Error("当前版本没有配置加密迁移密钥。 ");
  const keys: Record<number, Buffer> = { [currentVersion]: decodeKey(current) };
  if (process.env.STUDY_DESK_TRANSFER_KEY_PREVIOUS) {
    const previous = JSON.parse(process.env.STUDY_DESK_TRANSFER_KEY_PREVIOUS) as Record<string, string>;
    for (const [version, value] of Object.entries(previous)) keys[Number(version)] = decodeKey(value);
  }
  return { currentVersion, keys };
}

function derivedKey(master: Buffer, salt: Buffer) {
  return Buffer.from(hkdfSync("sha256", master, salt, HKDF_INFO, 32));
}

export function encryptStudyDeskContainer(value: unknown, ring = transferKeyRingFromEnvironment()) {
  const master = ring.keys[ring.currentVersion];
  if (!master) throw new Error("找不到当前迁移密钥。 ");
  const salt = randomBytes(SALT_BYTES);
  const nonce = randomBytes(NONCE_BYTES);
  const header = Buffer.alloc(HEADER_BYTES);
  MAGIC.copy(header, 0);
  header.writeUInt8(FORMAT_VERSION, MAGIC.length);
  header.writeUInt16BE(ring.currentVersion, MAGIC.length + 1);
  salt.copy(header, MAGIC.length + 3);
  nonce.copy(header, MAGIC.length + 3 + SALT_BYTES);
  const compressed = brotliCompressSync(Buffer.from(JSON.stringify(value), "utf8"), { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 6 } });
  const cipher = createCipheriv("aes-256-gcm", derivedKey(master, salt), nonce);
  cipher.setAAD(header);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  return Buffer.concat([header, ciphertext, cipher.getAuthTag()]);
}

export function isStudyDeskContainer(value: Buffer) {
  return value.length >= HEADER_BYTES + TAG_BYTES && value.subarray(0, MAGIC.length).equals(MAGIC);
}

export function decryptStudyDeskContainer(value: Buffer, ring = transferKeyRingFromEnvironment()): unknown {
  if (!isStudyDeskContainer(value)) throw new Error("不是有效的 Study Desk 加密迁移文件。 ");
  const formatVersion = value.readUInt8(MAGIC.length);
  if (formatVersion !== FORMAT_VERSION) throw new Error("此迁移文件版本暂不受支持。 ");
  const keyVersion = value.readUInt16BE(MAGIC.length + 1);
  const master = ring.keys[keyVersion];
  if (!master) throw new Error("此迁移文件使用了当前应用不支持的密钥版本。 ");
  const salt = value.subarray(MAGIC.length + 3, MAGIC.length + 3 + SALT_BYTES);
  const nonce = value.subarray(MAGIC.length + 3 + SALT_BYTES, HEADER_BYTES);
  const tag = value.subarray(value.length - TAG_BYTES);
  const ciphertext = value.subarray(HEADER_BYTES, value.length - TAG_BYTES);
  try {
    const decipher = createDecipheriv("aes-256-gcm", derivedKey(master, salt), nonce);
    decipher.setAAD(value.subarray(0, HEADER_BYTES));
    decipher.setAuthTag(tag);
    const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(brotliDecompressSync(compressed).toString("utf8"));
  } catch {
    throw new Error("迁移文件已损坏、被修改或不属于此版本的 Study Desk。 ");
  }
}

export const studyDeskContainerInternals = { magic: MAGIC.toString("ascii"), formatVersion: FORMAT_VERSION };
