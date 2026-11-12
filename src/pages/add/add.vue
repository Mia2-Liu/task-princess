<template>
  <view class="page">
    <view class="content">
      <view class="intro">
        <text class="intro-title">把安排说给我听</text>
        <text class="intro-sub">一句话，拆成一件件能完成的小事</text>
      </view>

      <view class="input-card">
        <textarea
          v-model="rawText"
          class="textarea"
          :maxlength="300"
          auto-height
          placeholder="例如：明天上午交周报，然后约设计评审"
          placeholder-class="ph"
          @input="onTextInput"
        />

        <view v-if="recording || recognizing" class="live">
          <view class="wave">
            <view
              v-for="n in 5"
              :key="n"
              class="wave-bar"
              :style="{ animationDelay: (n * 0.12) + 's' }"
            ></view>
          </view>
          <text class="live-text">{{ liveText }}</text>
        </view>

        <view v-if="showVoice" class="input-foot">
          <view
            class="mic"
            :class="{ recording }"
            @touchstart.prevent="startRecording"
            @touchend.prevent="stopRecording"
            @touchcancel.prevent="stopRecording"
          >
            <view class="mic-icon">
              <view class="mic-body"></view>
              <view class="mic-arc"></view>
              <view class="mic-stem"></view>
            </view>
          </view>
          <view class="foot-copy">
            <text class="foot-title">{{ recording ? '松手结束' : '按住说话' }}</text>
            <text class="foot-sub">
              {{ recording ? `正在录音 ${seconds} 秒` : voiceHint }}
            </text>
            <text class="build-tag">语音模块 v1.3</text>
          </view>
        </view>
        <view v-else class="input-foot input-foot--muted">
          <view class="muted-tag">
            <text class="muted-text">微信小程序暂不支持语音输入，可手动打字</text>
          </view>
        </view>
      </view>

      <view v-if="!hasPreview" class="section">
        <text class="section-label">截止时间</text>
        <view class="chips">
          <view
            v-for="opt in dateOptions"
            :key="opt.key"
            class="chip"
            :class="{ active: presetActiveKey === opt.key }"
            @click="setManualDate(opt.key)"
          >
            {{ opt.label }}
          </view>
          <picker mode="date" :value="pickerValue" @change="onManualDateChange">
            <view class="chip" :class="{ active: customActive }">
              {{ customActive ? customDateLabel : '选择日期' }}
            </view>
          </picker>
        </view>
      </view>

      <view v-if="!hasPreview" class="section">
        <text class="section-label">优先级</text>
        <view class="chips">
          <view
            v-for="opt in priorityOptions"
            :key="opt.value"
            class="chip"
            :class="[{ active: priority === opt.value }, 'p' + opt.value]"
            @click="priority = opt.value"
          >
            {{ opt.label }}
          </view>
        </view>
      </view>

      <view v-if="!hasPreview" class="section">
        <text class="section-label">归到</text>
        <view class="chips">
          <view
            class="chip"
            :class="{ active: defaultCategory === '' }"
            @click="defaultCategory = ''"
          >
            不归类
          </view>
          <view
            v-for="c in categories"
            :key="c.id"
            class="chip"
            :class="{ active: defaultCategory === c.id }"
            :style="catChipStyle(c)"
            @click="defaultCategory = c.id"
          >
            {{ c.name }}
          </view>
        </view>
      </view>

      <view v-if="hasPreview" class="section">
        <view class="section-head">
          <text class="section-label">拆成 {{ validCount }} 个小任务</text>
          <text class="relink" @click="resetPreview">重新输入</text>
        </view>

        <view class="preview-card">
          <view v-for="(item, idx) in preview" :key="idx" class="preview-item">
            <text class="preview-index">{{ idx + 1 }}</text>
            <view class="preview-main">
              <input v-model="item.title" class="preview-input" :maxlength="100" />
              <view class="preview-meta">
                <text
                  class="mini-chip mini-cat"
                  :style="itemCatStyle(item)"
                  @click.stop="pickItemCategory(idx)"
                >{{ itemCategoryName(item) }}</text>
                <picker mode="date" :value="itemDateValue(item)" @change="e => onItemDateChange(idx, e)">
                  <view class="mini-chip" :class="{ active: item.dueAt }">
                    {{ itemDueLabel(item) }}
                  </view>
                </picker>
                <text class="mini-tag" :class="'p' + item.priority">{{ priorityLabel(item.priority) }}</text>
              </view>
            </view>
            <view class="remove" @click="removePreviewItem(idx)">×</view>
          </view>
        </view>
      </view>

      <view v-if="!hasPreview" class="tips">
        <text class="tips-title">使用小提示</text>
        <text class="tips-text">
          用「，」或「然后」分隔，就能自动拆成多个小任务；说到「明天上午」「周五」会自动带上截止时间。
        </text>
      </view>
    </view>

    <view class="footer">
      <view class="btn ghost" @click="onSmartSplit">
        {{ hasPreview ? '重新拆分' : '智能拆分' }}
      </view>
      <view class="btn primary" @click="onCreate">
        {{ hasPreview ? `创建 ${validCount} 个任务` : '创建任务' }}
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { addTask, addPlan, requestTab } from '@/store/tasks'
import { decompose } from '@/utils/decompose'
import { dueMeta, endOfDay, addDays, isSameDay, shortDate } from '@/utils/date'
import { startVoice, stopVoice, voiceSupported } from '@/utils/voice'
import { categoryState, hexToRgba, categoryName } from '@/store/categories'

const rawText = ref('')
const manualDue = ref(null)
const manualAllDay = ref(true)
const priority = ref(1)
const preview = ref([])
const recording = ref(false)
const recognizing = ref(false)
const voiceText = ref('')
const statusText = ref('')
const seconds = ref(0)
const usedVoice = ref(false)
const defaultCategory = ref('')

const liveText = computed(() => {
  if (recognizing.value) return statusText.value || '正在识别…'
  if (voiceText.value) return voiceText.value
  return `正在聆听 ${seconds.value} 秒…`
})

const categories = computed(() => categoryState.list)

let timer = null
let starting = false

const hasPreview = computed(() => preview.value.length > 0)
const validCount = computed(() => preview.value.filter(i => i.title.trim()).length)
const showVoice = computed(() => voiceSupported())
const voiceHint = computed(() => {
  // #ifdef H5
  return '语音由浏览器 Web Speech 提供'
  // #endif
  // #ifdef MP-WEIXIN
  return '语音由腾讯云 ASR 转写'
  // #endif
  // #ifndef H5 || MP-WEIXIN
  return '请手动输入'
  // #endif
})

const dateOptions = [
  { key: 'none', label: '不设置' },
  { key: 'today', label: '今天' },
  { key: 'tomorrow', label: '明天' },
  { key: 'after', label: '后天' }
]

const priorityOptions = [
  { value: 0, label: '不急' },
  { value: 1, label: '普通' },
  { value: 2, label: '重要' }
]

const presetActiveKey = computed(() => {
  if (!manualDue.value) return 'none'
  if (!manualAllDay.value) return ''
  const now = Date.now()
  if (isSameDay(manualDue.value, now)) return 'today'
  if (isSameDay(manualDue.value, addDays(now, 1))) return 'tomorrow'
  if (isSameDay(manualDue.value, addDays(now, 2))) return 'after'
  return ''
})

const customActive = computed(() => !!manualDue.value && presetActiveKey.value === '')
const customDateLabel = computed(() => (manualDue.value ? shortDate(manualDue.value) : '选择日期'))

const pickerValue = computed(() => {
  const base = manualDue.value || Date.now()
  const d = new Date(base)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
})

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function setManualDate(key) {
  if (key === 'none') {
    manualDue.value = null
    manualAllDay.value = true
    return
  }
  const offset = key === 'today' ? 0 : key === 'tomorrow' ? 1 : 2
  manualDue.value = endOfDay(addDays(Date.now(), offset))
  manualAllDay.value = true
}

function onManualDateChange(e) {
  const [y, m, d] = e.detail.value.split('-').map(Number)
  manualDue.value = endOfDay(new Date(y, m - 1, d).getTime())
  manualAllDay.value = true
}

function onTextInput() {
  if (preview.value.length) preview.value = []
}

function onSmartSplit() {
  const text = rawText.value.trim()
  if (!text) {
    tip('先写一句或说一句吧')
    return
  }
  const items = decompose(text).map(item => {
    const ownDue = item.dueAt !== null
    return {
      ...item,
      dueAt: ownDue ? item.dueAt : manualDue.value,
      dueAllDay: ownDue ? item.dueAllDay : manualAllDay.value,
      priority:
        item.priority === 1 && priority.value !== 1 ? priority.value : item.priority,
      categoryId: item.categoryId || defaultCategory.value || null
    }
  })
  if (!items.length) {
    tip('没有识别到可以拆分的任务')
    return
  }
  preview.value = items
}

function resetPreview() {
  preview.value = []
}

function removePreviewItem(idx) {
  preview.value.splice(idx, 1)
}

function itemDateValue(item) {
  const d = new Date(item.dueAt || Date.now())
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function onItemDateChange(idx, e) {
  const [y, m, d] = e.detail.value.split('-').map(Number)
  const item = preview.value[idx]
  if (!item) return
  item.dueAt = endOfDay(new Date(y, m - 1, d).getTime())
  item.dueAllDay = true
}

function itemDueLabel(item) {
  if (!item.dueAt) return '加个时间'
  return dueMeta(item.dueAt, item.dueAllDay).label
}

function priorityLabel(value) {
  if (value === 2) return '重要'
  if (value === 0) return '不急'
  return '普通'
}

function catChipStyle(c) {
  if (defaultCategory.value === c.id) {
    return { background: c.color, borderColor: c.color, color: '#ffffff' }
  }
  return { color: c.color, borderColor: hexToRgba(c.color, 0.35) }
}

function itemCategoryName(item) {
  if (!item.categoryId) return '未归类'
  return categoryName(item.categoryId) || '未归类'
}

function itemCatStyle(item) {
  const hit = item.categoryId
    ? categoryState.list.find(c => c.id === item.categoryId)
    : null
  if (!hit) return { color: '#8e87a6', background: 'rgba(176, 170, 194, 0.14)' }
  return { color: hit.color, background: hexToRgba(hit.color, 0.14) }
}

function pickItemCategory(idx) {
  const item = preview.value[idx]
  if (!item) return
  const names = categoryState.list.map(c => c.name)
  uni.showActionSheet({
    itemList: ['不归类', ...names],
    success: res => {
      item.categoryId =
        res.tapIndex === 0 ? null : categoryState.list[res.tapIndex - 1].id
    }
  })
}

function startRecording() {
  if (recording.value || starting) return
  starting = true
  doStartRecording()
}

function doStartRecording() {
  starting = false
  if (!voiceSupported()) {
    tip('当前环境不支持语音，先手动输入吧')
    return
  }
  voiceText.value = ''
  statusText.value = ''
  usedVoice.value = true
  const started = startVoice({
    onText: text => {
      voiceText.value = text
    },
    onStatus: text => {
      statusText.value = text
    },
    onError: err => {
      showVoiceError(err)
      recognizing.value = false
      endRecording()
    },
    onEnd: () => {
      commitVoiceText()
      recognizing.value = false
      endRecording()
    }
  })
  if (!started) {
    recognizing.value = false
    return
  }

  recording.value = true
  seconds.value = 0
  timer = setInterval(() => {
    seconds.value += 1
    if (seconds.value >= 60) stopRecording()
  }, 1000)
}

function stopRecording() {
  if (starting.value) {
    // 权限还没弹完就松手了，通知底层别真的开录
    starting.value = false
    stopVoice()
    return
  }
  if (!recording.value) return
  recording.value = false
  recognizing.value = true
  statusText.value = '正在识别…'
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  stopVoice()
  // #ifdef H5
  setTimeout(() => {
    if (recognizing.value) {
      commitVoiceText()
      recognizing.value = false
      endRecording()
    }
  }, 1500)
  // #endif
  // 小程序端 onStop 一定会回调，不需要兜底定时器
}

function showVoiceError(err) {
  const msg = (err && err.message) || '语音识别失败'
  if (msg.length > 18) {
    uni.showModal({
      title: '语音识别失败',
      content: msg + '\n\n自检：云开发控制台 → 云函数列表里应能看到 asr_recognize；没有就是没部署成功。',
      showCancel: false,
      confirmText: '知道了'
    })
  } else {
    tip(msg)
  }
}

function commitVoiceText() {
  const text = voiceText.value.trim()
  if (!text) return
  const current = rawText.value.trim()
  rawText.value = (current ? current + '，' : '') + text
  if (rawText.value.length > 300) rawText.value = rawText.value.slice(0, 300)
  preview.value = []
  voiceText.value = ''
}

function endRecording() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  recording.value = false
  seconds.value = 0
}

function onCreate() {
  if (hasPreview.value) {
    const items = preview.value
      .filter(i => i.title.trim())
      .map(i => ({ ...i, title: i.title.trim() }))
    if (!items.length) {
      tip('请至少保留一个任务')
      return
    }
    const source = usedVoice.value ? 'voice' : 'manual'
    const cats = new Set(items.map(i => i.categoryId || ''))
    if (items.length === 1 || cats.size > 1) {
      items.forEach(item => addTask({ ...item, source }))
    } else {
      const groupTitle = rawText.value.trim() || '新任务'
      addPlan(groupTitle.slice(0, 40), items, source)
    }
  } else {
    const text = rawText.value.trim()
    if (!text) {
      tip('先写一句或说一句吧')
      return
    }
    addTask({
      title: text,
      dueAt: manualDue.value,
      dueAllDay: manualAllDay.value,
      priority: priority.value,
      categoryId: defaultCategory.value || null,
      source: usedVoice.value ? 'voice' : 'manual'
    })
  }

  requestTab('all')
  uni.showToast({ title: '已创建', icon: 'success' })
  setTimeout(() => uni.navigateBack(), 350)
}

function tip(title) {
  uni.showToast({ title, icon: 'none' })
}

onMounted(() => {
  // #ifdef MP-WEIXIN
  // 进页面就把录音权限问掉，避免第一次按住说话时被系统弹窗打断长按
  wx.getSetting({
    success: res => {
      if (!res.authSetting['scope.record']) {
        wx.authorize({ scope: 'scope.record', fail: () => {} })
      }
    }
  })
  // #endif
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  stopVoice()
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

.intro {
  display: flex;
  flex-direction: column;
  padding: 8rpx 4rpx 26rpx;
}

.intro-title {
  font-size: 38rpx;
  font-weight: 700;
  color: #2b2540;
}

.intro-sub {
  font-size: 24rpx;
  color: #9a93b0;
  margin-top: 10rpx;
}

.input-card {
  background: #ffffff;
  border-radius: 32rpx;
  padding: 30rpx;
  border: 1rpx solid rgba(124, 108, 240, 0.08);
  box-shadow: 0 16rpx 40rpx rgba(85, 70, 150, 0.06);
}

.textarea {
  width: 100%;
  min-height: 170rpx;
  font-size: 30rpx;
  line-height: 1.65;
  color: #2b2540;
}

.ph {
  color: #b8b2c8;
  font-size: 28rpx;
}

.live {
  display: flex;
  align-items: center;
  margin-top: 18rpx;
  padding: 18rpx 20rpx;
  border-radius: 20rpx;
  background: #f8f5ff;
}

.wave {
  display: flex;
  align-items: center;
  height: 40rpx;
  width: 70rpx;
  flex-shrink: 0;
}

.wave-bar {
  width: 7rpx;
  height: 100%;
  border-radius: 6rpx;
  margin-right: 8rpx;
  background: linear-gradient(180deg, #b49cff, #ff9ec4);
  animation: wave 0.9s ease-in-out infinite;
}

@keyframes wave {
  0%,
  100% {
    transform: scaleY(0.3);
  }
  50% {
    transform: scaleY(1);
  }
}

.live-text {
  flex: 1;
  min-width: 0;
  font-size: 25rpx;
  color: #6a58e8;
  line-height: 1.5;
  margin-left: 12rpx;
}

.input-foot {
  display: flex;
  align-items: center;
  margin-top: 26rpx;
  padding-top: 26rpx;
  border-top: 1rpx dashed #efeaf9;
}

.mic {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #7c6cf0, #b49cff);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 12rpx 26rpx rgba(124, 108, 240, 0.28);
  transition: all 0.2s ease;

  &.recording {
    background: linear-gradient(135deg, #ff7d93, #ff9ec4);
    animation: pulse 1.6s infinite;
  }
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 107, 129, 0.4);
  }
  70% {
    box-shadow: 0 0 0 26rpx rgba(255, 107, 129, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 107, 129, 0);
  }
}

.mic-icon {
  width: 46rpx;
  height: 50rpx;
  position: relative;
  display: flex;
  justify-content: center;
}

.mic-body {
  width: 20rpx;
  height: 30rpx;
  border: 3rpx solid #ffffff;
  border-radius: 10rpx;
}

.mic-arc {
  position: absolute;
  top: 14rpx;
  width: 34rpx;
  height: 26rpx;
  border: 3rpx solid #ffffff;
  border-top: none;
  border-radius: 0 0 20rpx 20rpx;
}

.mic-stem {
  position: absolute;
  bottom: 0;
  width: 3rpx;
  height: 10rpx;
  background: #ffffff;
  border-radius: 3rpx;
}

.foot-copy {
  display: flex;
  flex-direction: column;
  margin-left: 22rpx;
}

.input-foot--muted {
  padding-top: 20rpx;
}

.muted-tag {
  padding: 12rpx 22rpx;
  border-radius: 16rpx;
  background: #f8f6fd;
  border: 1rpx dashed #e4def5;
}

.muted-text {
  font-size: 22rpx;
  color: #a29bb7;
}

.foot-title {
  font-size: 27rpx;
  font-weight: 600;
  color: #3c3557;
}

.foot-sub {
  font-size: 22rpx;
  color: #9a93b0;
  margin-top: 6rpx;
}

.build-tag {
  font-size: 18rpx;
  color: #c6c0d6;
  margin-top: 4rpx;
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

.chips {
  display: flex;
  flex-wrap: wrap;
  margin-top: 18rpx;
}

.chip {
  padding: 14rpx 28rpx;
  border-radius: 999rpx;
  background: #ffffff;
  border: 1rpx solid #ece8f7;
  font-size: 25rpx;
  color: #6f6887;
  margin-right: 16rpx;
  margin-bottom: 14rpx;

  &.active {
    color: #6a58e8;
    font-weight: 600;
    background: #f1edff;
    border-color: #c9bcff;
  }

  &.p2.active {
    color: #e04a63;
    background: #ffe9ed;
    border-color: #ffb9c5;
  }

  &.p0.active {
    color: #8e87a6;
    background: #f0eef7;
    border-color: #ddd8ec;
  }
}

.preview-card {
  margin-top: 18rpx;
  background: #ffffff;
  border-radius: 28rpx;
  padding: 10rpx 26rpx;
  border: 1rpx solid rgba(124, 108, 240, 0.08);
  box-shadow: 0 14rpx 34rpx rgba(85, 70, 150, 0.05);
}

.preview-item {
  display: flex;
  align-items: flex-start;
  padding: 24rpx 0;
  border-bottom: 1rpx dashed #f0ecfa;

  &:last-child {
    border-bottom: none;
  }
}

.preview-index {
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background: #f1edff;
  color: #7c6cf0;
  font-size: 21rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 4rpx;
}

.preview-main {
  flex: 1;
  min-width: 0;
  padding: 0 16rpx;
}

.preview-input {
  width: 100%;
  font-size: 28rpx;
  font-weight: 500;
  color: #2b2540;
  line-height: 1.5;
  min-height: 44rpx;
}

.preview-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 8rpx;
}

.mini-chip {
  font-size: 21rpx;
  color: #ff6b81;
  background: #fff1f4;
  border-radius: 8rpx;
  padding: 4rpx 12rpx;
  margin-right: 12rpx;

  &.active {
    color: #7c6cf0;
    background: #f1edff;
  }
}

.mini-cat {
  font-weight: 600;
}

.mini-tag {
  font-size: 20rpx;
  color: #a29bb7;
  background: #f5f3fa;
  border-radius: 8rpx;
  padding: 4rpx 12rpx;

  &.p2 {
    color: #e04a63;
    background: #ffe9ed;
  }

  &.p0 {
    color: #8e87a6;
    background: #f0eef7;
  }
}

.remove {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #b8b2c8;
  font-size: 34rpx;
  flex-shrink: 0;
  background: #f8f6fd;
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
  height: 92rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 29rpx;
  font-weight: 600;
}

.ghost {
  width: 210rpx;
  flex-shrink: 0;
  margin-right: 20rpx;
  background: #ffffff;
  color: #6a58e8;
  border: 1rpx solid rgba(124, 108, 240, 0.24);
}

.primary {
  flex: 1;
  background: linear-gradient(135deg, #7c6cf0, #b49cff);
  color: #ffffff;
  box-shadow: 0 14rpx 30rpx rgba(124, 108, 240, 0.28);
}
</style>
