const clean = (value = "") => String(value || "").trim();

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const apple = Boolean(
    clean(process.env.APPLE_CLIENT_ID)
    && clean(process.env.APPLE_TEAM_ID)
    && clean(process.env.APPLE_KEY_ID)
    && clean(process.env.APPLE_PRIVATE_KEY)
  );

  return res.status(200).json({ apple });
}
