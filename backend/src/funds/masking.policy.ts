/** BR02: convert PII to public-safe values before returning statement data. */
export class MaskingPolicy {
  static email(value: string | null): string | null {
    if (!value) return null;
    const at = value.lastIndexOf('@');
    if (at < 1 || at === value.length - 1) return '***';
    return `${value[0]}***${value.slice(at)}`;
  }

  /** Keep the first three and last two digits, as specified by BR02. */
  static phone(value: string | null): string | null {
    if (!value) return null;
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 5) return '*'.repeat(digits.length);
    return `${digits.slice(0, 3)}${'*'.repeat(digits.length - 5)}${digits.slice(-2)}`;
  }

  /** Mask common email and phone representations embedded in free text. */
  static maskFreeText(value: string | null): string {
    if (!value) return '';
    return value
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (email) => this.email(email) ?? '***')
      .replace(/\+?\d[\d\s().-]*\d/g, (phone) => {
        const digitCount = phone.replace(/\D/g, '').length;
        return digitCount >= 9 && digitCount <= 15 ? this.phone(phone) ?? '' : phone;
      });
  }
}
