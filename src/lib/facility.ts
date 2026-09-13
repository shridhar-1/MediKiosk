// 🏥 Facility Map — deterministic department → consultation room / floor /
// wing / walking instructions. Kept in code (no DB) so the token board, the
// patient's ticket and the physician's review screen all agree without a
// lookup. The kiosk never has to know the hospital layout — it just calls
// roomFor(department, priority).
//
// Emergencies bypass the department room and go straight to the Triage Bay.

type Room = {
  room: string;
  floor: string;
  wing: string;
  land: string; // walking instruction from the OPD kiosk / waiting area
};

const ROOMS: Record<string, Room> = {
  general_medicine: {
    room: "Room 101",
    floor: "Ground Floor",
    wing: "Wing A",
    land: "Main corridor → left → Wing A",
  },
  cardiology: {
    room: "Room 201",
    floor: "First Floor",
    wing: "Wing B",
    land: "Stairwell / lift → right → Wing B",
  },
  pulmonology: {
    room: "Room 203",
    floor: "First Floor",
    wing: "Wing B",
    land: "Stairwell / lift → right → Wing B",
  },
  gastroenterology: {
    room: "Room 205",
    floor: "First Floor",
    wing: "Wing B",
    land: "Stairwell / lift → right → Wing B",
  },
  orthopedics: {
    room: "Room 108",
    floor: "Ground Floor",
    wing: "Wing C",
    land: "Main corridor → right → Wing C",
  },
  pediatrics: {
    room: "Room 102",
    floor: "Ground Floor",
    wing: "Wing A",
    land: "Main corridor → left → Wing A",
  },
  obgyn: {
    room: "Room 104",
    floor: "Ground Floor",
    wing: "Wing A",
    land: "Main corridor → left → Wing A",
  },
  surgery: {
    room: "Room 301",
    floor: "Second Floor",
    wing: "Wing B",
    land: "Lift → up → Wing B",
  },
  dermatology: {
    room: "Room 206",
    floor: "First Floor",
    wing: "Wing B",
    land: "Stairwell / lift → right → Wing B",
  },
  ent: {
    room: "Room 207",
    floor: "First Floor",
    wing: "Wing B",
    land: "Stairwell / lift → right → Wing B",
  },
  ayush_kayachikitsa: {
    room: "Room 401",
    floor: "Second Floor",
    wing: "Wing C (AYUSH block)",
    land: "Lift → up → right → AYUSH block",
  },
  ayush_panchakarma: {
    room: "Room 402",
    floor: "Second Floor",
    wing: "Wing C (AYUSH block)",
    land: "Lift → up → right → AYUSH block",
  },
};

// Emergencies skip the department queue entirely.
const TRIAGE: Room = {
  room: "Triage Bay 1",
  floor: "Ground Floor",
  wing: "Emergency Zone",
  land: "Straight ahead from the kiosk → Emergency Zone",
};

export function roomFor(department: string, priority?: string | null): Room {
  if (priority === "emergency") return TRIAGE;
  return ROOMS[department] ?? {
    room: "Reception",
    floor: "Ground Floor",
    wing: "Wing A",
    land: "Ask at reception",
  };
}

/** Short single-line caption, e.g. "Room 101 · Ground Floor · Wing A". */
export function roomCaption(department: string, priority?: string | null): string {
  const r = roomFor(department, priority);
  return `${r.room} · ${r.floor} · ${r.wing}`;
}
// ── OPD hours vs the 24×7 emergency department ─────────────────────────────
// Government OPDs run fixed hours; the emergency block never closes. The
// token ticket tells the patient which of the two worlds they are in.
// Hours are IST (the kiosk runs in India) and configurable for demo day via
// NEXT_PUBLIC_OPD_OPEN / NEXT_PUBLIC_OPD_CLOSE ("HH:MM", 24-hour).

export const OPD_HOURS = {
  open: process.env.NEXT_PUBLIC_OPD_OPEN ?? "08:00",
  close: process.env.NEXT_PUBLIC_OPD_CLOSE ?? "20:00",
};

/** Any instant, re-based so its LOCAL fields (getHours…) read IST time. */
export function istDate(d: Date = new Date()): Date {
  return new Date(d.getTime() + (5.5 * 60 + d.getTimezoneOffset()) * 60000);
}

/** Current time in India (IST, UTC+5:30) regardless of server/browser TZ. */
export function istNow(): Date {
  return istDate(new Date());
}

export function opdStatus(now: Date = new Date()): {
  open: boolean;
  opensAt: string;
  closesAt: string;
  nextOpenLabel: string;
} {
  const ist = istDate(now); // read hours in IST, not the runtime's timezone
  const mins = ist.getHours() * 60 + ist.getMinutes();
  const [oh, om] = OPD_HOURS.open.split(":").map(Number);
  const [ch, cm] = OPD_HOURS.close.split(":").map(Number);
  const open = mins >= oh * 60 + (om || 0) && mins < ch * 60 + (cm || 0);
  const nextOpenLabel = mins < oh * 60 + (om || 0) ? `today ${OPD_HOURS.open}` : `tomorrow ${OPD_HOURS.open}`;
  return { open, opensAt: OPD_HOURS.open, closesAt: OPD_HOURS.close, nextOpenLabel };
}
