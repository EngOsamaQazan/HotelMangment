#!/usr/bin/env bash
# يُشغَّل على سيرفر الإنتاج (مسار التطبيق الحالي).
set -euo pipefail
APP_ROOT="${APP_ROOT:-/opt/mafhotel.com/app}"
cd "$APP_ROOT"
export HOME="${HOME:-/home/mafhotel}"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
fi
if ! command -v node >/dev/null 2>&1; then
  echo "node غير موجود في PATH (جرّب تثبيت nvm للمستخدم mafhotel)." >&2
  exit 1
fi
# قراءة DATABASE_URL من .env دون تنفيذ باقي الملف
export DATABASE_URL
DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
if [[ -z "${DATABASE_URL}" ]]; then
  echo "DATABASE_URL missing in ${APP_ROOT}/.env" >&2
  exit 1
fi
export DATABASE_URL
exec npx ts-node --project tsconfig.scripts.json prisma/scripts/reorganize-unit-types.ts "$@"
