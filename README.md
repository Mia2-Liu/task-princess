# 妈妈的小助手

一个用 uni-app（Vue 3 + Vite）写的跨端任务管理小程序：说一句话、导一份文档，自动拆成小任务并归到对应的人或场景下。

面向多孩家庭和居家工作者：二宝的手工、大宝的比赛、学校发的通知、自己的自媒体工作，各归各的，不会混成一堆。

## 功能

- **分类归档**：内置「二宝 / 大宝 / 学校 / 工作 / 自己」五个分类，可自行增删改名；首页按分类筛选，每条任务带颜色标签。
- **自动归类**：说「二宝的手工作业月底交」「知乎选题明天更新」，会按分类名和常见说法自动归到对应分类。
- **语音输入**：H5 端使用浏览器 SpeechRecognition，说完自动转文字（微信端语音插件已下架停用，当前降级为手动输入）。
- **智能拆解**：按「，」「然后」「并且」和编号列表拆成多个小任务，自动识别「今天 / 明天 / 周五 / 月底 / 12月3日 / 下午 3 点」等截止时间与「重要 / 不急」优先级。
- **文档导入**：支持 txt、md、csv、json、docx（本地解压读取正文），按行解析；PDF 与旧版 doc 可复制文字后粘贴导入。H5 端支持拖拽文件。
- **时间维度**：今天（含逾期）、有截止、全部、已完成四个视图，与分类筛选可叠加。
- **多端同步（可选）**：接入微信云开发后，任务与分类存云数据库，换设备自动拉取；未配置时纯本地运行。

## 技术栈

- uni-app 3（Vue 3 + `<script setup>`）
- Vite 5
- fflate（docx 解压）
- 目标端：微信小程序 / H5，可继续编译到 App

## 目录

```text
src/
  pages/index/        任务列表（分类 + 时间维度）
  pages/add/          新建任务（语音 + 智能拆解 + 归类）
  pages/import/       文档/粘贴导入
  pages/categories/   分类管理
  components/         任务卡片
  store/tasks.js      任务模型、分组、统计、本地存储
  store/categories.js 分类模型、关键词匹配
  store/sync.js       云同步（可选）
  utils/              日期、拆解、文档解析、语音
cloudfunctions/sync/  云同步云函数
```

## 开发

```bash
npm install
npm run dev:h5          # 浏览器预览
npm run dev:mp-weixin   # 生成 dist/dev/mp-weixin，用微信开发者工具导入
```

## 构建

```bash
npm run build:h5          # dist/build/h5
npm run build:mp-weixin   # dist/build/mp-weixin
```

## 发布到自己的微信小程序

1. 在 [src/manifest.json](src/manifest.json) 的 `mp-weixin.appid` 填入你的小程序 AppID（当前已填 `wx40738e707cdd9370`）。
2. 执行 `npm run build:mp-weixin`，用微信开发者工具导入 `dist/build/mp-weixin`。
3. 小程序需在微信公众平台完成「小程序备案」后才能发布，备案只需主体资料，不需要域名和服务器。
4. 类目建议选「工具 → 效率」或「工具 → 办公」。

> H5 端语音依赖浏览器 SpeechRecognition（Chrome / Edge 支持），需要 HTTPS 或 localhost 环境。

## 启用云同步（可选）

不做也能正常用，数据存在本机。需要多设备同步时：

1. 微信开发者工具里开通「云开发」，创建一个环境，复制环境 ID。
2. 把环境 ID 填到 [src/config.js](src/config.js) 的 `CLOUD_ENV`。
3. 右键 `cloudfunctions/sync` 目录 →「上传并部署：云端安装依赖」。
4. 重新构建并预览。首次拉取成功后，任务与分类会自动写入云数据库集合 `tp_sync`。

同步策略是「整包后写覆盖」：以最后修改时间为准，适合单人多设备，不做多人协同。

## 数据说明

未开启云同步时，任务数据仅保存在本机。文档内容只在本机解析，不会上传服务器。
