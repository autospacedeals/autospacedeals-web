// US phone numbers for customer and broker accounts. Accepts however people
// type them ("949-555-1234", "(949) 555 1234", "+1 949.555.1234") and
// stores one consistent "(949) 555-1234" format. Client-safe.
export function normalizeUsPhone(raw: unknown): string | null {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  // Area code and exchange can't start with 0 or 1.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export const PHONE_ERROR = "Enter a valid 10-digit US phone number, e.g. 949-555-1234.";
