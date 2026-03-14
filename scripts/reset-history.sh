#!/bin/sh

set -eu

read_env_value() {
  env_key="$1"
  env_file_path="${2:-.env}"
  env_value=""
  current_env_value=""

  eval "current_env_value=\${$env_key-}"

  if [ -n "$current_env_value" ]; then
    env_value="$current_env_value"
  elif [ -f "$env_file_path" ]; then
    env_value="$(sed -n "s/^${env_key}=//p" "$env_file_path" | tail -n 1)"
  fi

  printf '%s' "$env_value"
}

history_storage_dir="$(read_env_value "HISTORY_STORAGE_DIR")"

if [ -z "$history_storage_dir" ]; then
  history_storage_dir="./var/history"
fi

if [ ! -d "$history_storage_dir" ]; then
  mkdir -p "$history_storage_dir"
fi

find "$history_storage_dir" -type f -name '*.json' -delete

printf 'History reset in %s\n' "$history_storage_dir"
