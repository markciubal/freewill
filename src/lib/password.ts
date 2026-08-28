import bcrypt from "bcryptjs";

const COST = 12;

export function hashPassword(password: string) {
  return bcrypt.hash(password, COST);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

// Used to keep login timing flat when the username does not exist.
export const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO5f5Xh8G3tYV3rM7QW9y6Jx1Y5Z2gq9K";
