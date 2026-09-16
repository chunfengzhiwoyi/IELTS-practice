/**
 * MP4 / M4A 容器时长解析（尽力而为，无外部依赖）
 * -------------------------------------------------------
 * 解析 moov > mvhd 的 timescale/duration。
 * 兼容 version 0/1；支持 size==1（64 位）与 size==0（至文件尾）的 box。
 * 非 MP4 容器或解析失败 → 返回 0（诚实缺失，不伪造时长）。
 */
export function parseM4aDurationMs(buffer: Buffer): number {
  if (buffer.length < 16) return 0;

  const readU32 = (off: number): number => buffer.readUInt32BE(off);
  const readU64 = (off: number): number => Number(buffer.readBigUInt64BE(off));

  let offset = 0;
  while (offset + 8 <= buffer.length) {
    let size = readU32(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);

    if (size === 1) {
      // 64-bit size：BoxSize 占 8 字节（紧随 8 字节 header 之后）
      if (offset + 16 > buffer.length) return 0;
      size = readU64(offset + 8);
    } else if (size === 0) {
      // 至文件末尾
      size = buffer.length - offset;
    }

    if (size < 8) return 0;

    if (type === "moov") {
      return parseMoovMvhd(buffer, offset + 8, offset + size);
    }

    if (type === "mdat" || type === "free" || type === "skip" || type === "wide") {
      // 大数据块，直接跳过
    }

    offset += size;
  }

  return 0;
}

/** 在 moov 子 box 中定位 mvhd */
function parseMoovMvhd(buffer: Buffer, start: number, end: number): number {
  let offset = start;
  while (offset + 8 <= end) {
    const size = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    if (size < 8) return 0;

    if (type === "mvhd") {
      return parseMvhd(buffer, offset + 8, Math.min(offset + size, end));
    }
    offset += size;
  }
  return 0;
}

function parseMvhd(buffer: Buffer, start: number, end: number): number {
  if (start + 4 > end) return 0;
  const version = buffer.readUInt8(start);
  let off = start + 4; // version + flags(3)

  let timescale: number;
  let duration: number;
  if (version === 0) {
    if (off + 12 > end) return 0;
    off += 8; // creation + modification (4+4)
    timescale = buffer.readUInt32BE(off);
    duration = buffer.readUInt32BE(off + 4);
  } else if (version === 1) {
    if (off + 20 > end) return 0;
    off += 16; // creation + modification (8+8)
    timescale = buffer.readUInt32BE(off);
    duration = Number(buffer.readBigUInt64BE(off + 4));
  } else {
    return 0;
  }

  if (!timescale || timescale <= 0) return 0;
  return Math.round((duration / timescale) * 1000);
}
