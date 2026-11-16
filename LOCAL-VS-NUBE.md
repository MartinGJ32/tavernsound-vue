# Local vs. servidor publicado: cómo iniciarlo, ver sus parámetros y compararlos

La aplicación usa el mismo código del frontend y del backend en los distintos entornos. Lo que cambia es cómo se inicia, qué variables recibe y qué servicios tiene alrededor.

En esta guía explico cómo ejecutar TavernSound en desarrollo, cómo probar una versión compilada en mi propia máquina y cómo se publica actualmente para acceder desde Internet. También dejo algunos comandos para revisar la configuración y detectar diferencias.

---

## 1. Cómo está armado cada entorno

```text
LOCAL · desarrollo
Navegador → Vite :5173 → proxy → Node/Express :3000 → memoria o Redis
             (frontend)          (API y Socket.IO)

LOCAL · producción
Navegador → Node/Express :3000 → frontend compilado + API + Socket.IO
                              → memoria o Redis

SERVIDOR PUBLICADO
Navegador → HTTPS → Cloudflare Tunnel → cloudflared
                                      → TavernSound :3000
                                      → Redis (Upstash)
```

| | Local · desarrollo | Local · producción | Servidor publicado |
|---|---|---|---|
| Frontend | Vite, con recarga en caliente | Express sirve `dist/` | Express sirve `dist/` |
| Acceso | `http://localhost:5173` | `http://localhost:3000` | URL HTTPS de Cloudflare Tunnel |
| `NODE_ENV` | desarrollo o sin definir | `production` | `production` |
| Procesos principales | Vite y Node | Node | TavernSound y `cloudflared`, administrados por systemd |
| HTTPS | no | no | sí, desde Cloudflare |
| Persistencia | memoria o Redis | memoria o Redis | Redis (Upstash) |
| Acceso desde Internet | no, salvo que se configure aparte | no, salvo que se configure aparte | sí, mediante el túnel |
| Reinicio automático | no | no | systemd reinicia los servicios si fallan |

La modalidad local de producción sirve para probar el frontend compilado junto con el backend, usando un solo proceso. El servidor publicado agrega Cloudflare Tunnel para recibir conexiones HTTPS desde Internet y reenviarlas al servicio local.

**Importante:** el servidor publicado sigue siendo mi PC con Fedora. Cloudflare Tunnel permite acceder desde Internet sin configurar redirección de puertos en el router, pero no convierte esa PC en un VPS.

---

## 2. Iniciar TavernSound en local

Requisito: Node.js 22. La versión utilizada durante el desarrollo fue Node.js 22.23.1.

### 2.1 Primera instalación

Desde la carpeta del proyecto:

```bash
npm run setup
```

Este comando prepara las dependencias y el archivo `.env` a partir de `.env.example`.

No hay que subir `.env` a GitHub. Ese archivo puede contener credenciales privadas.

### 2.2 Modo desarrollo: dos terminales

En una terminal inicio el backend:

```bash
npm run dev:server
```

En otra inicio el frontend:

```bash
npm run dev
```

Después abro:

```text
http://localhost:5173
```

En este modo Vite sirve la interfaz y reenvía las solicitudes de la API y Socket.IO al backend que escucha en el puerto 3000. Por eso, para entrar desde el navegador uso el puerto 5173 y no el 3000.

Para probar dos participantes puedo abrir el mismo enlace de sala en otra pestaña o en una ventana de incógnito. Cada pestaña mantiene su propia sesión.

Algunas cosas a tener en cuenta:

- Vite actualiza el frontend cuando guardo cambios.
- El backend también se reinicia al modificar archivos. Si estoy usando almacenamiento en memoria, ese reinicio elimina las salas que estaban creadas.
- Si modifico `.env`, tengo que reiniciar el backend para que tome los cambios.
- El proxy de Vite está configurado para apuntar al backend en el puerto 3000.

### 2.3 Modo producción en local: un proceso

Primero compilo el frontend:

```bash
npm run build
```

Después inicio el servidor con `NODE_ENV=production`:

```bash
NODE_ENV=production npm run start:server
```

En Fedora y otras distribuciones Linux este comando funciona directamente desde Bash. En PowerShell se puede usar:

```powershell
$env:NODE_ENV="production"; npm run start:server
```

La aplicación queda disponible en:

```text
http://localhost:3000
```

En este modo Express sirve los archivos compilados de `dist/` y también atiende la API y las conexiones de Socket.IO.

### 2.4 Usar Redis también desde local

Si quiero probar persistencia real, configuro las variables de Upstash en `.env`:

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Los valores reales no deben publicarse ni compartirse. Después de modificar el archivo, reinicio el backend.

Si la conexión funciona, el servidor informa que está usando `upstash`. Si no hay configuración de Redis, puede utilizar almacenamiento en memoria.

### 2.5 Conflictos de puerto

El backend utiliza el puerto 3000 por defecto. La aplicación legacy también puede utilizar ese puerto, así que no conviene iniciar ambos servidores al mismo tiempo.

Si algo no responde como espero, puedo ejecutar:

```bash
npm run diagnose
```

---

## 3. Revisar la configuración

Hay varias formas de comprobar qué configuración está utilizando TavernSound.

### 3.1 `npm run diagnose`

Este comando muestra los parámetros efectivos del entorno: combina las variables del sistema, el archivo `.env` y los valores predeterminados.

```bash
npm run diagnose
```

Entre otros datos, permite revisar:

- El modo de ejecución.
- El puerto del servidor.
- Si existe el frontend compilado en `dist/`.
- El tipo de almacenamiento configurado.
- El estado de la conexión con Redis.
- Si hay parámetros que conviene revisar.

El diagnóstico no debería mostrar contraseñas ni tokens. Para Redis muestra información de identificación no secreta, no el token de acceso.

También tiene estas opciones:

```bash
npm run diagnose -- --no-check
npm run diagnose -- --json
```

`--no-check` evita probar la conexión con Redis. `--json` devuelve los datos comparables en formato JSON.

### 3.2 Consultar `/api/health`

El endpoint de salud permite comprobar el estado del proceso sin entrar a la máquina donde corre el servidor.

En local:

```bash
curl -s http://localhost:3000/api/health
```

La respuesta informa datos como el modo de ejecución, el almacenamiento activo y el tiempo que lleva funcionando el proceso. No devuelve credenciales.

Cuando la aplicación está publicada, puedo consultar el mismo endpoint usando la URL HTTPS vigente del túnel:

```bash
curl -s https://URL-ACTUAL-DEL-TUNEL/api/health
```

La URL del Quick Tunnel puede cambiar, así que no conviene dejar una dirección temporal escrita como si fuera permanente.

### 3.3 Dónde se configuran los parámetros

| Parámetro | Valor predeterminado o función | Dónde se configura |
|---|---|---|
| `NODE_ENV` | Si no se define, el servidor utiliza el modo de desarrollo | Shell o unidad systemd |
| `PORT` | 3000 | `.env` o variable de entorno |
| `UPSTASH_REDIS_REST_URL` | Vacío si no se configura Redis | `.env` |
| `UPSTASH_REDIS_REST_TOKEN` | Vacío si no se configura Redis | `.env`; es secreto |
| `HOST_REASSIGNMENT_GRACE_MS` | 5000 ms | `.env` o variable de entorno |
| `CREATE_ROOM_LIMIT` | 10 creaciones cada 10 minutos por IP | `.env` o variable de entorno |
| `trust proxy` | Se deriva del modo de ejecución | Configuración del servidor |
| Límites de API, chat y mensajes | Están definidos en el código | Archivos de configuración del backend |

Los límites que están definidos en el código no se cambian desde `.env`. Si se modifican, hay que actualizar la versión desplegada.

### 3.4 Revisar los servicios en Fedora

En el servidor publicado, TavernSound y Cloudflare Tunnel se ejecutan como servicios de systemd.

Para revisar su estado:

```bash
systemctl status tavernsound
systemctl status cloudflared
```

Para ver los registros de TavernSound:

```bash
journalctl -u tavernsound -n 50 --no-pager
```

Para revisar los registros de Cloudflare Tunnel:

```bash
journalctl -u cloudflared -n 50 --no-pager
```

También puedo consultar la configuración de las unidades:

```bash
systemctl cat tavernsound
systemctl cat cloudflared
```

Antes de compartir capturas o salidas de estos comandos, tengo que revisar que no aparezcan tokens, rutas personales, direcciones o URLs privadas.

---

## 4. Comparar los entornos

La comparación sirve para encontrar diferencias de configuración, no para esperar que todos los valores sean idénticos. Por ejemplo, es normal que el entorno de desarrollo use Vite y que el servidor publicado use el frontend compilado.

### 4.1 Comparar parámetros en formato JSON

En mi máquina puedo guardar el diagnóstico local:

```bash
NODE_ENV=production npm run -s diagnose -- --json > local.json
```

Si tengo otro entorno al que puedo acceder por SSH, también puedo ejecutar el diagnóstico remoto y guardar su salida. En este proyecto, el servidor publicado actual está en mi PC, por lo que no corresponde usar un comando SSH contra una VM externa.

Para comparar dos archivos JSON:

```bash
diff local.json servidor.json
```

Conviene ejecutar el diagnóstico con los mismos parámetros en ambos entornos. De lo contrario, algunas diferencias pueden deberse al comando utilizado y no a la configuración real.

### 4.2 Qué diferencias pueden ser normales

| Parámetro | Cómo interpretar una diferencia |
|---|---|
| `mode` | Es normal que desarrollo y producción tengan modos distintos. El servidor publicado debería estar en `production`. |
| `trustProxy` | Puede cambiar según el modo y la presencia de un proxy. En el servidor publicado hay un túnel de Cloudflare delante de la aplicación. |
| `store` | Es normal que local use `memory` y el servidor publicado use `upstash`. Si el servidor publicado usa memoria, hay que revisar la configuración de Redis. |
| `frontendBuilt` | En desarrollo puede no estar compilado. Para servir la aplicación como producción tiene que existir `dist/`. |
| `storeConnection` | Si aparece un error, hay que revisar la conexión y las variables de Redis. |
| `nodeMajor` | Conviene mantener versiones compatibles de Node.js en los entornos. |
| `port` | El backend utiliza el puerto 3000 por defecto. Si se cambia, también hay que revisar cómo se conecta `cloudflared`. |
| `hostReassignmentGraceMs` y `createRoomLimit` | Si difieren, probablemente se configuró un valor distinto en `.env` o en el entorno del proceso. |
| Límites definidos en el código | Si difieren, puede que los entornos estén ejecutando versiones diferentes del proyecto. |

### 4.3 Comparación rápida con el endpoint de salud

Puedo consultar el endpoint local y el publicado:

```bash
curl -s http://localhost:3000/api/health
curl -s https://URL-ACTUAL-DEL-TUNEL/api/health
```

Así puedo comprobar qué modo y qué almacenamiento informa cada proceso.

---

## 5. Probar el funcionamiento en ambos entornos

Además de revisar parámetros, hay que comprobar que la aplicación funcione.

### 5.1 Prueba automatizada de Socket.IO

El proyecto incluye un script de pruebas manuales que conecta clientes reales de Socket.IO y verifica distintas funciones del servidor, como la conexión, las salas, el chat, la sincronización y la reasignación del anfitrión.

Para ejecutarlo contra el servidor local:

```bash
node scripts/manual-socket-test.mjs
```

Para probar el servidor publicado:

```bash
TEST_BASE_URL=https://URL-ACTUAL-DEL-TUNEL node scripts/manual-socket-test.mjs
```

La prueba crea una sala, por lo que cuenta dentro del límite de creación de salas. Si cambio temporalmente algún parámetro del servidor para hacer una prueba, tengo que asegurarme de que el script utilice valores compatibles.

### 5.2 Prueba desde el navegador

También es importante probar la aplicación desde el navegador, porque no todo se puede validar con un script.

La secuencia que uso es:

1. Crear una sala y comprobar que aparezca el código y la identificación de anfitrión.
2. Abrir el enlace de la sala en otra pestaña o ventana de incógnito.
3. Entrar con otro nombre.
4. Agregar un video a la cola desde la sesión del anfitrión.
5. Comprobar que el video aparezca en la otra sesión.
6. Reproducirlo y comprobar que ambas sesiones sigan la reproducción.
7. Pausar y cambiar la posición para verificar la sincronización.
8. Enviar mensajes por el chat.
9. Recargar la pestaña del anfitrión y comprobar que conserve su sesión.

Para probar el acceso desde Internet, conviene abrir la URL HTTPS desde un dispositivo que no esté conectado a la misma red local, por ejemplo usando datos móviles. Así se comprueba que el túnel permite llegar al servidor desde fuera de la LAN.

---

## 6. Problemas frecuentes

| Síntoma | Qué revisar |
|---|---|
| Las salas desaparecen al reiniciar el backend | Si el servidor está usando memoria. Para conservarlas se necesita configurar Redis. |
| La aplicación no abre desde Internet | Revisar que TavernSound y `cloudflared` estén activos y que el túnel esté conectado. |
| Abre la página, pero no funcionan el chat o la cola en vivo | Revisar los registros de Socket.IO y de `cloudflared`. |
| Aparece un error 429 demasiado rápido | Revisar el modo de ejecución, la configuración del proxy y los límites de solicitudes. |
| El reproductor de YouTube muestra un error | Revisar la carga del reproductor y los encabezados relacionados con `Referrer-Policy`. |
| La opción para copiar el enlace no funciona | El portapapeles requiere un contexto seguro, como HTTPS o localhost. |
| El servicio no responde después de un cambio | Revisar los registros y reiniciar el servicio correspondiente. |
| Modifiqué `.env` y no cambió la configuración | Las variables se leen al iniciar el proceso; hay que reiniciarlo. |
| Las salas de local y del servidor publicado aparecen compartidas | Los dos entornos probablemente están usando la misma base de Redis. Para separarlos, se necesita usar bases o configuraciones distintas. |

---

## 7. Qué aprendí al comparar los entornos

La aplicación no cambia de código por estar publicada, pero sí cambia el contexto en el que se ejecuta. En desarrollo, Vite sirve el frontend y se comunica con el backend mediante un proxy. En producción, Express sirve los archivos compilados y atiende las conexiones de la aplicación.

También comprobé que publicar un servicio no es solamente iniciar Node.js. Hay que tener en cuenta la persistencia de los datos, el proceso que mantiene el servidor activo, el acceso desde Internet, HTTPS y la configuración de seguridad.

En mi caso, la publicación se hizo desde una PC con Fedora usando systemd, Upstash y Cloudflare Tunnel. Esto permite acceder a TavernSound desde fuera de la red local sin abrir puertos en el router. Sin embargo, sigue siendo un servidor alojado en mi propia máquina y depende de que esté encendida y conectada a Internet. No es un VPS.

Por eso, la comparación entre local y servidor publicado sirve para entender qué partes pertenecen al código de la aplicación y cuáles dependen de la infraestructura donde se ejecuta.