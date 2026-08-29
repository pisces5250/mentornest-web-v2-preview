/** 讀取 edge 核發、可由 browser 回送的 double-submit CSRF cookie。 */
export function browserCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const row = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith("mn_csrf="));
  return row ? decodeURIComponent(row.slice("mn_csrf=".length)) : "";
}
