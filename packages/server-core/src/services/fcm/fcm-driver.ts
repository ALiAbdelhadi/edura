import type { FcmTarget, PushDriver } from "../push/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let firebaseAdmin: any = null;

export function isFcmConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
}

async function getAdmin() {
  if (firebaseAdmin) return firebaseAdmin as typeof firebaseAdmin;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) return null;

  try {
    const mod = await (new Function("m", "return import(m)"))("firebase-admin") as {
      default: {
        apps: unknown[];
        initializeApp: (opts: unknown) => void;
        credential: { cert: (sa: unknown) => unknown };
        messaging: () => {
          send: (msg: unknown) => Promise<void>;
        };
      };
    };
    const admin = mod.default;

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
      });
    }

    firebaseAdmin = admin;
    return admin;
  } catch {
    console.warn("[fcm] firebase-admin unavailable; skipping push delivery");
    return null;
  }
}

export const fcmDriver: PushDriver<FcmTarget> = {
  name: "fcm",
  channel: "fcm",
  async deliver(tokens, message) {
    const admin = await getAdmin();
    if (!admin) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[fcm] FIREBASE_SERVICE_ACCOUNT_JSON not set; skipping push delivery");
      }
      return [];
    }

    const invalidTokens: string[] = [];

    await Promise.all(
      tokens.map(async (token) => {
        try {
          await admin.messaging().send({
            token,
            notification: { title: message.title, body: message.body },
            data: message.data,
          });
        } catch (err: unknown) {
          const code = (err as { code?: string }).code;
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token"
          ) {
            invalidTokens.push(token);
          }
        }
      }),
    );

    return invalidTokens;
  },
};
