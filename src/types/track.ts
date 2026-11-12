/**
 * Una canción de YouTube, dentro de una cola o sonando en este momento.
 *
 * `id` es el ID de video de YouTube (11 caracteres). La app confía en que
 * ya pasó por `isValidYouTubeId` antes de llegar a un `Track` — eso se
 * valida en los bordes (comandos de la API, formularios), no acá.
 */
export interface Track {
  id: string;
  title: string;
  thumbnailUrl: string;
}

/**
 * Guarda de tipo para datos que vienen de la red (eventos realtime,
 * respuestas de API) y todavía no confirmamos que tengan esta forma.
 */
export function isTrack(value: unknown): value is Track {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.thumbnailUrl === "string"
  );
}
