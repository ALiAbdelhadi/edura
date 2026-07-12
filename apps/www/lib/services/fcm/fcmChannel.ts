import { platformDb } from "@/lib/db/scope";

/**
 * FCM channel adapter.
 *
 * Set FIREBASE_SERVICE_ACCOUNT_JSON env var to a JSON-stringified Firebase
 * service account to enable push delivery. When absent the adapter logs
 * a warning and skips sending (V1 stub behaviour).
 *
 * Supported notification types for FCM:
 *   absence_marked, session_cancelled, session_postponed, course_cancelled,
 *   grade_entered, material_uploaded, payment_recorded,
 *   enrollment_request_approved, enrollment_request_declined, admin_broadcast.
 */

export const FCM_PUSH_TYPES = new Set([
  "absence_marked",
  "session_cancelled",
  "session_postponed",
  "course_cancelled",
  "grade_entered",
  "material_uploaded",
  "payment_recorded",
  "enrollment_request_approved",
  "enrollment_request_declined",
  "admin_broadcast",
]);

type FcmMessage = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let firebaseAdmin: any = null;

async function getAdmin() {
  if (firebaseAdmin) return firebaseAdmin as typeof firebaseAdmin;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) return null;

  try {
    // Using Function constructor to bypass static analysis — firebase-admin is optional
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

async function sendFcmBatch(tokens: string[], message: FcmMessage): Promise<string[]> {
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
}

export async function pushToUser(
  userId: string,
  message: FcmMessage,
): Promise<void> {
  const user = await platformDb((tx) =>
    tx.user.findUnique({ where: { id: userId }, select: { fcmToken: true } }),
  );
  const token = user?.fcmToken;
  if (!token) return;

  const invalid = await sendFcmBatch([token], message);

  if (invalid.length > 0) {
    await platformDb((tx) =>
      tx.user.updateMany({ where: { fcmToken: { in: invalid } }, data: { fcmToken: null } }),
    );
  }
}
