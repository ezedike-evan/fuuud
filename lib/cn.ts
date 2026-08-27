/** Join class names, dropping anything falsy. No dependency needed for this. */
export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
