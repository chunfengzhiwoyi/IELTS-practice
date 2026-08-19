/**
 * 信封加密（Envelope Encryption）
 * ------------------------------------------------------------
 * 用于用户自带 LLM API Key / ima 凭证等机密。
 *
 * 设计：
 *   - KEK（主密钥）：来自环境变量 SECRET_ENCRYPTION_KEY（32 字节；
 *     接受 64 位 hex，或任意字符串经 SHA-256 派生到 32 字节）。
 *   - 每条机密生成随机 DEK（AES-256-GCM），明文用 DEK 加密；
 *   - DEK 再用 KEK 加密（wrap）后与密文一起存储；
 *   - 解密时先用 KEK 解 wrap 出 DEK，再解密明文。
 *
 * 明文只在请求期内存中存在；DB 仅存密文（含 IV / authTag / kek 版本）。
 * 仅服务端使用（route handler），前端绝不持有 KEK。
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const KEK_VERSION = 1;

export interface CipherBundle {
  v: number;
  /** 被 KEK 包裹后的 DEK（base64） */
  wrappedDek: string;
  /** 包裹 DEK 时使用的 IV（base64） */
  wrapIv: string;
  /** 包裹 DEK 的 GCM auth tag（base64） */
  wrapTag: string;
  /** 加密明文时使用的 IV（base64） */
  iv: string;
  /** 明文 GCM auth tag（base64） */
  tag: string;
  /** 密文（base64） */
  data: string;
}

let cachedKek: Buffer | null = null;

function getKek(): Buffer {
  if (cachedKek) return cachedKek;
  const raw = process.env.SECRET_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("[crypto] SECRET_ENCRYPTION_KEY 未配置");
  }
  // 64 位 hex → 32 字节；否则 SHA-256 派生到 32 字节
  const hexMatch = raw.match(/^[0-9a-fA-F]{64}$/);
  cachedKek = hexMatch
    ? Buffer.from(raw, "hex")
    : createHash("sha256").update(raw, "utf8").digest();
  return cachedKek;
}

/** 加密任意 JSON 可序列化对象，返回密文包（可安全存库）。 */
export function encryptSecret(plain: unknown): CipherBundle {
  const plaintext = Buffer.from(JSON.stringify(plain), "utf8");

  const dek = randomBytes(32);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, dek, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const wrapIv = randomBytes(IV_LEN);
  const wrap = createCipheriv(ALGO, getKek(), wrapIv);
  const wrappedDek = Buffer.concat([wrap.update(dek), wrap.final()]);
  const wrapTag = wrap.getAuthTag();

  return {
    v: KEK_VERSION,
    wrappedDek: wrappedDek.toString("base64"),
    wrapIv: wrapIv.toString("base64"),
    wrapTag: wrapTag.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: enc.toString("base64"),
  };
}

/** 解密密文包，还原原始对象。 */
export function decryptSecret<T = unknown>(bundle: CipherBundle): T {
  const kek = getKek();

  const wrapIv = Buffer.from(bundle.wrapIv, "base64");
  const wrap = createDecipheriv(ALGO, kek, wrapIv);
  wrap.setAuthTag(Buffer.from(bundle.wrapTag, "base64"));
  const dek = Buffer.concat([
    wrap.update(Buffer.from(bundle.wrappedDek, "base64")),
    wrap.final(),
  ]);

  const iv = Buffer.from(bundle.iv, "base64");
  const decipher = createDecipheriv(ALGO, dek, iv);
  decipher.setAuthTag(Buffer.from(bundle.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(bundle.data, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plain.toString("utf8")) as T;
}
