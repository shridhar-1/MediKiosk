import Image from "next/image";

export function BrandMark({
  light = false,
  size = 36,
}: {
  light?: boolean;
  size?: number;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Image
        src="/images/logo-mark.png"
        alt=""
        width={size}
        height={size}
        className="rounded-full ring-1 ring-black/10"
      />
      <span className="leading-none">
        <span className={`block text-[1.05rem] font-semibold tracking-tight ${light ? "text-[#f6f0e4]" : "text-[#08363a]"}`}>
          MediKiosk
        </span>
        <span className={`mt-0.5 block text-[10px] uppercase tracking-[0.18em] ${light ? "text-[#e8d5a3]" : "text-[#c9842a]"}`}>
          History first
        </span>
      </span>
    </span>
  );
}
