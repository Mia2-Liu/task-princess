<template>
  <view class="page">
    <view class="content">
      <view class="upload-card" :class="{ dragging }">
        <view class="upload-icon">↑</view>
        <text class="upload-title">把文档变成任务</text>
        <text class="upload-sub">{{ platformHint }}</text>
        <view class="upload-btn" @click="pickFile">{{ busy ? '正在读取…' : '选择文档' }}</view>
        <text class="upload-note">{{ supported }}</text>
      </view>

      <view class="divider">
        <view class="line"></view>
        <text class="divider-text">或粘贴文字</text>
        <view class="line"></view>
      </view>

      <view class="paste-card">
        <textarea
          v-model="text"
          class="textarea"
          placeholder="把会议纪要、需求清单粘贴到这里，每行会变成一个小任务"
          placeholder-class="ph"
          :maxlength="-1"
          auto-height
          @input="onTextInput"
        />
        <view class="paste-foot">
          <text class="char-count">{{ text.length }} 字</text>
          <view class="parse-btn" @click="parseText">解析为任务</view>
        </view>
      </view>

      <view v-if="fileName" class="file-chip">
        <text class="file-name">{{ fileName }}</text>
        <text class="file-clear" @click="clearAll">×</text>
      </view>

      <view v-if="items.length" class="section">
        <view class="section-head">
          <text class="section-label">识别到 {{ selectedCount }} 个任务</text>
          <text class="relink" @click="items = []">清空</text>
        </view>

        <view class="preview-card">
          <view
            v-for="(item, idx) in items"
            :key="idx"
            class="import-item"
            @click="item.selected = !item.selected"
          >
            <view class="check" :class="{ done: item.selected }">
              <text v-if="item.selected" class="check-mark">✓</text>
            </view>
            <view class="import-main">
              <text class="import-title">{{ item.title }}</text>
              <view class="import-meta">
                <text v-if="item.dueAt" class="mini-chip" :class="dueTone(item)">
                  {{ itemDueLabel(item) }}
                </text>
                <text v-if="item.priority === 2" class="mini-tag p2">重要</text>
                <text v-if="item.priority === 0" class="mini-tag p0">不急</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <view v-if="!items.length" class="tips">
        <text class="tips-title">支持哪些文档</text>
        <text class="tips-text">
          txt / md / csv / json / docx 会直接读取文字；PDF 与旧版 doc 请先转成 docx 或复制文字粘贴。
          任务按行识别，也会自动识别「明天」「周五」等截止时间，最多一次导入 100 条。
        </text>
      </view>
    </view>

    <view v-if="items.length" class="footer">
      <view class="btn primary" @click="addAll">添加 {{ selectedCount }} 个任务</view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { addTask, addPlan, requestTab } from '@/store/tasks'
import { chooseDocument, extractText, parseTextToItems, SUPPORTED_LABEL } from '@/utils/doc'
import { dueMeta } from '@/utils/date'

const text = ref('')
const items = ref([])
const fileName = ref('')
const busy = ref(false)
const dragging = ref(false)
let dragTimer = null

const supported = SUPPORTED_LABEL
const platformHint = (() => {
  // #ifdef H5
  return '拖拽或点击选择本地文档'
  // #endif
  // #ifdef MP-WEIXIN
  return '从微信聊天记录中选择文件'
  // #endif
  // #ifndef H5 || MP-WEIXIN
  return '当前端暂不支持选择文档，可使用粘贴导入'
  // #endif
})()

const selectedCount = computed(() => items.value.filter(i => i.selected).length)

function onTextInput() {
  if (items.value.length) items.value = []
}

async function pickFile() {
  if (busy.value) return
  try {
    const picked = await chooseDocument()
    await readFile(picked.name, picked.buffer)
  } catch (e) {
    if (e && /未选择文件/.test(e.message || '')) return
    tip((e && e.message) || '读取失败')
  }
}

async function readFile(name, buffer) {
  busy.value = true
  try {
    const content = extractText(name, buffer)
    if (!content || !content.trim()) {
      tip('文档里没有可读取的文字')
      return
    }
    fileName.value = name
    text.value = content
    parseText()
    uni.showToast({ title: '读取成功', icon: 'success' })
  } catch (e) {
    tip((e && e.message) || '文档解析失败')
  } finally {
    busy.value = false
  }
}

function parseText() {
  const content = text.value.trim()
  if (!content) {
    tip('先粘贴或导入一些文字')
    return
  }
  const parsed = parseTextToItems(content)
  if (!parsed.length) {
    tip('没有识别到可用的任务')
    return
  }
  items.value = parsed.map(item => ({ ...item, selected: true }))
}

function itemDueLabel(item) {
  return dueMeta(item.dueAt, item.dueAllDay).label
}

function dueTone(item) {
  return dueMeta(item.dueAt, item.dueAllDay).tone
}

function clearAll() {
  text.value = ''
  items.value = []
  fileName.value = ''
}

function addAll() {
  const selected = items.value.filter(i => i.selected && i.title.trim())
  if (!selected.length) {
    tip('至少选择一个任务')
    return
  }
  const base = fileName.value
    ? fileName.value.replace(/\.[^.]+$/, '')
    : '粘贴导入'
  if (selected.length === 1) {
    addTask({ ...selected[0], source: 'doc' })
  } else {
    addPlan(`导入 · ${base}`.slice(0, 40), selected, 'doc')
  }
  requestTab('all')
  uni.showToast({ title: `已添加 ${selected.length} 个`, icon: 'success' })
  setTimeout(() => uni.navigateBack(), 400)
}

function tip(title) {
  uni.showToast({ title, icon: 'none' })
}

async function handleH5File(file) {
  if (!file) return
  busy.value = true
  try {
    const buffer = await file.arrayBuffer()
    await readFile(file.name, buffer)
  } catch (e) {
    tip('读取文件失败')
    busy.value = false
  }
}

function onDragOver(e) {
  if (!e.dataTransfer) return
  e.preventDefault()
  dragging.value = true
  if (dragTimer) clearTimeout(dragTimer)
  dragTimer = setTimeout(() => {
    dragging.value = false
  }, 800)
}

function onDrop(e) {
  e.preventDefault()
  dragging.value = false
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
  if (file) handleH5File(file)
}

function onDragLeave() {
  dragging.value = false
}

onMounted(() => {
  // #ifdef H5
  window.addEventListener('dragover', onDragOver, false)
  window.addEventListener('drop', onDrop, false)
  window.addEventListener('dragleave', onDragLeave, false)
  // #endif
})

onUnmounted(() => {
  // #ifdef H5
  window.removeEventListener('dragover', onDragOver, false)
  window.removeEventListener('drop', onDrop, false)
  window.removeEventListener('dragleave', onDragLeave, false)
  if (dragTimer) clearTimeout(dragTimer)
  // #endif
})
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #f6f4fb;
}

.content {
  padding: 30rpx 34rpx 200rpx;
}

.upload-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48rpx 30rpx 40rpx;
  border-radius: 32rpx;
  background: linear-gradient(135deg, #ffffff, #faf7ff);
  border: 2rpx dashed #d8cffa;
  transition: all 0.2s ease;

  &.dragging {
    border-color: #7c6cf0;
    background: linear-gradient(135deg, #f4f0ff, #fff2f8);
    transform: scale(0.99);
  }
}

.upload-icon {
  width: 96rpx;
  height: 96rpx;
  border-radius: 30rpx;
  background: linear-gradient(135deg, #efeaff, #ffe8f1);
  color: #7c6cf0;
  font-size: 46rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}

.upload-title {
  margin-top: 22rpx;
  font-size: 31rpx;
  font-weight: 700;
  color: #2b2540;
}

.upload-sub {
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #9a93b0;
}

.upload-btn {
  margin-top: 28rpx;
  padding: 18rpx 52rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #7c6cf0, #b49cff);
  color: #ffffff;
  font-size: 27rpx;
  font-weight: 600;
  box-shadow: 0 12rpx 28rpx rgba(124, 108, 240, 0.28);
}

.upload-note {
  margin-top: 20rpx;
  font-size: 21rpx;
  color: #b0aac2;
}

.divider {
  display: flex;
  align-items: center;
  margin: 34rpx 0 24rpx;
}

.line {
  flex: 1;
  height: 1rpx;
  background: #e9e4f6;
}

.divider-text {
  font-size: 22rpx;
  color: #a9a2bd;
  margin: 0 20rpx;
}

.paste-card {
  background: #ffffff;
  border-radius: 30rpx;
  padding: 26rpx;
  border: 1rpx solid rgba(124, 108, 240, 0.08);
  box-shadow: 0 14rpx 34rpx rgba(85, 70, 150, 0.05);
}

.textarea {
  width: 100%;
  min-height: 150rpx;
  font-size: 27rpx;
  line-height: 1.7;
  color: #2b2540;
}

.ph {
  color: #b8b2c8;
  font-size: 25rpx;
}

.paste-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 18rpx;
  padding-top: 18rpx;
  border-top: 1rpx dashed #efeaf9;
}

.char-count {
  font-size: 21rpx;
  color: #b0aac2;
}

.parse-btn {
  padding: 12rpx 30rpx;
  border-radius: 999rpx;
  background: #f1edff;
  color: #6a58e8;
  font-size: 24rpx;
  font-weight: 600;
}

.file-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20rpx;
  padding: 18rpx 24rpx;
  border-radius: 18rpx;
  background: #ffffff;
  border: 1rpx solid #ece8f7;
}

.file-name {
  flex: 1;
  min-width: 0;
  font-size: 23rpx;
  color: #6f6887;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-clear {
  font-size: 32rpx;
  color: #b8b2c8;
  margin-left: 16rpx;
}

.section {
  margin-top: 36rpx;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-label {
  font-size: 27rpx;
  font-weight: 600;
  color: #3c3557;
}

.relink {
  font-size: 23rpx;
  color: #7c6cf0;
}

.preview-card {
  margin-top: 18rpx;
  background: #ffffff;
  border-radius: 28rpx;
  padding: 6rpx 26rpx;
  border: 1rpx solid rgba(124, 108, 240, 0.08);
  box-shadow: 0 14rpx 34rpx rgba(85, 70, 150, 0.05);
}

.import-item {
  display: flex;
  align-items: flex-start;
  padding: 22rpx 0;
  border-bottom: 1rpx dashed #f0ecfa;

  &:last-child {
    border-bottom: none;
  }
}

.check {
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  border: 2rpx solid #d9d4ea;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 4rpx;

  &.done {
    background: linear-gradient(135deg, #7c6cf0, #b49cff);
    border-color: transparent;
  }
}

.check-mark {
  color: #ffffff;
  font-size: 22rpx;
  font-weight: 700;
  line-height: 1;
}

.import-main {
  flex: 1;
  min-width: 0;
  margin-left: 18rpx;
}

.import-title {
  font-size: 27rpx;
  color: #3c3557;
  line-height: 1.5;
  word-break: break-all;
}

.import-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 8rpx;
}

.mini-chip {
  font-size: 20rpx;
  color: #7c6cf0;
  background: #f1edff;
  border-radius: 8rpx;
  padding: 4rpx 12rpx;
  margin-right: 12rpx;

  &.overdue {
    color: #ff5f76;
    background: #ffe9ed;
  }

  &.today {
    color: #f09a3e;
    background: #fff4e5;
  }
}

.mini-tag {
  font-size: 20rpx;
  color: #a29bb7;
  background: #f5f3fa;
  border-radius: 8rpx;
  padding: 4rpx 12rpx;
  margin-right: 10rpx;

  &.p2 {
    color: #e04a63;
    background: #ffe9ed;
  }

  &.p0 {
    color: #8e87a6;
    background: #f0eef7;
  }
}

.tips {
  margin-top: 40rpx;
  padding: 26rpx 28rpx;
  border-radius: 24rpx;
  background: linear-gradient(135deg, #f4f0ff, #fff3f8);
  border: 1rpx solid rgba(180, 156, 255, 0.16);
}

.tips-title {
  display: block;
  font-size: 25rpx;
  font-weight: 600;
  color: #6a58e8;
}

.tips-text {
  display: block;
  margin-top: 10rpx;
  font-size: 23rpx;
  line-height: 1.7;
  color: #8c85a3;
}

.footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  padding: 20rpx 34rpx calc(24rpx + env(safe-area-inset-bottom));
  background: rgba(246, 244, 251, 0.97);
  border-top: 1rpx solid rgba(124, 108, 240, 0.08);
  backdrop-filter: blur(10px);
  z-index: 20;
}

.btn {
  flex: 1;
  height: 92rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 29rpx;
  font-weight: 600;
}

.primary {
  background: linear-gradient(135deg, #7c6cf0, #b49cff);
  color: #ffffff;
  box-shadow: 0 14rpx 30rpx rgba(124, 108, 240, 0.28);
}
</style>
