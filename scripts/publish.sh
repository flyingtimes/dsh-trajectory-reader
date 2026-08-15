#!/usr/bin/env bash
# Publish @clarkchan/trajectory-reader to npmjs.
# Preconditions (done by the user):
#   1. npmjs account "clarkchan" created + email verified
#   2. `npm login --registry=https://registry.npmjs.org` completed
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"
REGISTRY="https://registry.npmjs.org"

echo "==> 1/4 校验 npm 登录（npmjs）..."
WHOAMI="$(npm whoami --registry="$REGISTRY" 2>&1 || true)"
if [[ "$WHOAMI" != "clarkchan" ]]; then
  echo "错误：当前未以 clarkchan 登录 npmjs（当前: '${WHOAMI:-<未登录>}'）"
  echo "请先执行: npm login --registry=$REGISTRY"
  exit 1
fi
echo "    已登录: $WHOAMI"

echo "==> 2/4 校验包名与 scope..."
NAME="$(node -p "require('./package.json').name")"
if [[ "$NAME" != "@clarkchan/trajectory-reader" ]]; then
  echo "错误：包名应为 @clarkchan/trajectory-reader，当前为 $NAME"
  echo "请先改名：package.json 的 name、client.js 的模块 id、profile 加载行"
  exit 1
fi
echo "    包名: $NAME"

echo "==> 3/4 语法检查 + 打包预览..."
node --check client.js
node --check index.js
npm pack --dry-run

echo "==> 4/4 发布到 npmjs..."
npm publish --registry="$REGISTRY" --access public

echo
echo "✅ 已发布: $NAME"
echo "安装方式: cd \"\$DSH_HOME/profiles/web\" && pnpm add $NAME"
