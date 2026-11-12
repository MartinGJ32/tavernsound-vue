/**
 * Limitador de ventana deslizante, en memoria, para un solo "emisor" (en
 * la práctica: uno por socket, ver server/socket.ts). Sin dependencias
 * ni estado global: cada instancia recuerda solo los instantes de sus
 * propios eventos recientes.
 *
 * El reloj se inyecta (`now`) para poder probar el comportamiento sin
 * esperar tiempo real.
 */
export function createSlidingWindowLimiter(max: number, windowMs: number, now: () => number = Date.now) {
  let hits: number[] = [];

  return {
    /** Devuelve true y registra el evento si todavía hay cupo en la ventana; false si ya se superó. */
    allow(): boolean {
      const current = now();
      hits = hits.filter((timestamp) => current - timestamp < windowMs);
      if (hits.length >= max) return false;
      hits.push(current);
      return true;
    },
  };
}
