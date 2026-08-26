import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { LogoutButton } from "@/components/auth/logout-button";
import type { Staff } from "@/db/schema";

const ROLE_LABEL: Record<string, string> = {
  physician: "Physician",
  triage: "Triage",
  admin: "Superintendent",
};

export function PhysicianNav({ member }: { member: Staff }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1b1712]/10 bg-[#fffdf7] px-6 py-4">
      <Link href="/physician">
        <BrandMark />
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/physician" className="text-[#4a4338] hover:text-[#08363a]">
          Queue
        </Link>
                <Link href="/physician/records" className="text-[#4a4338] hover:text-[#08363a]">
          Records
        </Link>
        <Link href="/physician/logic" className="text-[#4a4338] hover:text-[#08363a]">
          Emergency logic
        </Link>
        <span className="hidden text-right sm:block">
          <span className="block font-medium text-[#1b1712]">{member.fullName}</span>
          <span className="block text-[11px] text-[#4a4338]">
            {member.designation ?? ROLE_LABEL[member.role] ?? member.role} · {member.hospital}
          </span>
        </span>
        <LogoutButton kind="staff" />
      </nav>
    </header>
  );
}