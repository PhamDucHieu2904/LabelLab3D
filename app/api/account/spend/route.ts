import { sessionUser, errorResponse, assertSameOrigin } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kept as a compatibility route while all render charges move through the
// reservation lifecycle below. It never posts an unpaired debit.
export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const user = await sessionUser();
    if (!user) throw new Error("FORBIDDEN");
    void request;
    throw new Error("RESERVATION_REQUIRED");
  } catch (error) {
    return errorResponse(error);
  }
}
