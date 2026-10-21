/** Runtime configuration from environment variables. Every integration is optional. */
export type Config = {
  /** Public base URL, e.g. https://boka.example.com. Used in emails and the Google OAuth redirect. */
  publicUrl: string;
  google: { clientId: string; clientSecret: string } | null;
  /** tenant: "common", "organizations", or your directory (tenant) ID. */
  microsoft: { clientId: string; clientSecret: string; tenant: string } | null;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
  } | null;
};

export function loadConfig(env = process.env): Config {
  const port = Number(env.SMTP_PORT ?? 587);
  return {
    publicUrl: (env.PUBLIC_URL ?? `http://localhost:${env.PORT ?? 5173}`).replace(/\/+$/, ""),
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
        : null,
    microsoft:
      env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET
        ? { clientId: env.MICROSOFT_CLIENT_ID, clientSecret: env.MICROSOFT_CLIENT_SECRET, tenant: env.MICROSOFT_TENANT_ID || "common" }
        : null,
    smtp: env.SMTP_HOST
      ? {
          host: env.SMTP_HOST,
          port,
          secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465,
          user: env.SMTP_USER ?? "",
          pass: env.SMTP_PASS ?? "",
          from: env.SMTP_FROM ?? env.SMTP_USER ?? "",
        }
      : null,
  };
}
