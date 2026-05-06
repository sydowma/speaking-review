// Stores the API auth token in localStorage; accepts ?token= on first load.

const KEY = "speaking-review.token";

export function captureTokenFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  const t = params.get("token");
  if (t) {
    localStorage.setItem(KEY, t);
    params.delete("token");
    const newSearch = params.toString();
    const url = window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
    window.history.replaceState(null, "", url);
  }
}

export function getToken(): string | null {
  return localStorage.getItem(KEY);
}

export function clearToken(): void {
  localStorage.removeItem(KEY);
}

export function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}
