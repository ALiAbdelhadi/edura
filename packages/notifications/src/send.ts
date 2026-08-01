import { allChannels, getChannel } from "./channels/registry";
import type {
  ChannelId,
  ChannelResult,
  NotificationResult,
  Recipient,
  TemplateData,
  TemplateId,
} from "./types";

export type SendOptions = {
  /**
   * Restrict this send to specific channels. Omit for "every enabled channel
   * that supports this template" — the normal case.
   */
  channels?: ChannelId[];
};

/**
 * Send one templated notification.
 *
 * NEVER THROWS. Every call site in this codebase is downstream of something
 * that already committed — a registration, a password reset, settled money.
 * A notification failure is an operational fact to record, never a reason to
 * fail the thing that caused it. Callers that care read `delivered`.
 *
 * Channels run CONCURRENTLY and independently: a dead SMTP host does not delay
 * or suppress any other channel.
 */
export async function send<T extends TemplateId>(
  template: T,
  to: Recipient,
  data: TemplateData<T>,
  opts: SendOptions = {},
): Promise<NotificationResult> {
  const selected = opts.channels
    ? opts.channels.map((id) => getChannel(id)).filter((c): c is NonNullable<typeof c> => !!c)
    : allChannels();

  const results = await Promise.all(
    selected.map(async (channel): Promise<ChannelResult> => {
      // "We chose not to" and "we tried and it broke" stay distinguishable —
      // an off channel and an unsupported template both read `skipped`, and
      // neither should ever page anyone.
      if (!channel.isEnabled()) return { channel: channel.id, status: "skipped" };
      if (!channel.supports(template)) return { channel: channel.id, status: "skipped" };
      try {
        return await channel.send(template, to, data);
      } catch (err) {
        // A channel that breaks its never-throws contract is contained here
        // rather than taking the caller down with it.
        return {
          channel: channel.id,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  return {
    template,
    results,
    delivered: results.some((r) => r.status === "sent"),
  };
}

/**
 * Fire-and-forget wrapper for post-commit hooks. Swallows everything and logs
 * a single line naming the template and the channel outcomes — enough to tell
 * "nobody was emailed" from "email was attempted and rejected" in a log search,
 * with no recipient address or message body written to the log.
 */
export function sendInBackground<T extends TemplateId>(
  template: T,
  to: Recipient,
  data: TemplateData<T>,
  opts: SendOptions = {},
): void {
  void send(template, to, data, opts)
    .then((res) => {
      const failed = res.results.filter((r) => r.status === "failed");
      if (failed.length > 0) {
        console.error(
          `[notifications] ${template}: ${failed.map((f) => `${f.channel}=${f.error ?? "failed"}`).join(", ")}`,
        );
      }
    })
    .catch((err) => {
      console.error(`[notifications] ${template}: dispatcher error`, err);
    });
}
