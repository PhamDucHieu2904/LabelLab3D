import { clearSession, json, errorResponse, assertSameOrigin } from "@/lib/server/http"; export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST() { try { await assertSameOrigin(); await clearSession(); return json({ ok:true }); } catch (e) { return errorResponse(e); } }
