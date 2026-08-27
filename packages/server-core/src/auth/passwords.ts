import bcrypt from "bcryptjs";

export const BCRYPT_COST = 10;

export const DUMMY_HASH =
  "$2b$10$wrFkXDBP7l73KSdBAgzutOaGQi9FZfAP/69GAeqzK0AiUDGWqhpsW";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(data: {
  hash: string;
  password: string;
}): Promise<boolean> {
  return bcrypt.compare(data.password, data.hash);
}
