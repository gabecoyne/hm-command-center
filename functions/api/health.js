export async function onRequestGet(ctx) {
  let ok = false;
  try { await ctx.env.DB.prepare("SELECT 1").first(); ok = true; } catch (_) {}
  return new Response(JSON.stringify({ ok, server: "cc-cloudflare", store: "d1",
    identity: ctx.data.identity || null }),
    { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
