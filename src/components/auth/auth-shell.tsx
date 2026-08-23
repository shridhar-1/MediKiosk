import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand";

export function AuthShell({
  image,
  eyebrow,
  title,
  blurb,
  aside,
  swapHref,
  swapLabel,
  children,
}: {
  image: string;
  eyebrow: string;
  title: string;
  blurb: string;
  aside: ReactNode;
  swapHref: string;
  swapLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden lg:block">
        <Image src={image} alt="" fill priority className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#08292c]/55 via-[#08363a]/70 to-[#08292c]/92" />
        <div className="relative flex h-full flex-col justify-between p-10 text-[#f6f0e4]">
          <Link href="/">
            <BrandMark light />
          </Link>
          <div>
            <p className="text-[11px] uppercase tracking-[0.26em] text-[#e8d5a3]">{eyebrow}</p>
            <h2 className="serif mt-3 max-w-md text-[clamp(2rem,3.4vw,3rem)] leading-[1.05]">{title}</h2>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-[#f6f0e4]/78">{blurb}</p>
          </div>
          <div className="rounded-[24px] border border-white/15 bg-white/8 p-5 backdrop-blur-sm">{aside}</div>
        </div>
      </aside>

      <main className="flex flex-col px-6 py-8 md:px-12">
        <div className="flex items-center justify-between lg:hidden">
          <Link href="/">
            <BrandMark />
          </Link>
        </div>
        <div className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-md py-8">{children}</div>
        </div>
        <p className="mx-auto w-full max-w-md text-sm text-[#4a4338]">
          <Link href={swapHref} className="font-medium text-[#0f5c61] underline-offset-4 hover:underline">
            {swapLabel}
          </Link>
        </p>
      </main>
    </div>
  );
}
