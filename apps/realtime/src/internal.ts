// Server↔server bridge: Next.js REST calls these endpoints (with the shared
// internal secret) so messages/reads that happen over plain HTTP still fan out
// to connected sockets. If this server is down, REST degrades gracefully —
// messages persist and are swept to "delivered" on the recipient's next
// connect; only the live push is lost.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Server } from "socket.io";
import { z } from "zod";
import * as chat from "@repo/database/chat";
import * as proto from "@repo/database/chat-protocol";
import { env } from "./env";
import { chatDb } from "./db";
import type { PresenceRegistry } from "./presence";

const messageViewSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  senderId: z.uuid(),
  seq: z.number(),
  body: z.string(),
  clientId: z.string().nullable(),
  status: z.enum(["sent", "delivered", "read"]),
  deliveredAt: z.coerce.date().nullable(),
  readAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  // Soft-delete marker (retention): optional so an older Next.js instance
  // mid-deploy can still bridge messages to a newer realtime server.
  deleted: z.boolean().optional().default(false),
});

const bridgeMessageSchema = z.object({
  message: messageViewSchema,
  recipientId: z.uuid(),
  sender: z.object({
    id: z.uuid(),
    name: z.string(),
    role: z.string(),
  }),
});

const bridgeReadSchema = z.object({
  conversationId: z.uuid(),
  readerId: z.uuid(),
  readAt: z.string(),
  otherUserId: z.uuid(),
});

function readBody(req: IncomingMessage, limit = 256 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export async function handleInternalRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: { io: () => Server; presence: PresenceRegistry },
): Promise<void> {
  if (req.headers["x-internal-secret"] !== env.internalSecret) {
    return json(res, 401, { error: "unauthorized" });
  }
  if (req.method !== "POST") {
    return json(res, 405, { error: "method not allowed" });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: "invalid json" });
  }

  const io = ctx.io();
  const userRoom = (id: string) => `user:${id}`;

  try {
    // REST-sent message → live fanout + delivered-marking.
    if (req.url === "/internal/message") {
      const parsed = bridgeMessageSchema.safeParse(payload);
      if (!parsed.success) return json(res, 400, { error: "bad payload" });
      const { recipientId, sender } = parsed.data;
      let message = parsed.data.message as chat.MessageView;

      const recipientOnline = ctx.presence.isOnline(recipientId);
      if (recipientOnline && message.status === "sent") {
        const deliveredAt = await chatDb(sender.id, (tx) =>
          chat.markMessageDelivered(tx, message.id),
        );
        message = { ...message, status: "delivered", deliveredAt };
      }

      const event = { message, sender } as proto.MessageNewEvent;
      io.to(userRoom(recipientId)).emit(proto.EV_MESSAGE_NEW, event);
      io.to(userRoom(sender.id)).emit(proto.EV_MESSAGE_NEW, event);

      if (recipientOnline) {
        const receipt: proto.MessageDeliveredEvent = {
          conversationId: message.conversationId,
          upToSeq: message.seq,
          deliveredAt: (message.deliveredAt ?? new Date()).toISOString(),
        };
        io.to(userRoom(sender.id)).emit(proto.EV_MESSAGE_DELIVERED, receipt);
      }
      return json(res, 200, { ok: true, recipientOnline });
    }

    // REST-marked read → receipt fanout.
    if (req.url === "/internal/read") {
      const parsed = bridgeReadSchema.safeParse(payload);
      if (!parsed.success) return json(res, 400, { error: "bad payload" });
      const { conversationId, readerId, readAt, otherUserId } = parsed.data;
      const event: proto.ConversationReadEvent = {
        conversationId,
        readerId,
        readAt,
      };
      io.to(userRoom(otherUserId)).emit(proto.EV_CONVERSATION_READ_FANOUT, event);
      io.to(userRoom(readerId)).emit(proto.EV_CONVERSATION_READ_FANOUT, event);
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: "not found" });
  } catch (err) {
    console.error("[internal]", req.url, err);
    return json(res, 500, { error: "internal error" });
  }
}
