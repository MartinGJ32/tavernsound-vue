/**
 * Alfabeto sin caracteres visualmente ambiguos (sin 0/O, 1/I/L). Un código
 * de sala se lee en voz alta o se copia a mano más seguido de lo que
 * parece, y "¿esa es una I mayúscula o un uno?" es una mala primera
 * experiencia para algo que existe justamente para ser fácil de compartir.
 */
const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** Valida el formato canónico (mayúsculas). Normalizá con .toUpperCase() antes de llamar esto si el valor viene de un usuario. */
export function isValidRoomCode(value: string): boolean {
  return ROOM_CODE_PATTERN.test(value);
}
