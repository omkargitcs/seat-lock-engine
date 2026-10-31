import crypto from "crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid misreads at the door

export const generateReference = () => {
  const bytes = crypto.randomBytes(8);
  let out = "SD-";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
};
