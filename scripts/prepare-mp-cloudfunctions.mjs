// 把 cloudfunctions 拷进小程序构建产物，便于微信开发者工具直接右键上传部署
// uni-app 编译产物在 dist/build/mp-weixin（构建）和 dist/dev/mp-weixin（开发）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'cloudfunctions')
const targets = [
  path.join(root, 'dist/build/mp-weixin'),
  path.join(root, 'dist/dev/mp-weixin')
]

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const src = path.join(from, entry.name)
    const dest = path.join(to, entry.name)
    if (entry.isDirectory()) copyDir(src, dest)
    else fs.copyFileSync(src, dest)
  }
}

if (!fs.existsSync(source)) {
  console.warn('[cloudfunctions] 源目录不存在，跳过:', source)
  process.exit(0)
}

for (const target of targets) {
  fs.mkdirSync(target, { recursive: true })
  const dest = path.join(target, 'cloudfunctions')
  fs.rmSync(dest, { recursive: true, force: true })
  copyDir(source, dest)
  console.log('[cloudfunctions] 已同步到', path.relative(root, dest))
}
