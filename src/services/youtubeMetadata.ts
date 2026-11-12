/**
 * Trae el título de un video desde el oEmbed público de YouTube. Se llama
 * desde el navegador (como en la app original) en vez de desde el
 * backend: no requiere API key, y evitamos que cada función serverless
 * tenga que salir a internet solo para esto.
 *
 * Si falla (video privado, sin conexión, YouTube caído), devolvemos un
 * título genérico en vez de bloquear el "agregar canción" — perder el
 * título real no es motivo para no poder sumar el video a la cola.
 */
export async function fetchYouTubeTitle(videoId: string): Promise<string> {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(url);
    if (!response.ok) return "Video";

    const data: unknown = await response.json();
    const title = data && typeof data === "object" && "title" in data ? (data as { title: unknown }).title : null;
    return typeof title === "string" && title.trim() ? title : "Video";
  } catch {
    return "Video";
  }
}
