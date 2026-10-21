import * as Sentry from "@sentry/nextjs";

export async function register() {
    Sentry.init({
        dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || "https://9a903c9324f7d15af93dbbd52a36b8fa@o4512277650604032.ingest.de.sentry.io/4512294230360144",
        tracesSampleRate: 1,
    });
}

export const onRequestError = Sentry.captureRequestError;