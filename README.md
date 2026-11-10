# 任务小公举

一个用 uni-app（Vue 3 + Vite）写的跨端任务管理小程序：说一句话、拖一份文档，就能把安排拆成一件件能完成的小任务。

## 功能

- **语音输入**：微信小程序端接入「微信同声传译」插件，H5 端使用浏览器 SpeechRecognition，说完自动转文字。
- **智能拆解**：按「，」「然后」「并且」和编号列表把一句话拆成多个小任务，并自动识别「今天 / 明天 / 周五 / 下午 3 点」等截止时间与「重要 / 不急」等优先级。
- **文档导入**：支持 txt、md、csv、json、docx（docx 本地解压读取正文），按行解析任务；PDF 与旧版 doc 可复制文字后粘贴导入。H5 端支持拖拽文件。
- **时间维度**：今天（含逾期）、有截止、全部、已完成四个视图；任务组可展开子任务并显示完成进度。
- **本地存储**：任务保存在设备本地（`uni.setStorageSync`），无需登录和后端。

## 技术栈

- uni-app 3（Vue 3 + `<script setup>`）
- Vite 5
- fflate（docx 解压）
- 目标端：微信小程序 / H5，可继续编译到 App

## 目录

```text
src/
  pages/index/    任务列表（四个时间维度）
  pages/add/      新建任务（语音 + 智能拆解）
  pages/import/   文档/粘贴导入
  components/     任务卡片
  store/tasks.js  任务模型、分组、统计、本地存储
  utils/          日期、拆解、文档解析、语音封装
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

1. 在 [src/manifest.json](src/manifest.json) 的 `mp-weixin.appid` 填入你的小程序 AppID。
2. 登录微信公众平台，进入「设置 → 第三方设置 → 插件管理」，添加 **微信同声传译** 插件（provider：`wx069ba97219f66d99`）。`manifest.json` 已声明该插件，未添加会导致语音不可用。
3. 执行 `npm run build:mp-weixin`，用微信开发者工具导入 `dist/build/mp-weixin`。
4. 在开发者工具中预览、真机调试，确认麦克风权限与语音识别正常后上传代码，在公众平台提交审核并发布。

> H5 端语音依赖浏览器 SpeechRecognition（Chrome / Edge 支持），需要 HTTPS 或 localhost 环境。

## 数据说明

任务数据仅保存在本机。语音识别由微信插件或浏览器提供，文档内容只在本机解析，不会上传服务器。
