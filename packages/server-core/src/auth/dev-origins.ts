export function devLocalhostOrigins(): string[] {
  if (process.env.NODE_ENV === "production") return [];
  return [
    "http://localhost:*",
    "http://127.0.0.1:*",
    "http://localhost",
    "http://127.0.0.1",
  ];
}
