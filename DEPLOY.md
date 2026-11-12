# Desplegar TavernSound en OCI (Always Free)

Guía para poner el proyecto en una VM gratuita de Oracle Cloud. Todo acá
son archivos de configuración y comandos documentados, no algo que se
haya podido probar contra una VM real desde este entorno — la primera
vez que lo sigas, andá despacio y confirmá cada paso antes de pasar al
siguiente.

## 0. Qué vas a terminar teniendo

Un solo proceso Node (`server/index.ts`, Express + Socket.io) corriendo
como servicio de systemd, sirviendo todo —API, realtime, y el frontend ya
compilado— detrás de Caddy como reverse proxy con HTTPS automático.

```
Internet → Caddy (:443, HTTPS) → Node (:3000, interno) → Redis (Upstash, externo)
```

## 1. Crear la VM

En la consola de OCI: **Compute → Instances → Create Instance**.

- **Imagen:** Ubuntu 24.04 (esta guía asume Ubuntu — con Oracle Linux los
  comandos de firewall del Paso 2 cambian, usa `firewalld` en vez de
  `iptables` directo).
- **Shape:** `VM.Standard.A1.Flex` (Ampere, ARM) con el filtro "Always
  Free" activado — es la opción con más recursos del free tier (hasta 2
  OCPU / 12 GB al momento de escribir esto; Oracle redujo este límite en
  2026, así que confirmá el tuyo en la consola). La alternativa x86 (AMD
  Micro) también es Always Free pero con muchos menos recursos.
- Generá o subí un par de llaves SSH — las vas a necesitar para conectarte.
- Anotá la **IP pública** que te asigna.

Conectate para confirmar que arrancó:

```bash
ssh ubuntu@<IP-PÚBLICA>
```

## 2. Red: abrir 80 y 443 (dos capas distintas)

OCI tiene **dos firewalls independientes**, y hace falta abrir el puerto
en los dos — si te quedás pegado con "no conecta" más adelante, es casi
seguro que es este paso.

**a) Security List / Network Security Group (a nivel de red, en la consola):**
Networking → Virtual Cloud Networks → tu VCN → Security Lists → la lista
por default. Agregá dos reglas de ingreso: TCP puerto 80 y TCP puerto
443, origen `0.0.0.0/0`.

**b) Firewall del sistema operativo (dentro de la VM):** las imágenes
Ubuntu de OCI traen UFW deshabilitado a propósito y usan iptables directo
con una regla que rechaza todo salvo SSH. Para esto ya dejé un script:

```bash
# Ya en la VM, con el repo clonado (ver Paso 4)
bash deploy/setup-ubuntu-firewall.sh
```

Si preferís hacerlo a mano, o entender qué hace: ver los comentarios
dentro del script — el detalle importante es que la regla nueva tiene que
insertarse *antes* de la regla de rechazo existente, no agregarse al
final, o no tiene ningún efecto.

## 3. Instalar Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
node -v   # confirmá que da 22.x o más — el proyecto pide ^20.19 o >=22.12
```

## 4. Traer el código y buildear

```bash
git clone <la URL de tu repo> tavernsound-vue
cd tavernsound-vue
npm ci
cp .env.example .env
nano .env   # completá UPSTASH_REDIS_REST_URL/TOKEN — ver Paso 5
npm run build
```

**Nota al margen:** `npm run start:server` corre el servidor con `tsx`
(lo mismo que en desarrollo) en vez de compilarlo a JS plano primero. Para
un proceso que arranca una vez y queda corriendo días, el costo extra de
arranque de `tsx` no importa — así que `npm ci` (no `--omit=dev`) es
intencional: `tsx` es una devDependency y hace falta en producción con
este enfoque.

## 5. Redis (Upstash)

Las salas necesitan persistir en algo que no sea la memoria del proceso.
Creá una base en [upstash.com](https://upstash.com) (tiene plan
gratuito), y copiá `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`
al `.env` del Paso 4. Sin esto, el servidor funciona igual pero cae a un
store en memoria (`server/lib/memoryRoomStore.ts`) que no sobrevive a un
reinicio del proceso — anda para probar, no para dejarlo así en serio.

## 6. systemd: que el proceso quede corriendo solo

```bash
sudo cp deploy/tavernsound.service /etc/systemd/system/tavernsound.service
```

Revisá `User=` y `WorkingDirectory=` adentro del archivo — vienen
apuntando a `ubuntu` / `/home/ubuntu/tavernsound-vue`; ajustalos si tu
usuario o la ruta donde clonaste son otros.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tavernsound
sudo systemctl status tavernsound --no-pager
```

Si algo falla, los logs están en `sudo journalctl -u tavernsound -f`.

Confirmá que responde localmente antes de meter el proxy en el medio:

```bash
curl -I http://localhost:3000/
```

## 7. Caddy: HTTPS automático

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

Editá `deploy/Caddyfile` — reemplazá `tu-dominio.com` por tu dominio de
verdad (Let's Encrypt necesita un dominio, no emite certificados para una
IP pelada; si todavía no tenés uno, el archivo explica la alternativa en
HTTP plano mientras tanto). Después:

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Apuntá el registro A de tu dominio a la IP pública de la VM, esperá a que
propague, y probá `https://tu-dominio.com`.

## 8. Verificar que quedó como en local

Antes de dar el deploy por bueno, confirmá qué está corriendo de verdad:

```bash
curl -s https://tu-dominio.com/api/health
# → {"status":"ok","mode":"production","store":"upstash", ...}
```

Si dice `"mode":"development"` falta `NODE_ENV=production` en la unidad de
systemd; si dice `"store":"memory"` faltan las credenciales de Redis en el
`.env`. Para el detalle completo y para comparar contra tu máquina, ver
[`LOCAL-VS-NUBE.md`](./LOCAL-VS-NUBE.md) (`NODE_ENV=production npm run diagnose`).

## 9. Actualizar después del primer deploy

```bash
cd tavernsound-vue
bash deploy/deploy.sh
```

Trae los últimos cambios, reinstala dependencias, rebuildea, y reinicia
el servicio — en ese orden.

## Troubleshooting

- **"No conecta desde afuera" pero `curl localhost:3000` funciona en la
  VM:** casi seguro el Paso 2 — revisá las dos capas de firewall, no solo
  una.
- **Caddy no consigue el certificado:** confirmá que el DNS ya propagó
  (`dig tu-dominio.com`) y que el puerto 80 está abierto — Let's Encrypt
  valida por HTTP antes de emitir el certificado HTTPS.
- **El servicio se reinicia en loop:** `sudo journalctl -u tavernsound -n
  50` — lo más común es `.env` incompleto o con una URL de Redis mal
  copiada.
- **Los mensajes de chat o el estado de la cola no llegan en vivo:**
  confirmá que las conexiones WebSocket pasan — `curl -I
  https://tu-dominio.com/socket.io/` debería dar un 400 (es normal, ese
  endpoint espera un handshake de WebSocket, no un GET común) y no un 502
  ni un timeout.

## Sobre el límite de frecuencia y el proxy

El servidor limita pedidos por IP de cliente y asume **exactamente un
proxy delante** (`trust proxy` = 1): Caddy. Con Caddy, el
`X-Forwarded-For` que mande un cliente se descarta y se reemplaza por su
IP real, así que no se puede falsear para saltarse el límite. Dos
consecuencias: (1) no abras el puerto 3000 al exterior (esta guía solo
abre 80/443), y (2) si algún día cambiás Caddy por otra cosa o sumás un
CDN delante, revisá `app.set("trust proxy", 1)` en `server/index.ts`,
porque cambiaría cuál es la IP "real".

## Qué NO cubre esta guía

Backups de Redis (Upstash los maneja si estás en un plan pago), un
balanceador de carga para correr más de una instancia (no hace falta a
esta escala — y si hiciera falta, Socket.io necesita un adaptador
compartido entre instancias, que hoy no está configurado), y monitoreo
más allá de `journalctl`. Para un proyecto de este tamaño no vale la pena
todavía.
