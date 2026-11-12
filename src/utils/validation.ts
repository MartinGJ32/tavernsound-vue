/**
 * Reglas de validación compartidas entre UI y (más adelante) las funciones
 * serverless. Vivir en un solo lugar evita que la regla "qué es un ID de
 * YouTube válido" se desincronice entre frontend y backend con el tiempo.
 *
 * Importante: validar acá es una capa de UX (feedback inmediato, sin
 * esperar un roundtrip). La validación que de verdad importa para
 * seguridad es la que corre server-side antes de aceptar un RoomCommand —
 * nunca hay que confiar en que el cliente ya validó.
 */
export const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export const MAX_QUEUE_SIZE = 100;
export const MAX_CHAT_MESSAGE_LENGTH = 300;
export const MAX_USER_NAME_LENGTH = 30;

export function isValidYouTubeId(value: string): boolean {
  return YOUTUBE_VIDEO_ID_PATTERN.test(value);
}

/**
 * Acepta tanto un ID pelado como una URL completa. Los cuatro patrones son
 * los mismos que ya usaba `extractVideoId` en la app original — se portan
 * tal cual para no perder soporte de ningún formato de link que la gente
 * ya está acostumbrada a pegar (watch?v=, youtu.be/, /shorts/, /embed/).
 */
export function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (isValidYouTubeId(trimmed)) return trimmed;

  const patterns = [/[?&]v=([^&]+)/, /youtu\.be\/([^?&/]+)/, /youtube\.com\/shorts\/([^?&/]+)/, /youtube\.com\/embed\/([^?&/]+)/];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function sanitizeText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}
