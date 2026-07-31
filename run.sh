#!/usr/bin/env bash
cd "$(dirname "$0")"
export PATH="$HOME/node20/bin:$PATH"
exec node server.js
