import { sessionUser, json, errorResponse } from "@/lib/server/http"; export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() { try { const user = await sessionUser(); return json({ user: user ? { id:user.id,email:user.email,name:user.name,role:user.role } : null }); } catch (e) { return errorResponse(e); } }
