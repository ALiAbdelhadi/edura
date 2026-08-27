export type SettleNotification = {
  studentId: string;
  recipients?: string[];
  type: "payment_recorded";
  title: string;
  body: string;
  data: Record<string, unknown>;
};
