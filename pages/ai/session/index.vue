<template>
  <view class="ai-page" :style="{ height: pageHeight + 'px' }" @touchmove="onVoiceMove" @touchend="onVoiceEnd" @touchcancel="onVoiceEnd">
    <view class="ai-body">
      <view v-if="wide && !sidebarCollapsed" class="session-side">
        <session-list
          :sessions="sessions"
          :current-id="currentSessionId"
          :loading="loadingSessions"
          :can-create="canCreate"
          :can-remove="canRemove"
          @create="handleCreate"
          @select="handleSelect"
          @remove="handleRemove"
          @load-more="loadMoreSessions"
        ></session-list>
      </view>
      <view class="chat-main">
        <view class="toolbar">
          <view class="tool" @click="toggleSidebar">
            <uni-icons type="chatboxes-filled" size="24" color="#3c96f3"></uni-icons>
          </view>
          <view class="toolbar-space"></view>
          <view v-if="canCreate" class="tool" @click="handleCreate">
            <uni-icons type="plusempty" size="24" color="#3c96f3"></uni-icons>
          </view>
        </view>
        <view class="chat-stage">
          <message-list
            :messages="messages"
            :loading="loadingMessages"
            :sending="isStarting && !runningMessage"
            :has-older="hasOlder"
            :can-retry="canChat && !runningMessage"
            :can-confirm="canConfirm"
            :height="scrollHeight"
            :pad-top="282"
            :scroll-into="scrollInto"
            :empty-text="emptyText"
            @load-older="loadOlderMessages"
            @retry="handleRetry"
            @confirm="handleConfirm"
          ></message-list>
          <view class="chat-portrait">
            <image class="chat-portrait-img" :src="portraitSrc" mode="aspectFill"></image>
          </view>
        </view>
        <chat-input
          v-model="draft"
          :disabled="inputDisabled"
          :sending="isStarting"
          :running="!!runningMessage"
          :stopping="stopping"
          :notice="inputNotice"
          :can-resend="sendFailed"
          :recording="recording"
          :recognizing="recognizing"
          @lines="editorLines = $event"
          @send="handleSend"
          @resend="handleSend"
          @stop="handleStop"
          @voice-hold="beginHold"
        ></chat-input>
        <view v-if="voiceSheet" class="voice-mask">
          <text class="voice-status" :style="{ bottom: (voiceRadius + 30) + 'px' }">{{ voiceMaskText }}</text>
          <view class="voice-arc" :style="arcStyle">
            <uni-icons type="mic-filled" size="84" color="#ffffff"></uni-icons>
          </view>
        </view>
      </view>
    </view>
    <uni-drawer v-if="!wide" ref="sessionDrawer" mode="left" :width="280">
      <session-list
        :sessions="sessions"
        :current-id="currentSessionId"
        :loading="loadingSessions"
        :can-create="canCreate"
        :can-remove="canRemove"
        @create="handleCreate"
        @select="handleSelect"
        @remove="handleRemove"
        @load-more="loadMoreSessions"
      ></session-list>
    </uni-drawer>
  </view>
</template>

<script>
  import SessionList from '@/components/ai/session-list.vue'
  import MessageList from '@/components/ai/message-list.vue'
  import ChatInput from '@/components/ai/chat-input.vue'
  import { SessionStatus, MessageStatus, applyMessageAttachment } from '@/api/ai/types'
  import { listSession, createSession, removeSession, listMessage, getMessage, reconcileSession } from '@/api/ai/session'
  import { startChatStream, stopChat, retryChat } from '@/api/ai/chat'
  import { listChatModels } from '@/api/ai/model'
  import { asrErrorMessage, recognizeSpeech } from '@/api/ai/asr'
  import { canUseAndroidPcm, ensureMicPermission, isRecorderFormatError, learnAndroidCapture, permissionDeniedMessage, prepareWavFile, recordFallbackPlan, recordStartPlan, recorderErrorMessage, recordingTooLong, recordingTooShort, recordingTooShortMessage, startAndroidPcmCapture } from '@/utils/speech-recorder'
  import { getPublishedDefault } from '@/api/digitalhuman/published'
  import { isPublishedConfig } from '@/components/digital-human/published-config'
  import { DIGITAL_HUMAN, assetSrc } from '@/components/digital-human/assets'
  import { createAiSocket } from '@/utils/socket'

  const PAGE_SIZE = 20
  const SOCKET_WAIT = 8000

  let localSeq = 0

  function sameId(left, right) {
    return left != null && right != null && String(left) === String(right)
  }

  function nextLocalId() {
    localSeq += 1
    return 'local-' + localSeq
  }

  function mergeStreamText(serverContent, tail) {
    const server = serverContent || ''
    const extra = tail || ''
    if (!extra) {
      return { base: server, tail: '', content: server }
    }
    if (!server) {
      return { base: '', tail: extra, content: extra }
    }
    if (extra.indexOf(server) === 0) {
      return { base: server, tail: extra.slice(server.length), content: extra }
    }
    if (server.indexOf(extra) !== -1 || server.endsWith(extra)) {
      return { base: server, tail: '', content: server }
    }
    return { base: server, tail: extra, content: server + extra }
  }

  export default {
    components: {
      SessionList,
      MessageList,
      ChatInput
    },
    data() {
      return {
        pageHeight: 600,
        viewWidth: 375,
        portraitSrc: DIGITAL_HUMAN.portrait,
        editorLines: 1,
        wide: false,
        sidebarCollapsed: true,
        sessions: [],
        sessionPage: 1,
        sessionTotal: 0,
        loadingSessions: false,
        currentSessionId: null,
        messages: [],
        messagePage: 1,
        messageTotal: 0,
        loadingMessages: false,
        loadingOlder: false,
        draft: '',
        startingSessionId: null,
        stopping: false,
        sendFailed: false,
        pendingLocalId: null,
        scrollInto: '',
        loadToken: 0,
        socket: null,
        socketWaiters: [],
        needReconcile: false,
        liveTail: {},
        baseContent: {},
        closedRuns: {},
        pendingIntent: {},
        deltaQueue: [],
        messageExtras: {},
        chatModels: [],
        selectedModelId: null,
        recording: false,
        voiceSheet: false,
        recognizing: false,
        discardRecording: false,
        recorder: null,
        recordPlan: null,
        holding: false,
        voiceFinishing: false,
        armStop: false,
        androidCapture: null,
        recordSeconds: 0,
        recordTimer: null,
        formatRetried: false,
        androidOpening: false
      }
    },
    computed: {
      canCreate() {
        return this.hasPermi('ai:session:add')
      },
      canRemove() {
        return this.hasPermi('ai:session:remove')
      },
      canChat() {
        return this.hasPermi('ai:chat:chat')
      },
      canRead() {
        return this.hasPermi('ai:session:query')
      },
      currentSession() {
        const id = this.currentSessionId
        return this.sessions.find(function(item) {
          return item.sessionId === id
        }) || null
      },
      currentTitle() {
        if (!this.currentSession) {
          return '慧老智问'
        }
        return this.currentSession.title || '新对话'
      },
      agentText() {
        return '健康记录、知识和适老化都在本页展示。确认和取消只发送整句。'
      },
      emptyText() {
        if (this.loadingMessages) {
          return ''
        }
        if (!this.currentSessionId) {
          return '还没有打开会话。新建会话后，这里会显示真实历史消息。'
        }
        return '这个会话还没有消息。'
      },
      taskHint() {
        const running = this.runningMessage
        if (!running) {
          return ''
        }
        if (running.tool && running.tool.status === 'pending' && running.tool.saved !== true) {
          if (running.tool.ready === false) {
            return '还有缺项。补全后再确认；现在可以取消，或修改已识别的数据。'
          }
          return '录入尚未保存。本轮结束后发送整句“确认”或“取消”，不会调用确认接口。'
        }
        const hints = {
          TASK: '正在处理健康记录，可停止这一轮。',
          KNOWLEDGE: '正在检索知识，可停止这一轮。',
          ELDERLY_ADAPTATION: '正在整理适老化资料，可停止这一轮。',
          MIXED: '正在处理健康记录和适老化资料，可停止这一轮。',
          UNCERTAIN: '正在生成追问，可停止这一轮。'
        }
        if (running.intent && hints[running.intent]) {
          return hints[running.intent]
        }
        return '正在生成，可点击停止。停止会调用后端取消接口。'
      },
      currentModelName() {
        const id = this.selectedModelId
        const found = this.chatModels.find(function(item) {
          return sameId(item.modelId, id)
        })
        if (found) {
          return found.name || found.modelName || '对话模型'
        }
        return '默认模型'
      },
      canConfirm() {
        if (!this.canChat || this.runningMessage || this.isStarting) {
          return false
        }
        return !(this.currentSession && this.currentSession.status === SessionStatus.CLOSED)
      },
      inputDisabled() {
        if (!this.canChat) {
          return true
        }
        return this.currentSession && this.currentSession.status === SessionStatus.CLOSED
      },
      inputNotice() {
        if (!this.canChat) {
          return '当前账号没有对话权限'
        }
        if (this.currentSession && this.currentSession.status === SessionStatus.CLOSED) {
          return '会话已关闭，不能继续发送'
        }
        if (this.sendFailed) {
          return '发送失败，可修改内容后重试'
        }
        return ''
      },
      hasOlder() {
        return this.messagePage > 1
      },
      voiceMaskText() {
        if (this.recognizing && !this.recording) {
          return '正在识别'
        }
        return '正在拾音 ' + this.recordSeconds + ' 秒'
      },
      voiceRadius() {
        return Math.round(Math.min((this.viewWidth || 375) * 0.42, 168))
      },
      arcStyle() {
        const radius = this.voiceRadius
        return {
          width: (radius * 2) + 'px',
          height: radius + 'px',
          borderRadius: radius + 'px ' + radius + 'px 0 0'
        }
      },
      scrollHeight() {
        const lines = Math.max(1, Math.min(6, this.editorLines || 1))
        const editor = 16 + lines * 24
        const notice = this.inputNotice ? 32 : 0
        const input = 22 + editor + notice
        return Math.max(this.pageHeight - 56 - input, 160)
      },
      isStarting() {
        if (this.startingSessionId == null) {
          return false
        }
        if (this.startingSessionId === 'new') {
          return true
        }
        return sameId(this.startingSessionId, this.currentSessionId)
      },
      runningMessage() {
        const list = this.messages
        for (let index = list.length - 1; index >= 0; index -= 1) {
          if (list[index].role === 'assistant' && list[index].status === MessageStatus.RUNNING) {
            return list[index]
          }
        }
        return null
      }
    },
    onLoad() {
      this.updateLayout(true)
      this.openSocket()
      this.openRecorder()
      this.loadSessions(true)
      this.loadChatModels()
    },
    onShow() {
      this.updateLayout(false)
      this.loadPortrait()
      this.learnCaptureRoute()
    },
    onUnload() {
      this.holding = false
      this.voiceSheet = false
      this.discardRecording = true
      this.stopRecordClock()
      if (this.androidCapture) {
        const capture = this.androidCapture
        this.androidCapture = null
        capture.stop(true)
      } else if (this.recording && this.recorder) {
        this.recorder.stop()
      }
      this.rejectSocketWaiters()
      if (this.socket) {
        this.socket.close()
        this.socket = null
      }
    },
    methods: {
      learnCaptureRoute() {
        if (this.recording || this.holding || this.androidCapture || this.recognizing) {
          return
        }
        learnAndroidCapture()
      },
      scheduleCaptureRoute() {
        const self = this
        setTimeout(function() {
          self.learnCaptureRoute()
        }, 0)
      },
      loadPortrait() {
        const self = this
        getPublishedDefault().then(function(body) {
          if (body && body.code === 200 && isPublishedConfig(body.data) && body.data.sourceImage) {
            self.portraitSrc = assetSrc(body.data.sourceImage)
            return
          }
          self.portraitSrc = DIGITAL_HUMAN.portrait
        }).catch(function() {
          self.portraitSrc = DIGITAL_HUMAN.portrait
        })
      },
      showVoiceError(message) {
        this.voiceSheet = false
        this.$modal.alert(message || '录音失败，请改用文字')
        this.scheduleCaptureRoute()
      },
      startRecordClock() {
        this.stopRecordClock()
        this.recordSeconds = 0
        const self = this
        this.recordTimer = setInterval(function() {
          if (self.recordSeconds < 60) {
            self.recordSeconds += 1
          }
        }, 1000)
      },
      stopRecordClock() {
        if (this.recordTimer) {
          clearInterval(this.recordTimer)
          this.recordTimer = null
        }
      },
      openRecorder() {
        if (!uni.getRecorderManager) {
          return
        }
        const recorder = uni.getRecorderManager()
        const self = this
        recorder.onStart(function() {
          if (self.androidCapture) {
            return
          }
          self.recording = true
          self.voiceSheet = true
          self.startRecordClock()
          if (self.armStop) {
            self.discardRecording = false
            self.recorder.stop()
          }
        })
        recorder.onStop(function(res) {
          if (self.androidCapture) {
            return
          }
          self.recording = false
          self.holding = false
          self.voiceFinishing = false
          self.armStop = false
          self.stopRecordClock()
          if (self.discardRecording) {
            self.discardRecording = false
            self.voiceSheet = false
            self.scheduleCaptureRoute()
            return
          }
          self.submitRecording(res || {})
        })
        recorder.onError(function(error) {
          if (self.androidCapture) {
            return
          }
          const retry = !self.formatRetried && isRecorderFormatError(error)
          self.recording = false
          self.holding = false
          self.voiceFinishing = false
          self.stopRecordClock()
          if (retry && self.recorder) {
            self.formatRetried = true
            const fallback = recordFallbackPlan()
            self.recordPlan = fallback
            try {
              self.recorder.start(fallback.options)
              return
            } catch (retryError) {
              error = retryError
            }
          }
          self.formatRetried = false
          self.armStop = false
          self.discardRecording = false
          self.showVoiceError(recorderErrorMessage(error))
        })
        this.recorder = recorder
      },
      beginHold() {
        if (this.recording || this.recognizing || this.isStarting || this.runningMessage) {
          return
        }
        this.holding = true
        this.armStop = false
        this.formatRetried = false
        const self = this
        ensureMicPermission().then(function(result) {
          if (!self.holding) {
            return
          }
          if (result === 'denied') {
            self.holding = false
            self.showVoiceError(permissionDeniedMessage())
            return
          }
          if (canUseAndroidPcm()) {
            self.launchAndroidRecorder()
            return
          }
          self.launchUniRecorder()
        }).catch(function() {
          self.holding = false
          self.showVoiceError(recorderErrorMessage())
        })
      },
      launchUniRecorder() {
        if (!this.recorder) {
          this.holding = false
          this.showVoiceError('当前环境不能录音，请改用文字')
          return
        }
        const plan = recordStartPlan()
        this.recordPlan = plan
        this.discardRecording = false
        try {
          this.recorder.start(plan.options)
        } catch (error) {
          this.holding = false
          this.showVoiceError(recorderErrorMessage(error))
        }
      },
      launchAndroidRecorder() {
        const self = this
        this.recordPlan = { wrapPcm: false }
        this.discardRecording = false
        this.androidOpening = true
        let opened = false
        const holder = { capture: null }
        let failedBeforeStart = false
        try {
          holder.capture = startAndroidPcmCapture({
          onStart: function() {
            opened = true
            self.recording = true
            self.voiceSheet = true
            self.startRecordClock()
          },
          onStop: function(res) {
            self.androidCapture = null
            self.recording = false
            self.holding = false
            self.voiceFinishing = false
            self.armStop = false
            self.stopRecordClock()
            if (self.discardRecording || (res && res.silent)) {
              self.discardRecording = false
              self.voiceSheet = false
              if (res && res.silent) {
                self.showVoiceError('没有采集到声音，请靠近手机再说')
              } else {
                self.scheduleCaptureRoute()
              }
              return
            }
            self.submitRecording(res || {})
          },
          onError: function(error) {
            self.androidCapture = null
            self.recording = false
            self.voiceFinishing = false
            self.stopRecordClock()
            if (!opened) {
              failedBeforeStart = true
              return
            }
            self.holding = false
            self.armStop = false
            self.showVoiceError((error && error.errMsg) || '当前设备不能按要求录音，请改用文字')
          }
        })
        } catch (error) {
          self.androidOpening = false
          self.holding = false
          self.armStop = false
          self.showVoiceError('当前设备不能按要求录音，请改用文字')
          return
        }
        self.androidOpening = false
        if (failedBeforeStart) {
          if (self.holding && self.recorder) {
            self.launchUniRecorder()
            return
          }
          self.holding = false
          self.armStop = false
          self.showVoiceError('当前设备不能按要求录音，请改用文字')
          return
        }
        if (self.armStop) {
          self.armStop = false
          holder.capture.stop(false)
          return
        }
        self.androidCapture = holder.capture
      },
      onVoiceMove(event) {
        if (!this.recording) {
          return
        }
        const touch = event && event.touches && event.touches[0]
        if (!touch) {
          return
        }
        if (!this.insideArc(touch)) {
          this.finishVoice()
        }
      },
      onVoiceEnd() {
        if (!this.holding && !this.recording) {
          return
        }
        this.finishVoice()
      },
      insideArc(touch) {
        const x = Number(touch.clientX != null ? touch.clientX : touch.pageX)
        const y = Number(touch.clientY != null ? touch.clientY : touch.pageY)
        const cx = (this.viewWidth || 375) / 2
        const cy = this.pageHeight
        const radius = this.voiceRadius
        const dx = x - cx
        const dy = y - cy
        return dx * dx + dy * dy <= radius * radius && y <= cy + 2
      },
      finishVoice() {
        if (this.voiceFinishing) {
          return
        }
        this.holding = false
        if (this.androidOpening && !this.androidCapture) {
          this.armStop = true
          return
        }
        if (!this.recording) {
          this.armStop = true
          return
        }
        this.voiceFinishing = true
        this.armStop = false
        if (this.androidCapture) {
          const capture = this.androidCapture
          this.androidCapture = null
          capture.stop(false)
          return
        }
        if (this.recorder) {
          this.discardRecording = false
          this.recorder.stop()
        }
      },
      submitRecording(result) {
        const filePath = result.tempFilePath || ''
        if (recordingTooLong(result.duration)) {
          this.showVoiceError('录音不能超过 60 秒')
          return
        }
        if (recordingTooShort(result.duration)) {
          this.showVoiceError(recordingTooShortMessage())
          return
        }
        const self = this
        const wrapPcm = !!(this.recordPlan && this.recordPlan.wrapPcm)
        prepareWavFile(filePath, wrapPcm).then(function(ready) {
          if (!ready || ready.error) {
            self.showVoiceError((ready && ready.error) || recorderErrorMessage())
            return
          }
          const wavPath = ready.filePath
          const fileName = wavPath.split('?')[0].split('/').pop().split('\\').pop()
          if (!fileName || fileName.toLowerCase().indexOf('.wav') !== fileName.length - 4) {
            self.showVoiceError('只接受 wav，请改用文字')
            return
          }
          uni.getFileInfo({
            filePath: wavPath,
            success(info) {
              if (info && info.size > 10 * 1024 * 1024) {
                self.showVoiceError('录音不能超过 10MB')
                return
              }
              self.uploadRecording(wavPath)
            },
            fail() {
              self.uploadRecording(wavPath)
            }
          })
        }).catch(function() {
          self.showVoiceError(recorderErrorMessage())
        })
      },
      uploadRecording(filePath) {
        const extra = {}
        if (this.currentSessionId) {
          extra.sessionId = this.currentSessionId
        }
        this.recognizing = true
        recognizeSpeech(filePath, extra).then(res => {
          const text = res && res.data && res.data.recognizedText ? String(res.data.recognizedText) : ''
          if (!text) {
            this.showVoiceError('没有识别到文字')
            return
          }
          this.draft = text
        }).catch(error => {
          this.showVoiceError(asrErrorMessage(error))
        }).finally(() => {
          this.recognizing = false
          this.voiceSheet = false
          this.scheduleCaptureRoute()
        })
      },
      hasPermi(code) {
        const permissions = this.$store.getters.permissions
        if (!permissions || !permissions.length) {
          return false
        }
        return this.$auth.hasPermi(code)
      },
      loadChatModels() {
        if (!this.hasPermi('ai:model:list')) {
          return
        }
        listChatModels().then(res => {
          const rows = (res && res.rows) || []
          this.chatModels = rows.filter(function(item) {
            return item && item.modelType === 'chat' && item.modelType !== 'asr' && item.modelType !== 'rerank' && String(item.status) === '0'
          })
          const preferred = this.chatModels.find(function(item) {
            return String(item.isDefault) === '1'
          })
          if (preferred) {
            this.selectedModelId = preferred.modelId
          }
        }).catch(() => {})
      },
      onModelPick(event) {
        const index = Number(event.detail && event.detail.value)
        const item = this.chatModels[index]
        if (item) {
          this.selectedModelId = item.modelId
        }
      },
      updateLayout(resetSidebar) {
        const info = uni.getSystemInfoSync()
        this.pageHeight = info.windowHeight
        this.viewWidth = info.windowWidth || 375
        const nextWide = info.windowWidth >= 768
        if (resetSidebar || nextWide !== this.wide) {
          this.sidebarCollapsed = !nextWide
        }
        this.wide = nextWide
      },
      toggleSidebar() {
        if (!this.wide) {
          this.openSessions()
          return
        }
        this.sidebarCollapsed = !this.sidebarCollapsed
      },
      openSessions() {
        if (this.$refs.sessionDrawer) {
          this.$refs.sessionDrawer.open()
        }
      },
      closeSessions() {
        if (this.$refs.sessionDrawer) {
          this.$refs.sessionDrawer.close()
        }
      },
      loadSessions(reset) {
        if (!this.hasPermi('ai:session:list')) {
          this.$modal.msgError('没有会话列表权限')
          return
        }
        if (this.loadingSessions) {
          return
        }
        if (reset) {
          this.sessionPage = 1
        }
        this.loadingSessions = true
        listSession({
          pageNum: this.sessionPage,
          pageSize: PAGE_SIZE
        }).then(res => {
          if (!res || res.code !== 200) {
            return
          }
          const rows = res.rows || []
          this.sessionTotal = res.total || 0
          this.sessions = reset ? rows : this.sessions.concat(rows)
          if (reset && !this.currentSessionId && this.sessions.length) {
            this.handleSelect(this.sessions[0])
          }
        }).catch(() => {}).finally(() => {
          this.loadingSessions = false
        })
      },
      loadMoreSessions() {
        if (this.sessions.length >= this.sessionTotal) {
          return
        }
        this.sessionPage += 1
        this.loadSessions(false)
      },
      handleCreate() {
        if (!this.canCreate || this.isStarting) {
          return
        }
        createSession({}).then(res => {
          if (!res || res.code !== 200 || !res.data) {
            return
          }
          this.sessions = [res.data].concat(this.sessions.filter(function(item) {
            return item.sessionId !== res.data.sessionId
          }))
          this.sessionTotal += 1
          this.handleSelect(res.data)
        }).catch(() => {})
      },
      handleSelect(session) {
        if (!session) {
          return
        }
        this.drainQueueToTail()
        this.deltaQueue = []
        this.sendFailed = false
        this.loadingMessages = true
        this.currentSessionId = session.sessionId
        this.pendingLocalId = null
        this.messages = []
        this.messagePage = 1
        this.messageTotal = 0
        this.closeSessions()
        if (this.canRead) {
          this.loadMessages(session.sessionId)
        } else {
          this.$modal.msgError('没有查看历史消息的权限')
        }
      },
      handleRemove(session) {
        if (!this.canRemove || !session) {
          return
        }
        this.$modal.confirm('确认删除该会话？').then(() => {
          removeSession(session.sessionId).then(res => {
            if (!res || res.code !== 200) {
              return
            }
            this.sessions = this.sessions.filter(function(item) {
              return item.sessionId !== session.sessionId
            })
            this.sessionTotal = Math.max(0, this.sessionTotal - 1)
            if (this.currentSessionId !== session.sessionId) {
              return
            }
            this.messages = []
            this.currentSessionId = this.sessions.length ? this.sessions[0].sessionId : null
            if (this.currentSessionId) {
              this.loadMessages(this.currentSessionId)
            }
          }).catch(() => {})
        })
      },
      loadMessages(sessionId) {
        const token = ++this.loadToken
        this.loadingMessages = true
        return listMessage(sessionId, {
          pageNum: 1,
          pageSize: PAGE_SIZE
        }).then(first => {
          if (!this.isCurrentLoad(token, sessionId) || !first || first.code !== 200) {
            return null
          }
          const total = first.total || 0
          const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
          this.messageTotal = total
          if (lastPage === 1) {
            return first
          }
          return listMessage(sessionId, {
            pageNum: lastPage,
            pageSize: PAGE_SIZE
          })
        }).then(page => {
          if (!page || !this.isCurrentLoad(token, sessionId) || page.code !== 200) {
            return
          }
          const total = page.total || this.messageTotal
          this.messageTotal = total
          this.messagePage = Math.max(1, Math.ceil(total / PAGE_SIZE))
          this.messages = this.settleRows(page.rows || [])
          this.flushDeltaQueue()
          this.scrollToLatest()
        }).catch(() => {}).finally(() => {
          if (token === this.loadToken) {
            this.loadingMessages = false
          }
        })
      },
      loadOlderMessages() {
        if (!this.hasOlder || this.loadingOlder || !this.currentSessionId) {
          return
        }
        const sessionId = this.currentSessionId
        const pageNum = this.messagePage - 1
        this.loadingOlder = true
        listMessage(sessionId, {
          pageNum: pageNum,
          pageSize: PAGE_SIZE
        }).then(res => {
          if (this.currentSessionId !== sessionId || !res || res.code !== 200) {
            return
          }
          const older = res.rows || []
          const seen = {}
          this.messages.forEach(function(item) {
            seen[item.messageId] = true
          })
          const prefix = older.filter(function(item) {
            return !seen[item.messageId]
          })
          this.messages = prefix.concat(this.messages)
          this.messagePage = pageNum
        }).catch(() => {}).finally(() => {
          this.loadingOlder = false
        })
      },
      handleConfirm(text) {
        if (text !== '确认' && text !== '取消') {
          return
        }
        this.handleSend(text)
      },
      handleSend(exact) {
        if (this.isStarting || this.runningMessage) {
          return
        }
        const useExact = typeof exact === 'string'
        const content = useExact ? exact.trim() : (this.draft || '').trim()
        if (!content) {
          this.$modal.msgError('请输入内容')
          return
        }
        if (content.length > 8000) {
          this.$modal.msgError('内容最长 8000 字')
          return
        }
        if (!this.canChat) {
          this.$modal.msgError('没有对话权限')
          return
        }
        if (this.currentSession && this.currentSession.status === SessionStatus.CLOSED) {
          this.$modal.msgError('会话已关闭')
          return
        }
        if (!this.currentSessionId && !this.canCreate) {
          this.$modal.msgError('没有新建会话权限')
          return
        }
        this.sendFailed = false
        const localId = this.showOutgoing(content)
        if (!useExact) {
          this.draft = ''
        }
        const failSend = (sessionId, error) => {
          const owned = this.messages.some(function(item) {
            return item.localId === localId && item.messageId == null
          })
          const sameSession = sessionId != null && sameId(this.currentSessionId, sessionId)
          this.clearStarting(sessionId)
          if (owned || sameSession) {
            this.dropOutgoing(localId, content, !useExact)
            if (!useExact) {
              this.sendFailed = true
            }
          }
          if (error && error.message === 'socket timeout') {
            this.$modal.msgError('实时连接失败')
          }
        }
        const sendTo = (sessionId) => {
          this.startingSessionId = sessionId
          return this.ensureSocket().then(() => {
            return startChatStream({
              sessionId: sessionId,
              content: content,
              modelId: this.selectedModelId
            })
          }).then(res => {
            if (!res || res.code !== 200 || !res.data || !res.data.assistantMessageId) {
              failSend(sessionId)
              return
            }
            if (sameId(this.currentSessionId, sessionId)) {
              this.sendFailed = false
              this.placeStart(sessionId, content, res.data, localId)
            }
            this.clearStarting(sessionId)
            this.refreshSessionPage()
          }).catch((error) => {
            failSend(sessionId, error)
          })
        }
        if (!this.currentSessionId) {
          this.startingSessionId = 'new'
          createSession({}).then(res => {
            if (!res || res.code !== 200 || !res.data || !res.data.sessionId) {
              failSend(null)
              return
            }
            this.sessions = [res.data].concat(this.sessions)
            this.currentSessionId = res.data.sessionId
            return sendTo(res.data.sessionId)
          }).catch(() => {
            failSend(null)
          })
          return
        }
        sendTo(this.currentSessionId)
      },
      handleRetry(message) {
        if (this.isStarting || this.runningMessage || !message || !this.currentSessionId) {
          return
        }
        if (!this.canChat) {
          this.$modal.msgError('没有对话权限')
          return
        }
        if (this.currentSession && this.currentSession.status === SessionStatus.CLOSED) {
          this.$modal.msgError('会话已关闭')
          return
        }
        const sessionId = this.currentSessionId
        this.startingSessionId = sessionId
        this.ensureSocket().then(() => {
          return retryChat({
            sessionId: sessionId,
            messageId: message.messageId,
            modelId: this.selectedModelId
          })
        }).then(res => {
          if (!res || res.code !== 200 || !res.data || !res.data.assistantMessageId) {
            this.clearStarting(sessionId)
            return
          }
          this.placeStart(sessionId, '', res.data)
          this.clearStarting(sessionId)
        }).catch(() => {
          this.clearStarting(sessionId)
        })
      },
      handleStop() {
        const running = this.runningMessage
        if (!running || !running.requestId || this.stopping) {
          return
        }
        if (!this.canChat) {
          this.$modal.msgError('没有对话权限')
          return
        }
        const sessionId = this.currentSessionId
        const messageId = running.messageId
        this.stopping = true
        stopChat(running.requestId).then(res => {
          if (!res || res.code !== 200) {
            return
          }
          setTimeout(() => {
            if (!sameId(this.currentSessionId, sessionId)) {
              return
            }
            const current = this.findMessage(messageId)
            if (!current || current.status !== MessageStatus.RUNNING) {
              return
            }
            getMessage(sessionId, messageId).then(detail => {
              if (detail && detail.code === 200 && detail.data) {
                this.applyServerMessage(detail.data)
              }
            }).catch(() => {})
          }, 1000)
        }).catch(() => {}).finally(() => {
          this.stopping = false
        })
      },
      refreshSessionPage() {
        if (!this.hasPermi('ai:session:list')) {
          return
        }
        listSession({
          pageNum: 1,
          pageSize: PAGE_SIZE
        }).then(res => {
          if (!res || res.code !== 200) {
            return
          }
          const fresh = res.rows || []
          const map = {}
          fresh.forEach(function(item) {
            map[item.sessionId] = item
          })
          this.sessions = this.sessions.map(function(item) {
            return map[item.sessionId] || item
          })
          fresh.forEach(item => {
            const exists = this.sessions.some(function(old) {
              return old.sessionId === item.sessionId
            })
            if (!exists) {
              this.sessions.unshift(item)
            }
          })
        }).catch(() => {})
      },
      isCurrentLoad(token, sessionId) {
        return token === this.loadToken && this.currentSessionId === sessionId
      },
      scrollToLatest() {
        const list = this.messages
        if (!list.length) {
          return
        }
        this.scrollToMessage(list[list.length - 1])
      },
      scrollToMessage(message) {
        if (!message) {
          return
        }
        const token = message.messageId != null ? message.messageId : message.localId
        if (token == null || token === '') {
          return
        }
        const id = 'msg-' + token
        this.scrollInto = ''
        this.$nextTick(() => {
          this.scrollInto = id
        })
      },
      showOutgoing(content) {
        const localId = nextLocalId()
        this.pendingLocalId = localId
        this.messages.push({
          localId: localId,
          role: 'user',
          content: content,
          status: MessageStatus.DONE
        })
        this.scrollToMessage(this.messages[this.messages.length - 1])
        return localId
      },
      dropOutgoing(localId, content, restoreDraft) {
        const index = this.messages.findIndex(function(item) {
          return item.localId === localId && item.messageId == null
        })
        if (index !== -1) {
          this.messages.splice(index, 1)
        }
        if (this.pendingLocalId === localId) {
          this.pendingLocalId = null
        }
        if (restoreDraft && index !== -1 && !this.draft) {
          this.draft = content
        }
      },
      bindOutgoing(localId, messageId, sessionId, content) {
        let index = -1
        if (localId) {
          index = this.messages.findIndex(function(item) {
            return item.localId === localId && item.role === 'user'
          })
        }
        if (index === -1) {
          index = this.messages.findIndex(function(item) {
            return item.role === 'user' && item.messageId == null && item.content === content
          })
        }
        if (index !== -1) {
          const previous = this.messages[index]
          this.$set(this.messages, index, Object.assign({}, previous, {
            messageId: messageId,
            sessionId: sessionId,
            role: 'user',
            content: previous.content || content,
            status: MessageStatus.DONE
          }))
          if (this.pendingLocalId === localId || this.pendingLocalId === previous.localId) {
            this.pendingLocalId = null
          }
          return
        }
        const assistantIndex = this.messages.findIndex(function(item) {
          return item.role === 'assistant' && item.status === MessageStatus.RUNNING
        })
        const row = {
          messageId: messageId,
          sessionId: sessionId,
          role: 'user',
          content: content,
          status: MessageStatus.DONE
        }
        if (this.findMessageIndex(messageId) !== -1) {
          this.upsertMessage(row)
          return
        }
        if (assistantIndex === -1) {
          this.messages.push(row)
          return
        }
        this.messages.splice(assistantIndex, 0, row)
      },
      openSocket() {
        if (this.socket) {
          this.socket.connect()
          return
        }
        const self = this
        this.socket = createAiSocket({
          onOpen: function() {
            self.onSocketOpen()
          },
          onMessage: function(message) {
            self.onSocketMessage(message)
          },
          onClose: function() {
            self.onSocketClose()
          },
          onError: function() {},
          onAuthMissing: function() {
            self.rejectSocketWaiters()
          }
        })
        this.socket.connect()
      },
      ensureSocket() {
        if (this.socket && this.socket.isOpen()) {
          return Promise.resolve()
        }
        this.openSocket()
        return new Promise((resolve, reject) => {
          const waiter = {}
          const timer = setTimeout(() => {
            this.socketWaiters = this.socketWaiters.filter(function(item) {
              return item !== waiter
            })
            reject(new Error('socket timeout'))
          }, SOCKET_WAIT)
          waiter.resolve = () => {
            clearTimeout(timer)
            resolve()
          }
          waiter.reject = (error) => {
            clearTimeout(timer)
            reject(error)
          }
          this.socketWaiters.push(waiter)
        })
      },
      onSocketOpen() {
        const waiters = this.socketWaiters.splice(0)
        waiters.forEach(function(item) {
          item.resolve()
        })
        if (!this.needReconcile || !this.currentSessionId || !this.canRead) {
          return
        }
        const sessionId = this.currentSessionId
        this.needReconcile = false
        reconcileSession(sessionId).catch(() => {}).finally(() => {
          if (sameId(this.currentSessionId, sessionId)) {
            this.loadMessages(sessionId)
          }
        })
      },
      onSocketClose() {
        if (this.runningMessage || this.isStarting) {
          this.needReconcile = true
        }
      },
      rejectSocketWaiters() {
        const waiters = this.socketWaiters.splice(0)
        waiters.forEach(function(item) {
          item.reject(new Error('socket closed'))
        })
      },
      onSocketMessage(message) {
        if (!message || !message.type) {
          return
        }
        const type = String(message.type).toUpperCase()
        if (type === 'CONNECTED' || type === 'PONG') {
          return
        }
        if (type === 'ERROR') {
          this.$modal.msgError(message.message || '连接消息错误')
          return
        }
        const sessionId = message.data && message.data.sessionId
        const forCurrent = sessionId == null || sameId(sessionId, this.currentSessionId)
        if (this.loadingMessages && forCurrent) {
          this.deltaQueue.push(message)
          return
        }
        this.applyAiEvent(message)
      },
      applyAiEvent(message) {
        const type = String(message.type || '').toUpperCase()
        const data = message.data || {}
        if (type === 'AI_ROUTE') {
          this.onRoute(message, data)
          return
        }
        if (type === 'AI_START') {
          this.onStart(data, message.requestId)
          return
        }
        if (type === 'AI_TOOL_START') {
          this.onToolStart(data)
          return
        }
        if (type === 'AI_TOOL') {
          this.onTool(data)
          return
        }
        if (type === 'AI_CITATIONS') {
          this.onCitations(data)
          return
        }
        if (type === 'AI_DELTA') {
          this.onDelta(data)
          return
        }
        if (type === 'AI_DONE') {
          this.onTerminal(data, message.requestId, MessageStatus.DONE, data.content)
          return
        }
        if (type === 'AI_CANCELLED') {
          this.onTerminal(data, message.requestId, MessageStatus.STOPPED, data.content)
          return
        }
        if (type === 'AI_ERROR') {
          this.onErrorEvent(data, message.requestId)
        }
      },
      onRoute(message, data) {
        if (message.requestId) {
          this.pendingIntent[message.requestId] = data.intent || ''
        }
        const found = this.findByRequestId(message.requestId)
        if (!found || !sameId(found.message.sessionId, this.currentSessionId)) {
          return
        }
        this.$set(this.messages, found.index, Object.assign({}, found.message, {
          intent: data.intent || ''
        }))
      },
      onStart(data, requestId) {
        if (data.messageId == null || this.closedRuns[data.messageId]) {
          return
        }
        if (data.sessionId != null && !sameId(data.sessionId, this.currentSessionId)) {
          return
        }
        if (this.findMessage(data.messageId)) {
          return
        }
        if (this.baseContent[data.messageId] == null) {
          this.baseContent[data.messageId] = ''
        }
        const assistant = {
          messageId: data.messageId,
          sessionId: data.sessionId,
          role: 'assistant',
          content: (this.baseContent[data.messageId] || '') + (this.liveTail[data.messageId] || ''),
          status: MessageStatus.RUNNING,
          requestId: requestId,
          errorMsg: '',
          intent: this.pendingIntent[requestId] || ''
        }
        const localIndex = this.messages.findIndex(function(item) {
          return item.role === 'user' && item.localId && item.messageId == null
        })
        if (localIndex !== -1) {
          this.messages.splice(localIndex + 1, 0, assistant)
        } else {
          this.messages.push(assistant)
        }
        this.scrollToLatest()
      },
      onToolStart(data) {
        if (data.messageId == null) {
          return
        }
        const current = this.findMessage(data.messageId)
        if (current && current.tool && current.tool.records && current.tool.records.length) {
          return
        }
        this.attachTool(data, {
          name: data.name || '',
          status: '',
          saved: false,
          message: '',
          records: [],
          candidates: []
        })
      },
      onTool(data) {
        if (data.messageId == null) {
          return
        }
        const current = this.findMessage(data.messageId)
        const kept = current && current.tool && Array.isArray(current.tool.records) ? current.tool.records : []
        this.attachTool(data, {
          name: data.name || '',
          status: data.status || '',
          saved: data.saved === true,
          ready: data.ready !== false,
          message: data.message || '',
          expireTime: data.expireTime || '',
          recordId: data.saved === true ? data.recordId : undefined,
          records: Array.isArray(data.records) ? data.records : kept,
          candidates: Array.isArray(data.candidates) ? data.candidates : []
        })
      },
      onCitations(data) {
        if (data.messageId == null) {
          return
        }
        this.rememberExtra(data.messageId, {
          citations: data.citations || [],
          grounded: data.grounded === true,
          citationStatus: data.status || ''
        })
      },
      attachTool(data, tool) {
        this.rememberExtra(data.messageId, { tool: tool })
        if (data.sessionId != null && !sameId(data.sessionId, this.currentSessionId)) {
          return
        }
        this.patchMessage(data.messageId, { tool: tool })
      },
      rememberExtra(messageId, patch) {
        const previous = this.messageExtras[messageId] || {}
        this.$set(this.messageExtras, messageId, Object.assign({}, previous, patch))
      },
      patchMessage(messageId, patch) {
        const index = this.findMessageIndex(messageId)
        if (index === -1) {
          return
        }
        this.$set(this.messages, index, Object.assign({}, this.messages[index], patch))
      },
      onDelta(data) {
        const messageId = data.messageId
        if (messageId == null || !data.delta || this.closedRuns[messageId]) {
          return
        }
        this.liveTail[messageId] = (this.liveTail[messageId] || '') + data.delta
        if (data.sessionId != null && !sameId(data.sessionId, this.currentSessionId)) {
          return
        }
        if (this.baseContent[messageId] == null) {
          this.baseContent[messageId] = ''
        }
        const index = this.findMessageIndex(messageId)
        if (index === -1) {
          return
        }
        const current = this.messages[index]
        this.$set(this.messages, index, Object.assign({}, current, {
          content: (this.baseContent[messageId] || '') + this.liveTail[messageId],
          status: MessageStatus.RUNNING
        }))
        this.scrollToLatest()
      },
      onTerminal(data, requestId, status, content) {
        const messageId = data.messageId
        if (messageId == null) {
          return
        }
        this.closedRuns[messageId] = true
        const patch = {
          status: status,
          errorMsg: ''
        }
        if (typeof content === 'string') {
          this.liveTail[messageId] = ''
          this.baseContent[messageId] = content
          patch.content = content
        } else {
          this.liveTail[messageId] = ''
        }
        if (status === MessageStatus.DONE) {
          const extra = this.messageExtras[messageId] || {}
          patch.citations = extra.citations || []
          patch.grounded = extra.grounded === true
          patch.citationStatus = extra.citationStatus || ''
          this.rememberExtra(messageId, { citationsReady: true })
        }
        const sessionId = data.sessionId
        if (sessionId == null || sameId(sessionId, this.currentSessionId)) {
          const index = this.findMessageIndex(messageId)
          if (index !== -1) {
            this.$set(this.messages, index, Object.assign({}, this.messages[index], patch))
            this.scrollToLatest()
          }
        }
        this.finishRun(sessionId)
        if (requestId) {
          delete this.pendingIntent[requestId]
        }
      },
      onErrorEvent(data, requestId) {
        const messageId = data.messageId
        const errorText = data.msg || '生成失败'
        if (messageId == null) {
          this.$modal.msgError(errorText)
          this.clearStarting(data.sessionId)
          return
        }
        this.closedRuns[messageId] = true
        this.liveTail[messageId] = ''
        if (data.sessionId == null || sameId(data.sessionId, this.currentSessionId)) {
          const index = this.findMessageIndex(messageId)
          if (index !== -1) {
            const current = this.messages[index]
            const next = Object.assign({}, current, {
              status: MessageStatus.FAILED,
              errorMsg: errorText
            })
            next.citations = []
            next.citationStatus = ''
            next.grounded = false
            const extraPatch = {
              citations: [],
              citationStatus: '',
              grounded: false,
              citationsReady: false
            }
            if (errorText === '健康记录保存失败') {
              next.tool = Object.assign({}, current.tool || {}, { saved: false })
              if (next.tool.status === 'saved') {
                next.tool.status = ''
              }
              extraPatch.tool = next.tool
            }
            this.rememberExtra(messageId, extraPatch)
            this.$set(this.messages, index, next)
          }
          if (data.sessionId != null) {
            getMessage(data.sessionId, messageId).then(res => {
              if (res && res.code === 200 && res.data) {
                this.applyServerMessage(res.data)
              }
            }).catch(() => {})
          }
        }
        this.finishRun(data.sessionId)
        if (requestId) {
          delete this.pendingIntent[requestId]
        }
      },
      placeStart(sessionId, content, data, localId) {
        const assistantId = data.assistantMessageId
        if (this.baseContent[assistantId] == null) {
          this.baseContent[assistantId] = ''
        }
        const intent = data.intent || this.pendingIntent[data.requestId] || ''
        if (!sameId(this.currentSessionId, sessionId)) {
          return
        }
        if (data.userMessageId) {
          this.bindOutgoing(localId, data.userMessageId, sessionId, content)
          this.applyStoredUserText(sessionId, data.userMessageId)
        }
        this.upsertMessage({
          messageId: assistantId,
          sessionId: sessionId,
          role: 'assistant',
          content: (this.baseContent[assistantId] || '') + (this.liveTail[assistantId] || ''),
          status: MessageStatus.RUNNING,
          requestId: data.requestId,
          errorMsg: '',
          intent: intent
        })
        this.scrollToLatest()
      },
      applyStoredUserText(sessionId, messageId) {
        getMessage(sessionId, messageId).then(res => {
          if (!sameId(this.currentSessionId, sessionId) || !res || res.code !== 200 || !res.data) {
            return
          }
          const stored = res.data.content
          if (stored == null || stored === '') {
            return
          }
          const current = this.findMessage(messageId)
          if (!current || current.role !== 'user') {
            return
          }
          this.upsertMessage({
            messageId: messageId,
            sessionId: sessionId,
            role: 'user',
            content: stored,
            status: MessageStatus.DONE
          })
        }).catch(() => {})
      },
      applyServerMessage(message) {
        if (!message || message.messageId == null) {
          return
        }
        const index = this.findMessageIndex(message.messageId)
        const previous = index === -1 ? null : this.messages[index]
        const keepText = (message.content == null || message.content === '') && previous && previous.content
        const stored = keepText ? previous.content : (message.content || '')
        if (message.status !== MessageStatus.RUNNING) {
          this.closedRuns[message.messageId] = true
          this.liveTail[message.messageId] = ''
          this.baseContent[message.messageId] = stored
        }
        if (!sameId(message.sessionId, this.currentSessionId)) {
          return
        }
        const payload = Object.assign({}, message)
        if (keepText) {
          payload.content = previous.content
        }
        if ((payload.errorMsg == null || payload.errorMsg === '') && previous && previous.errorMsg) {
          payload.errorMsg = previous.errorMsg
        }
        this.upsertMessage(payload)
        this.finishRun(message.sessionId)
      },
      settleRows(rows) {
        const self = this
        return (rows || []).map(function(row) {
          const copy = Object.assign({}, row)
          const messageId = copy.messageId
          applyMessageAttachment(copy, row.attachmentJson)
          const extra = self.messageExtras[messageId]
          if (extra && extra.tool) {
            copy.tool = extra.tool
          }
          if (extra && extra.citationsReady) {
            copy.citations = extra.citations || []
            copy.grounded = extra.grounded === true
            copy.citationStatus = extra.citationStatus || ''
          }
          if (copy.status !== MessageStatus.RUNNING) {
            self.liveTail[messageId] = ''
            self.baseContent[messageId] = copy.content || ''
            self.closedRuns[messageId] = true
            return copy
          }
          const merged = mergeStreamText(copy.content || '', self.liveTail[messageId] || '')
          self.baseContent[messageId] = merged.base
          self.liveTail[messageId] = merged.tail
          copy.content = merged.content
          return copy
        })
      },
      flushDeltaQueue() {
        const queued = this.deltaQueue.splice(0)
        const self = this
        queued.forEach(function(message) {
          self.applyAiEvent(message)
        })
      },
      drainQueueToTail() {
        const queued = this.deltaQueue.splice(0)
        const self = this
        queued.forEach(function(message) {
          const type = String(message.type || '').toUpperCase()
          const data = message.data || {}
          if (type === 'AI_DELTA' && data.messageId != null && data.delta && !self.closedRuns[data.messageId]) {
            self.liveTail[data.messageId] = (self.liveTail[data.messageId] || '') + data.delta
          }
          if ((type === 'AI_TOOL' || type === 'AI_TOOL_START' || type === 'AI_CITATIONS') && data.messageId != null) {
            self.applyAiEvent(message)
          }
        })
      },
      upsertMessage(message) {
        const index = this.findMessageIndex(message.messageId)
        if (index === -1) {
          this.messages.push(message)
          return
        }
        const previous = this.messages[index]
        const next = Object.assign({}, previous, message)
        if (!Object.prototype.hasOwnProperty.call(message, 'tool') && previous.tool) {
          next.tool = previous.tool
        }
        this.$set(this.messages, index, next)
      },
      findMessage(messageId) {
        const index = this.findMessageIndex(messageId)
        return index === -1 ? null : this.messages[index]
      },
      findMessageIndex(messageId) {
        return this.messages.findIndex(function(item) {
          return sameId(item.messageId, messageId)
        })
      },
      findByRequestId(requestId) {
        if (!requestId) {
          return null
        }
        const index = this.messages.findIndex(function(item) {
          return item.requestId === requestId
        })
        if (index === -1) {
          return null
        }
        return {
          index: index,
          message: this.messages[index]
        }
      },
      clearStarting(sessionId) {
        if (sessionId == null || sameId(this.startingSessionId, sessionId) || this.startingSessionId === 'new') {
          this.startingSessionId = null
        }
      },
      finishRun(sessionId) {
        this.clearStarting(sessionId)
        this.refreshSessionPage()
      }
    }
  }
</script>

<style lang="scss" scoped>
  .ai-page {
    background: #f5f8fc;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  .ai-body {
    flex: 1;
    height: 100%;
    display: flex;
    min-height: 0;
  }

  .session-side {
    width: 260px;
    height: 100%;
    flex-shrink: 0;
    border-right: 1px solid #eaeef1;
    background: #fff;
  }

  .chat-main {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .toolbar {
    height: 56px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    background: #ffffff;
    border-bottom: 1px solid #e6eef8;
    box-sizing: border-box;
  }

  .toolbar-space {
    flex: 1;
  }

  .chat-stage {
    position: relative;
    flex: 1;
    min-height: 0;
  }

  .chat-portrait {
    position: absolute;
    left: 30px;
    top: 30px;
    width: 200px;
    height: 240px;
    z-index: 2;
    overflow: hidden;
    border-radius: 16px;
    pointer-events: none;
  }

  .chat-portrait-img {
    width: 100%;
    height: 100%;
    display: block;
  }

  .tool {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .voice-mask {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    z-index: 8;
    background: rgba(31, 42, 55, 0.28);
    pointer-events: none;
  }

  .voice-status {
    position: absolute;
    left: 0;
    right: 0;
    text-align: center;
    color: #1f2a37;
    font-size: 18px;
    line-height: 24px;
  }

  .voice-arc {
    position: absolute;
    left: 50%;
    bottom: 0;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    background: linear-gradient(180deg, #8ec5ff 0%, #3c96f3 100%);
  }
</style>
