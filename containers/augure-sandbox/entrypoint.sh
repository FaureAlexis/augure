#!/bin/bash
set -e

if [ "$#" -gt 0 ]; then
  exec "$@"
else
  echo "No command provided. Waiting..."
  tail -f /dev/null
fi
