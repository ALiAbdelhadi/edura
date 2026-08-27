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
  channels?: ChannelId[];
};

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
      if (!channel.isEnabled()) return { channel: channel.id, status: "skipped" };
      if (!channel.supports(template)) return { channel: channel.id, status: "skipped" };
      try {
        return await channel.send(template, to, data);
      } catch (err) {
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
