#!/usr/bin/env bash
# Abre los puertos 80 y 443 en el firewall de SO de una VM Ubuntu de OCI.
#
# Por qué este script existe: las imágenes Ubuntu de OCI traen UFW
# deshabilitado a propósito (Oracle lo desaconseja) y usan iptables
# directo, con una regla REJECT al final que bloquea todo lo que no sea
# SSH. Si agregás una regla ACCEPT con `-A` (append), queda DESPUÉS del
# REJECT y no sirve de nada — hay que insertarla antes, con `-I`. Esto es
# un problema real y conocido de OCI, no una rareza de este proyecto.
#
# Esto es SOLO la mitad del firewall: también hace falta abrir estos
# mismos puertos en el Security List / Network Security Group de la VCN,
# desde la consola de OCI (ver DEPLOY.md) — si falta ese paso, esto no
# alcanza.
set -euo pipefail

echo "Reglas de INPUT actuales:"
sudo iptables -L INPUT -n --line-numbers
echo

sudo iptables -I INPUT -p tcp --dport 80 -m state --state NEW -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -m state --state NEW -j ACCEPT

echo "Reglas después de abrir 80 y 443:"
sudo iptables -L INPUT -n --line-numbers
echo

# Sin esto, las reglas se pierden en el próximo reinicio de la VM.
if ! dpkg -s iptables-persistent >/dev/null 2>&1; then
  echo "Instalando iptables-persistent para que las reglas sobrevivan a un reinicio..."
  sudo apt-get update
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
fi
sudo netfilter-persistent save

echo
echo "✓ Listo. Verificá desde afuera con: curl -I http://<IP-de-la-VM>/"
echo "  (va a fallar igual si el Security List / NSG de la VCN no tiene 80 y 443 abiertos también)"
