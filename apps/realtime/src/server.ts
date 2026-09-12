import * as chat from "@repo/database/chat";
import * as proto from "@repo/database/chat-protocol";
import { checkRateLimit } from "@repo/server-core/rate-limit/token-bucket";
import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import { verifySocketToken, type SocketUser } from "./auth";
import { chatDb, disconnectDb } from "./db";
import { corsOrigin, env } from "./env";
import { handleInternalRequest } from "./internal";
import { notifyOffline } from "./notify";
import { PresenceRegistry } from "./presence";

const presence = new PresenceRegistry();

const limiter: chat.ChatLimiter = (key, capacity, perMinute) =>
  checkRateLimit(key, capacity, perMinute);

const httpServer = createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, online: presence.onlineUsers() }));
    return;
  }
  if (req.url?.startsWith("/internal/")) {
    void handleInternalRequest(req, res, { io: () => io, presence });
    return;
  }
  res.writeHead(404).end();
});

const io = new Server(httpServer, {
  cors: { origin: corsOrigin, credentials: true },
  maxHttpBufferSize: 64 * 1024,
});

const userRoom = (userId: string) => `user:${userId}`;

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || !token) {
      return next(new Error("unauthorized"));
    }
    socket.data.user = await verifySocketToken(token);
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

const sendSchema = z
  .object({
    conversationId: z.uuid().optional(),
    recipientId: z.uuid().optional(),
    body: z.string().min(1).max(chat.MAX_MESSAGE_LENGTH),
    clientId: z.string().max(64).optional(),
  })
  .refine((d) => d.conversationId || d.recipientId, {
    message: "conversationId or recipientId required",
  });

const readSchema = z.object({ conversationId: z.uuid() });

const typingSchema = z.object({
  conversationId: z.uuid(),
  typing: z.boolean(),
});

type Ack = (response: proto.SendMessageAck) => void;

io.on("connection", (socket: Socket) => {
  const user = socket.data.user as SocketUser;
  void socket.join(userRoom(user.id));
  const membership = new Map<string, string>(); 

  const cameOnline = presence.add(user.id, socket.id);

  void (async () => {
    try {
      const partnerIds = await chatDb(user.id, (tx) =>
        chat.listPartnerIds(tx, user.id),
      );
      const state: proto.PresenceStateEvent = {
        online: presence.filterOnline(partnerIds),
      };
      socket.emit(proto.EV_PRESENCE_STATE, state);
      if (cameOnline) {
        const update: proto.PresenceUpdateEvent = {
          userId: user.id,
          online: true,
        };
        for (const pid of partnerIds) {
          io.to(userRoom(pid)).emit(proto.EV_PRESENCE_UPDATE, update);
        }
      }
      const groups = await chatDb(user.id, (tx) =>
        chat.markDeliveredForUser(tx, user.id),
      );
      for (const g of groups) {
        const receipt: proto.MessageDeliveredEvent = {
          conversationId: g.conversationId,
          upToSeq: g.maxSeq,
          deliveredAt: g.deliveredAt.toISOString(),
        };
        io.to(userRoom(g.senderId)).emit(proto.EV_MESSAGE_DELIVERED, receipt);
      }
    } catch (err) {
      console.error("[connect-init]", user.id, err);
    }
  })();

  socket.on(proto.EV_MESSAGE_SEND, async (raw: unknown, ack?: Ack) => {
    const respond: Ack = typeof ack === "function" ? ack : () => {};
    const parsed = sendSchema.safeParse(raw);
    if (!parsed.success) {
      return respond({
        ok: false,
        code: "invalid_body",
        message: parsed.error.issues[0]?.message ?? "Invalid payload",
      });
    }
    try {
      const result = await chatDb(user.id, (tx) =>
        chat.appendMessage(
          tx,
          { id: user.id, role: user.role, centerId: user.centerId },
          parsed.data,
          { limiter },
        ),
      );
      const { recipientId, duplicate } = result;
      let message = result.message;

      if (!duplicate) {
        const recipientOnline = presence.isOnline(recipientId);
        if (recipientOnline) {
          const deliveredAt = await chatDb(user.id, (tx) =>
            chat.markMessageDelivered(tx, message.id),
          );
          message = { ...message, status: "delivered", deliveredAt };
        }

        const event: proto.MessageNewEvent = {
          message,
          sender: { id: user.id, name: user.name, role: user.role },
        };

        io.to(userRoom(recipientId)).emit(proto.EV_MESSAGE_NEW, event);
        socket.to(userRoom(user.id)).emit(proto.EV_MESSAGE_NEW, event);

        if (recipientOnline) {
          const receipt: proto.MessageDeliveredEvent = {
            conversationId: message.conversationId,
            upToSeq: message.seq,
            deliveredAt: message.deliveredAt
              ? new Date(message.deliveredAt).toISOString()
              : new Date().toISOString(),
          };
          io.to(userRoom(user.id)).emit(proto.EV_MESSAGE_DELIVERED, receipt);
        } else {
          notifyOffline({
            conversationId: message.conversationId,
            messageId: message.id,
          });
        }
      }
      membership.set(message.conversationId, recipientId);
      respond({ ok: true, message, duplicate });
    } catch (err) {
      if (err instanceof chat.ChatError) {
        return respond({ ok: false, code: err.code, message: err.message });
      }
      console.error("[message:send]", user.id, err);
      respond({
        ok: false,
        code: "internal_error",
        message: "Failed to send message",
      });
    }
  });

  socket.on(proto.EV_CONVERSATION_READ, async (raw: unknown) => {
    const parsed = readSchema.safeParse(raw);
    if (!parsed.success) return;
    // SECURITY_AUDIT.md (2026-09-11) RT-01: unknown ids miss the membership
    // cache and hit the database per event; bounded per user like sends.
    if (!(await limiter(`chat-read:${user.id}`, 120, 120))) return;
    try {
      const receipt = await chatDb(user.id, (tx) =>
        chat.markConversationRead(tx, user.id, parsed.data.conversationId),
      );
      membership.set(receipt.conversationId, receipt.otherUserId);
      const event: proto.ConversationReadEvent = {
        conversationId: receipt.conversationId,
        readerId: user.id,
        readAt: receipt.readAt.toISOString(),
      };
      io.to(userRoom(receipt.otherUserId)).emit(
        proto.EV_CONVERSATION_READ_FANOUT,
        event,
      );
      socket.to(userRoom(user.id)).emit(proto.EV_CONVERSATION_READ_FANOUT, event);
    } catch (err) {
      if (!(err instanceof chat.ChatError)) {
        console.error("[conversation:read]", user.id, err);
      }
    }
  });

  socket.on(proto.EV_TYPING, async (raw: unknown) => {
    const parsed = typingSchema.safeParse(raw);
    if (!parsed.success) return;
    if (!(await limiter(`chat-typing:${user.id}`, 120, 240))) return; // RT-01
    const { conversationId, typing } = parsed.data;
    try {
      let partnerId = membership.get(conversationId);
      if (!partnerId) {
        const conversation = await chatDb(user.id, (tx) =>
          chat.getConversationForUser(tx, user.id, conversationId),
        );
        partnerId = chat.otherParticipantId(conversation, user.id);
        membership.set(conversationId, partnerId);
      }
      const event: proto.TypingEvent = {
        conversationId,
        userId: user.id,
        typing,
      };
      io.to(userRoom(partnerId)).volatile.emit(proto.EV_TYPING_FANOUT, event);
    } catch {
    }
  });

  socket.on("disconnect", () => {
    const wentOffline = presence.remove(user.id, socket.id);
    if (!wentOffline) return;
    void chatDb(user.id, (tx) => chat.listPartnerIds(tx, user.id))
      .then((partnerIds) => {
        const update: proto.PresenceUpdateEvent = {
          userId: user.id,
          online: false,
        };
        for (const pid of partnerIds) {
          io.to(userRoom(pid)).emit(proto.EV_PRESENCE_UPDATE, update);
        }
      })
      .catch((err) => console.error("[disconnect-presence]", user.id, err));
  });
});

httpServer.listen(env.port, () => {
  console.log(`[realtime] listening on :${env.port}`);
  console.log(`[realtime] allowed origins: ${env.allowedOrigins.join(", ")}`);
  console.log(
    `[realtime] db driver: ${process.env.DATABASE_DRIVER === "pg" ? "node-postgres pool" : "neon serverless (set DATABASE_DRIVER=pg for long-running deploys)"}`,
  );
});

async function shutdown(signal: string) {
  console.log(`[realtime] ${signal} — shutting down`);
  io.close();
  httpServer.close();
  try {
    await disconnectDb();
  } finally {
    process.exit(0);
  }
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
