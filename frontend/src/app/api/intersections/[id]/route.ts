import { NextResponse } from "next/server";

import { deleteEngineeringIntersection } from "@/lib/engineering-studio-server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { ok: false, detail: "Missing intersection id." },
      { status: 400 },
    );
  }
  try {
    const result = await deleteEngineeringIntersection(id);
    if (result.ok) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(
      { ok: false, detail: result.detail },
      { status: result.status },
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, detail }, { status: 500 });
  }
}
