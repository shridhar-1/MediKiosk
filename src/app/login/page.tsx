import Link from "next/link";
import Image from "next/image";
import { BrandMark } from "@/components/brand";
import { HeartPulse, Stethoscope } from "lucide-react";
import { seedIfEmpty } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function LoginChooser() {
  await seedIfEmpty();

  const doors = [
    {
      href: "/login/patient",
      icon: HeartPulse,
      eyebrow: "For patients & families",
      title: "Patient sign in",
      body: "Record your history before the queue, scan old papers, and collect your OPD token. Opens instantly.",
      image: "/images/hero-kiosk.jpg",
    },
    {
      href: "/login/staff",
      icon: Stethoscope,
      eyebrow: "For hospital authority",
      title: "Staff sign in",
      body: "Physicians, triage nurses and administrators access the consultation console and OPD queue.",
      image: "/images/physician-console.jpg",
    },
  ];

  return (
    <main className="kiosk-bezel min-h-screen px-5 py-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/">
          <BrandMark light />
        </Link>
        <h1 className="serif mt-12 max-w-2xl text-[clamp(2.2rem,5vw,3.6rem)] leading-[1.02] text-[#f6f0e4]">
          Two doors into the same record.
        </h1>
        <p className="mt-4 max-w-lg text-[#f6f0e4]/75">
          Patients own their history. Clinicians read it in seconds. Pick a side — this
          demonstration needs no password or OTP.
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {doors.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              className="group relative overflow-hidden rounded-[30px] bg-[#fffdf7] p-1 transition hover:-translate-y-1"
            >
              <div className="relative h-40 overflow-hidden rounded-[26px]">
                <Image src={d.image} alt="" fill className="object-cover transition duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-[#08363a]/35" />
              </div>
              <div className="p-6">
                <d.icon className="h-6 w-6 text-[#0f5c61]" />
                <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-[#c9842a]">{d.eyebrow}</p>
                <h2 className="serif mt-1 text-2xl">{d.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#4a4338]">{d.body}</p>
                <span className="mt-4 inline-block text-sm font-medium text-[#0f5c61]">Continue →</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
