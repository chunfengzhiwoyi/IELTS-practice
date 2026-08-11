"use client";

import Link from "next/link";
import Image from "next/image";

export function Logo() {
  return (
    <Link href="/" className="brand" aria-label="灵犀 IELTS 首页">
      <Image
        src="/logo-seal.png"
        alt=""
        width={34}
        height={34}
        className="brand__seal"
        priority
      />
      <span className="brand__mark">灵犀<em>·</em></span>
      <span className="brand__tag">IELTS</span>
    </Link>
  );
}
