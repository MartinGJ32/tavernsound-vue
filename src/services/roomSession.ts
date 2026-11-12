/**
 * Recuerda quién somos en una sala, para sobrevivir a un refresh de
 * página sin tener que volver a "unirnos" (lo que nos daría un userId
 * nuevo y, si éramos el host, nos haría perder ese rol — ver Fase 8 en
 * el README).
 *
 * Usa `sessionStorage` a propósito, no `localStorage`: alcanza con
 * sobrevivir a un refresh, y así una pestaña cerrada no deja una sesión
 * de sala "colgada" para siempre. Cada pestaña tiene la suya.
 *
 * Nota de seguridad: acá se guarda el token secreto. Es el mismo riesgo
 * que cualquier token de sesión en el navegador — si hubiera un XSS, podría
 * leerse. Por eso importa que la app no use `v-html` ni nada similar (se
 * verificó que no hay ninguno en `src/`).
 */
export interface StoredRoomSession {
  /** Credencial secreta — es lo que permite retomar el rol (incluido el de host) tras un refresh. */
  token: string;
  /** Identidad pública derivada del token (ver server/lib/auth.ts). */
  userId: string;
  userName: string;
}

function storageKey(code: string): string {
  return `tavernsound:session:${code.toUpperCase()}`;
}

function isStoredRoomSession(value: unknown): value is StoredRoomSession {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.token === "string" &&
    typeof candidate.userId === "string" &&
    typeof candidate.userName === "string"
  );
}

export function saveRoomSession(code: string, session: StoredRoomSession): void {
  try {
    sessionStorage.setItem(storageKey(code), JSON.stringify(session));
  } catch {
    // Si el navegador bloquea sessionStorage (modo privado estricto,
    // cuota llena), no es crítico: en el peor caso un refresh vuelve a
    // pedir el nombre, no se rompe nada más.
  }
}

export function loadRoomSession(code: string): StoredRoomSession | null {
  try {
    const raw = sessionStorage.getItem(storageKey(code));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredRoomSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearRoomSession(code: string): void {
  try {
    sessionStorage.removeItem(storageKey(code));
  } catch {
    // no-op: si no se pudo guardar, tampoco hay nada que limpiar.
  }
}
