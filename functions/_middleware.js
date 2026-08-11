// Runs before every /functions route. Extracts the caller's identity from Cloudflare Access:
//   humans  -> Cf-Access-Authenticated-User-Email (Google SSO)
//   machines-> Cf-Access-Client-Id (service token common name)
// Handlers stamp writes with this when the body doesn't name a `by`, so every decision and
// document write carries who did it — the "keep track of who's doing what" requirement.
// Locally (no Access in front) identity is null and handlers fall back to the body.
export async function onRequest(ctx) {
  const email = ctx.request.headers.get("Cf-Access-Authenticated-User-Email");
  const svc = ctx.request.headers.get("Cf-Access-Client-Id");
  ctx.data.identity = email ? { kind: "human", email }
    : svc ? { kind: "service", email: svc } : null;
  const res = await ctx.next();
  res.headers.set("Cache-Control", "no-store");
  return res;
}
