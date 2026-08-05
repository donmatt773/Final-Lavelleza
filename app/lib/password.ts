import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;

export function isPasswordHash(value: string) {
  return /^\$2[aby]\$\d{2}\$/.test(value);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, storedValue: string) {
  if (isPasswordHash(storedValue)) {
    return bcrypt.compare(password, storedValue);
  }

  // Backward compatibility for legacy plain-text records.
  return password === storedValue;
}
