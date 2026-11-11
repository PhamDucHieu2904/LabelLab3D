import { reserveCoins } from "@/lib/server/wallet";
import { env, sessionUser, json, errorResponse, assertSameOrigin } from "@/lib/server/http";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: Request) { try { await assertSameOrigin(); const user=await sessionUser(); if(!user) throw new Error("FORBIDDEN"); const b=await request.json().catch(()=>({})) as {amount?:number;idempotencyKey?:string;reference?:string;ttlSeconds?:number}; const r=await reserveCoins(await env(),{userId:user.id,amount:Number(b.amount),idempotencyKey:String(b.idempotencyKey??""),reference:String(b.reference??""),ttlSeconds:b.ttlSeconds}); return json({reservation:r}); } catch(e){return errorResponse(e);} }
