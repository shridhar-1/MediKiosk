import { seedIfEmpty } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await seedIfEmpty();
  return Response.json(result);
}

export async function GET() {
  const result = await seedIfEmpty();
  return Response.json(result);
}
