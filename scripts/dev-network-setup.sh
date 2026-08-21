#!/usr/bin/env bash
# Creates the external Docker networks compose/docker-compose.database.yml
# and compose/docker-compose.services.yml both expect to already exist.
# Safe to run repeatedly: an "already exists" result from `docker network
# create` is treated as success, not an error.
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker is not installed or not on PATH." >&2
  echo "Install Docker Desktop (or Docker Engine + Compose plugin) before running this script." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "error: the Docker daemon is not running (or this user cannot reach it)." >&2
  echo "Start Docker Desktop / the Docker service, then re-run this script." >&2
  exit 1
fi

for network in medsphere-infra-network medsphere-apps-network; do
  if docker network inspect "$network" >/dev/null 2>&1; then
    echo "ok: Docker network '$network' already exists."
  else
    docker network create "$network" >/dev/null
    echo "created: Docker network '$network'."
  fi
done
