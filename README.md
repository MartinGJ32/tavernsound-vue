# TavernSound

TavernSound es una aplicación web colaborativa para escuchar música de YouTube sincronizada con amigos, en salas independientes. Cada sala tiene su propia reproducción, cola de canciones y chat en tiempo real, para que varias personas puedan compartir música sin interferir con otras salas.

El proyecto utiliza Vue 3 y TypeScript en el frontend, y un backend propio con Node.js, Express y Socket.IO.

## Estado del proyecto

La aplicación original estaba desarrollada con HTML, CSS, JavaScript vanilla, Express y Socket.IO. Esa versión se conserva en [`legacy/`](./legacy) y se utilizó como referencia durante la migración.

La versión actual está desarrollada con Vue 3, TypeScript y Tailwind CSS 4. La migración principal está terminada y la aplicación funciona localmente.

### Arquitectura e infraestructura actual

Durante el desarrollo se evaluaron distintas alternativas de infraestructura. Inicialmente se consideró utilizar Ably y Vercel KV, pero finalmente se optó por un backend propio con Socket.IO y Redis mediante Upstash.

También se planificó un despliegue en Oracle Cloud Infrastructure (OCI), pero no se pudo completar el alta en ese proveedor. Como alternativa, se configuró una computadora doméstica con Fedora Linux como servidor y Cloudflare Tunnel para permitir el acceso desde Internet sin configurar redirección de puertos en el router.

La arquitectura que se encuentra funcionando es:

```text
                 Internet
                    |
              Cloudflare HTTPS
                    |
             Cloudflare Tunnel
                    |
                cloudflared
                    |
              Fedora Linux
                    |
           TavernSound (Node.js)
                    |
               Upstash Redis
```

Actualmente:

- **Sistema servidor:** Fedora Linux.
- **Backend:** Node.js, Express y Socket.IO.
- **Puerto interno:** 3000 por defecto.
- **Persistencia:** Redis mediante Upstash REST.
- **Acceso externo:** Cloudflare Quick Tunnel.
- **Administración de procesos:** systemd.

Se comprobó el acceso público desde un dispositivo conectado mediante una red móvil, fuera de la red local.

Cloudflare Quick Tunnel genera una URL temporal aleatoria bajo `trycloudflare.com`. La URL puede cambiar cuando se reinicia el túnel. No se configuró un dominio propio ni un Named Tunnel.

**Esta infraestructura no es una VPS:** el servidor continúa ejecutándose en una computadora física doméstica. Cloudflare Tunnel permite acceder al servicio desde Internet, pero no reemplaza el alojamiento en un proveedor externo.

### Próxima etapa: virtualización

Como siguiente paso se evaluó crear una máquina virtual con Ubuntu Server 24.04 dentro de Fedora mediante KVM, QEMU y virt-manager. El objetivo es practicar la administración de un servidor Linux independiente, incluyendo SSH, firewall, systemd y Caddy.

Esta etapa todavía está pendiente de completar y verificar. Una máquina virtual local no equivale a una VPS comercial, ya que continúa dependiendo del hardware y de la conexión de la computadora anfitriona.

## Stack tecnológico

- **Frontend:** Vue 3 (Composition API), TypeScript, Vite, Tailwind CSS 4, Vue Router y Pinia.
- **Backend:** Node.js en un único proceso persistente dentro de `server/`. Express se utiliza para la API REST y Socket.IO para la comunicación en tiempo real.
- **Persistencia:** Redis mediante Upstash REST para almacenar el estado de las salas. Si no hay credenciales configuradas, el sistema utiliza almacenamiento en memoria.
- **Reproducción:** YouTube IFrame API.
- **Testing:** Vitest para probar la lógica de negocio y los módulos que no necesitan infraestructura externa.
- **Servidor:** Fedora Linux y systemd.
- **Acceso externo:** Cloudflare Tunnel.

## Desarrollo local

Para facilitar la instalación inicial preparé un script que instala las dependencias del frontend, del servidor y de la aplicación original, además de generar el archivo `.env` local.

```bash
npm run setup
```

Una vez instalado todo, necesito ejecutar dos procesos en paralelo.

Terminal 1:

```bash
npm run dev:server
```

Terminal 2:

```bash
npm run dev
```

El backend se ejecuta por defecto en `http://localhost:3000` y el frontend en `http://localhost:5173`.

Vite redirige las peticiones de `/api` y `/socket.io` hacia el servidor.

Para acceder a la aplicación abro:

**http://localhost:5173**

### Otros comandos disponibles

```bash
npm run build          # Type-check y compilación de producción en dist/
npm run preview        # Vista previa del build de producción (solo frontend)
npm run type-check     # Verificación de tipos sin generar el build
npm run start:server   # Ejecuta el servidor sin modo watch
npm test               # Ejecuta los tests con Vitest
npm run diagnose       # Muestra los parámetros efectivos del entorno
npm run dev:legacy     # Ejecuta la aplicación original
```

El comando `npm run dev:legacy` no debe ejecutarse al mismo tiempo que `npm run dev:server` si ambos utilizan el puerto 3000.

### Funcionamiento en producción

En producción (`NODE_ENV=production`) el proyecto funciona con un único proceso Node.js:

```bash
npm run build
NODE_ENV=production npm run start:server
```

Primero compilo el frontend y después inicio el servidor. Express se encarga de servir la API, Socket.IO y los archivos estáticos generados en `dist/`.

Esta arquitectura permite ejecutar el frontend y el backend desde el mismo proceso, utilizando un único puerto interno.

## Despliegue actual en Fedora

En la computadora que funciona como servidor, TavernSound se ejecuta como un servicio de systemd. Esto permite iniciar, detener, reiniciar y consultar el estado del backend sin depender de una terminal abierta.

Cloudflare Tunnel también se administra mediante un servicio de systemd. Está configurado para conectarse al backend local en el puerto correspondiente.

Comandos de administración:

```bash
sudo systemctl start tavernsound
sudo systemctl stop tavernsound
sudo systemctl restart tavernsound
systemctl status tavernsound
```

Para Cloudflare Tunnel:

```bash
sudo systemctl start cloudflared
sudo systemctl stop cloudflared
sudo systemctl restart cloudflared
systemctl status cloudflared
```

Para consultar los registros:

```bash
sudo journalctl -u tavernsound -n 50 --no-pager
sudo journalctl -u cloudflared -n 50 --no-pager
```

Los servicios están configurados para recuperarse ante determinados fallos y para iniciar con el sistema.

### Acceso público mediante Cloudflare Tunnel

Cloudflare Tunnel permite publicar el servicio sin configurar redirección de puertos entrantes en el router. El programa `cloudflared` establece una conexión saliente hacia Cloudflare y permite que las solicitudes recibidas por la URL pública lleguen al backend local.

Se utiliza la modalidad Quick Tunnel. Su principal limitación es que genera una URL aleatoria que puede cambiar al reiniciar el túnel. No se incluye la URL pública actual en este README porque puede dejar de ser válida y no es necesaria para documentar la arquitectura.

### Automatización de los servicios

También se preparó un script local para iniciar y detener TavernSound y Cloudflare Tunnel desde un acceso directo del escritorio.

El script alterna entre estos estados:

- Si los servicios están activos, los detiene.
- Si están detenidos, inicia primero TavernSound y después Cloudflare Tunnel.
- Intenta obtener la URL pública del túnel desde los registros del servicio y mostrarla en la terminal.

La visualización de la URL después de cada inicio todavía requiere pruebas adicionales para confirmar que funciona de manera consistente.

## Persistencia de salas

Inicialmente TavernSound utilizaba almacenamiento en memoria. Esto permitía conservar el estado de las salas mientras el backend permanecía activo, pero los datos se perdían al reiniciar el proceso.

Para resolverlo se configuró Redis mediante Upstash REST.

Las variables necesarias se documentan en [`.env.example`](./.env.example). Sus valores son credenciales privadas y no deben incluirse en el repositorio:

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

La aplicación carga las variables desde `.env` mediante su propio mecanismo de dotenv. Cuando las credenciales están configuradas, el servidor utiliza Upstash. Si no están disponibles, utiliza el almacenamiento en memoria.

Para comprobar el estado del backend se puede consultar el endpoint local `/api/health`. La respuesta informa si el servidor está funcionando y qué mecanismo de almacenamiento está utilizando, sin necesidad de publicar datos de conexión.

## Sincronización y reproductor de YouTube

TavernSound utiliza Socket.IO para comunicar los cambios de reproducción entre los participantes de una sala.

El sistema permite sincronizar:

- Inicio y pausa.
- Reanudación.
- Posición de reproducción.
- Avance de canciones.
- Cambios en la cola.

Durante las pruebas iniciales encontré un problema en la inicialización de YouTube IFrame API. El reproductor se creaba sin un ID real de video y la aplicación no esperaba a que YouTube confirmara que estaba listo.

Lo solucioné modificando `src/composables/usePlayer.ts` para recibir el ID real del video y esperar el evento `onReady`. También ajusté `src/components/MusicPlayer.vue` para inicializar el reproductor cuando existe una canción disponible.

La solución fue probada y funcionó correctamente.

También realicé pruebas manuales con dos pestañas del navegador abiertas simultáneamente. Ambas pudieron reproducir, pausar, reanudar y cambiar la posición de la canción de manera sincronizada.

Estas pruebas se realizaron en la misma computadora. Todavía falta validar la sincronización entre equipos ubicados en redes diferentes.

## Verificación manual de Socket.IO

Además de los tests automatizados, desarrollé un script para verificar el funcionamiento de Socket.IO contra un servidor en ejecución.

El script se encuentra en:

```text
scripts/manual-socket-test.mjs
```

Permite comprobar:

- La autenticación mediante credenciales de sesión.
- La creación y el ingreso a salas.
- El contador de participantes conectados.
- El funcionamiento del chat en tiempo real.
- Los límites de frecuencia de mensajes.
- La sincronización de la reproducción.
- Que actualizar la página como host no provoque una reasignación inmediata.
- Que una desconexión real provoque la reasignación después del margen de gracia.
- Que el antiguo host pierda la posibilidad de modificar la cola.

Para ejecutarlo, primero inicio el servidor:

```bash
npm run dev:server
```

En otra terminal:

```bash
node scripts/manual-socket-test.mjs
```

También puedo reducir el margen de gracia para no tener que esperar los 5 segundos predeterminados:

```bash
HOST_REASSIGNMENT_GRACE_MS=1000 npm run dev:server
HOST_REASSIGNMENT_GRACE_MS=1000 node scripts/manual-socket-test.mjs
```

Esta verificación está separada de Vitest porque levanta clientes reales de Socket.IO y comprueba el comportamiento contra el proceso del servidor.

## Tests

Para ejecutar la suite utilizo:

```bash
npm test
```

Actualmente tengo **91 tests automatizados aprobados**, distribuidos en 10 archivos de prueba.

Cubren diferentes partes de la aplicación:

- Parseo y validación de `RoomEvent`.
- Extracción de identificadores de videos de YouTube.
- Generación de códigos de sala.
- Servicio de salas: creación, ingreso y operaciones de modificación con autorización exclusiva del host.
- Algoritmo de corrección de deriva de reproducción.
- Aplicación de eventos realtime en el store.
- Persistencia de sesiones.
- Módulo de autenticación.
- Limitador de frecuencia.
- Tests de regresión de seguridad.

Los tests trabajan sobre lógica en memoria, por lo que no necesitan una instancia de Redis ni conexiones externas.

Para las partes que requieren un servidor real, como Socket.IO, los headers HTTP, los límites de frecuencia y el margen de gracia, existe el script de verificación manual explicado anteriormente.

También ejecuté `npm run build`. La compilación terminó correctamente, sin errores de TypeScript ni de Vite.

## Estructura del proyecto

Organicé el código separando la lógica del servidor, los componentes de Vue, los servicios y las utilidades.

```text
server/
├── lib/
│   ├── auth.ts               # Autenticación
│   ├── rateLimit.ts          # Limitador de frecuencia por socket
│   ├── roomCode.ts           # Generación y formato de códigos de sala
│   ├── roomStore.ts          # Interfaz RoomStore y factory
│   ├── upstashRoomStore.ts   # Persistencia mediante Redis / Upstash
│   ├── memoryRoomStore.ts    # Almacenamiento en memoria
│   ├── roomService.ts        # Lógica de salas, cola y autorización
│   └── http.ts               # Helpers compartidos para respuestas HTTP
├── routes/
│   └── rooms.ts              # Endpoints REST de /api/rooms/*
├── socket.ts                 # Conexiones, presencia, chat y reasignación
└── index.ts                  # Express, Socket.IO, seguridad y archivos estáticos

src/
├── components/               # Componentes de interfaz
├── views/                    # HomeView y RoomView
├── layouts/                  # DefaultLayout
├── composables/              # Lógica reutilizable de Vue
├── stores/                   # Estado global con Pinia
├── services/                 # API, YouTube y sesiones
├── types/                    # Tipos y contratos con validación runtime
├── utils/                    # Validaciones y algoritmo de sincronización
├── router/                   # Configuración de rutas
└── App.vue

deploy/                       # Configuración y documentación de despliegue
legacy/                       # Aplicación original preservada
scripts/
├── setup.mjs                 # Instalación y configuración inicial
└── manual-socket-test.mjs    # Verificación realtime de extremo a extremo
```

Dentro de `src/components/` tengo componentes como `TrackItem`, `Queue`, `AddTrackForm`, `MusicPlayer`, `ChatPanel`, `RoomHeader`, `ConfirmDialog` y `ToastHost`.

Los composables contienen funcionalidades reutilizables como `usePlayer`, `useSynchronization`, `usePlayerPreferences`, `useRealtime` y `useToast`.

El store `room.ts` de Pinia centraliza el estado de la sala, la cola, la reproducción, la identidad del usuario y su rol de host.

## Variables de entorno

Las variables disponibles están documentadas en [`.env.example`](./.env.example).

| Variable | Uso | Configuración |
|---|---|---|
| `NODE_ENV` | `server/config.ts` | `production` en el servidor. |
| `PORT` | `server/index.ts` | Opcional. Default: 3000. |
| `HOST_REASSIGNMENT_GRACE_MS` | `server/socket.ts` | Opcional. Default: 5000 ms. |
| `CREATE_ROOM_LIMIT` | `server/index.ts` | Opcional. Default: 10 salas cada 10 minutos por IP. |
| `UPSTASH_REDIS_REST_URL` | `server/lib/upstashRoomStore.ts` | URL de Redis en Upstash. |
| `UPSTASH_REDIS_REST_TOKEN` | `server/lib/upstashRoomStore.ts` | Token de acceso a Redis. |

Si no configuro las credenciales de Upstash, el servidor utiliza almacenamiento en memoria.

El archivo `.env` se carga mediante el mecanismo de dotenv del proyecto. En el servicio systemd de Fedora, la aplicación carga sus propias variables al iniciar.

**Nunca deben subirse al repositorio los valores reales de las variables de entorno, tokens, contraseñas, claves privadas ni archivos `.env`.**

## Seguridad

Durante el desarrollo revisé la seguridad de la aplicación, prestando atención a XSS, validación de datos, autorización del lado del servidor, protección de credenciales y abuso de endpoints.

### Autenticación y autorización

La autenticación separa la identidad pública de la credencial privada de cada participante. Las operaciones reservadas al host se validan en el backend; conocer el identificador público del host o el código de una sala no debe ser suficiente para obtener sus permisos.

Las credenciales de sesión se generan aleatoriamente, se conservan en el navegador y se envían al servidor mediante mecanismos de autenticación, no como parte de la URL. El servidor deriva la identidad asociada y comprueba los permisos antes de ejecutar operaciones protegidas.

No se incluyen en este README tokens, valores de sesión, ejemplos de credenciales válidas ni detalles operativos que permitan acceder a una sala o hacerse pasar por un participante.

### Medidas implementadas

| Área | Medida |
|---|---|
| XSS | No utilizo `v-html` ni `innerHTML` dentro de `src/`. Vue escapa automáticamente el contenido interpolado. |
| Miniaturas | Las URL se construyen en el servidor a partir de identificadores validados. |
| Validación | Se validan tokens, IDs de YouTube, textos e índices recibidos. |
| Tamaño de peticiones | Body HTTP y mensajes Socket.IO limitados a 10 KB. |
| API | Límite de 120 peticiones por minuto por IP. |
| Creación de salas | Límite de 10 salas cada 10 minutos por IP. |
| Chat | Máximo de 5 mensajes cada 5 segundos por socket. |
| Secretos | Las credenciales no deben formar parte del bundle del cliente ni del repositorio. El `.env` debe permanecer excluido de Git. |
| Headers HTTP | Se utiliza Helmet para configurar cabeceras de seguridad. |
| Persistencia | Los errores de Redis se manejan para evitar que fallos de almacenamiento derriben el proceso por promesas rechazadas sin capturar. |

Los límites de frecuencia fueron verificados en ejecución.

### Aspectos pendientes

**Content Security Policy (CSP)**

La CSP está configurada en modo `reportOnly`. Esto significa que registra posibles violaciones, pero no bloquea los recursos. Antes de activar el bloqueo es necesario comprobar los recursos externos utilizados por la aplicación, especialmente YouTube IFrame API, fuentes y miniaturas.

**Acceso a las salas**

El código de sala permite que cualquier persona que lo conozca entre como oyente. Es un comportamiento intencional para facilitar el acceso compartido. Los permisos de host se validan por separado.

**Almacenamiento de credenciales**

Las credenciales de sesión se guardan en `sessionStorage`. Como cualquier dato sensible almacenado en el navegador, podrían quedar expuestas ante una vulnerabilidad XSS. Por eso se evita insertar HTML directamente y se mantienen las validaciones de entrada.

**Reasignación del host**

Si el host se desconecta realmente, pierde su rol y este pasa a otro participante que permanezca en la sala. Existe un margen de gracia para evitar que una actualización de página provoque una reasignación inmediata. Si el antiguo host vuelve a conectarse, no recupera automáticamente ese rol.

**Infraestructura**

En Fedora se mantienen activos `firewalld` y SELinux. No se desactivó SELinux para resolver problemas de ejecución. Cloudflare Tunnel permite publicar el servicio sin configurar redirección de puertos entrantes en el router, pero no reemplaza las medidas de seguridad de la aplicación ni del sistema operativo.

## Historial de desarrollo

1. Configuración inicial de Vue 3, TypeScript, Vite y Tailwind.
2. Definición de tipos y contrato de eventos realtime.
3. Implementación del sistema de salas, con creación y acceso mediante códigos.
4. Migración de la interfaz a componentes: reproductor, cola y chat.
5. Integración del reproductor de YouTube mediante YouTube IFrame API y corrección de su inicialización.
6. Implementación de comunicación en tiempo real con Socket.IO, incluyendo chat y reproducción sincronizada.
7. Reasignación automática del host cuando se desconecta.
8. Persistencia de sesiones y margen de gracia para evitar reasignaciones durante un refresh.
9. Implementación de persistencia mediante Redis / Upstash.
10. Revisión de seguridad: autenticación, autorización, límites de frecuencia y headers HTTP.
11. Compilación de producción y pruebas automatizadas.
12. Despliegue del backend en Fedora mediante systemd.
13. Publicación del servicio desde Internet mediante Cloudflare Quick Tunnel.

### Próximas tareas

- Configurar una VM Ubuntu Server 24.04 mediante KVM/QEMU.
- Desplegar TavernSound dentro de esa VM.
- Configurar y verificar SSH, firewall y Caddy en Ubuntu.
- Evaluar una VPS externa si se puede acceder a un proveedor.
- Probar la sincronización entre dispositivos en redes diferentes.
- Medir latencia y disponibilidad.
- Definir una estrategia de backups.
- Evaluar una URL pública estable para el servicio.

## Documentación de despliegue anterior

Durante el desarrollo también se preparó una arquitectura para OCI Always Free con Ubuntu Server 24.04, systemd y Caddy como reverse proxy con HTTPS automático.

Los archivos relacionados pueden encontrarse en [`deploy/`](./deploy), [`DEPLOY.md`](./DEPLOY.md) y [`LOCAL-VS-NUBE.md`](./LOCAL-VS-NUBE.md), si siguen presentes en el repositorio.

Esa configuración representa un procedimiento planificado y no el despliegue que está funcionando actualmente. La infraestructura activa es Fedora con Cloudflare Tunnel.

## Identidad visual

Quise mantener la identidad visual de la aplicación original en lugar de rediseñarla desde cero.

Conservé la paleta de dorados sobre fondos oscuros y las tipografías Cinzel y Crimson Text, trasladando los estilos a tokens de Tailwind CSS.

La implementación se encuentra en [`src/assets/main.css`](./src/assets/main.css).