// The only code that reads the permanent Decart key. The browser gets a 60-second
// client token scoped to Lucy VTON, with Decart itself enforcing the session cap.

export const dynamic = "force-dynamic";

const MODEL = "lucy-vton-latest";
const sessionSeconds = () => Math.min(1800, Math.max(30, Number(process.env.SESSION_SECONDS) || 300));

/** Lets the page know whether to show the access-code field before starting. */
export function GET() {
  return Response.json({
    configured: !!process.env.DECART_API_KEY,
    requiresCode: !!process.env.ACCESS_CODE,
    sessionSeconds: sessionSeconds(),
  });
}

export async function POST(request) {
  const key = process.env.DECART_API_KEY;
  if (!key) return Response.json({ error: "Live try-on is not configured yet (DECART_API_KEY missing)." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const expected = process.env.ACCESS_CODE;
  if (expected && String(body.code || "").trim() !== expected) {
    return Response.json({ error: "That access code is not right.", code: "BAD_CODE" }, { status: 401 });
  }

  const seconds = sessionSeconds();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch("https://api.decart.ai/v1/client/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": key },
      body: JSON.stringify({ expiresIn: 60, allowedModels: [MODEL], constraints: { realtime: { maxSessionDuration: seconds } } }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      console.error("Decart token error", res.status, detail);
      const message =
        res.status === 401 || res.status === 403
          ? "Decart rejected the server's API key."
          : res.status === 402
            ? "The Decart account is out of credits."
            : `Decart returned ${res.status}.`;
      return Response.json({ error: message }, { status: 502 });
    }
    const token = await res.json();
    return Response.json(
      { apiKey: token.apiKey, sessionSeconds: seconds, fastMode: process.env.FAST_MODE === "1" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return Response.json(
      { error: err?.name === "AbortError" ? "Decart took too long to respond." : "Could not reach Decart." },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
