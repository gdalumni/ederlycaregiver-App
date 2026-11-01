<template>
  <view
    class="home"
    :style="{ height: pageHeight + 'px' }"
    @touchmove="onHomeTouchMove"
    @touchend="onHomeTouchEnd"
    @touchcancel="onHomeTouchCancel"
  >
    <view class="home-fore">
      <view class="home-bar" :style="{ paddingTop: statusBarHeight + 'px' }">
        <view class="brand">
          <image class="brand-logo" :src="logo" mode="aspectFill"></image>
          <text class="home-title">您的管家</text>
        </view>
        <text v-if="canOpenChat" class="home-link" @click="openFullChat">完整对话</text>
      </view>
      <view class="swipe-stage">
        <view
          class="swipe-track"
          :class="{ snapping: !swipeDragging }"
          :style="{ transform: 'translateX(-' + swipeOffset + 'px)' }"
          @touchstart="onSwipeStart($event, true)"
          @touchmove="onSwipeMove($event, true)"
          @touchend="onSwipeEnd(true)"
          @touchcancel="onSwipeCancel(true)"
          @mousedown="onSwipeStart($event, false)"
          @mousemove="onSwipeMove($event, false)"
          @mouseup="onSwipeEnd(false)"
        >
      <view class="portrait-gap"></view>
      <view class="portrait-slot" :style="{ height: slotHeight + 'px' }">
        <digital-stage
          ref="human"
          class="stage-fill"
          :mouth="mouthKey"
          :view-width="viewWidth"
          :view-height="slotHeight"
          :inset-top="12"
          pin-top
          @frame="onPortraitFrame"
        ></digital-stage>
        <view class="avatar-dock" @touchstart.stop @mousedown.stop>
          <view class="avatar-panel" :class="{ open: avatarOpen }">
            <scroll-view scroll-y class="avatar-scroll">
              <text v-if="avatarListLoading" class="avatar-empty">正在读取形象</text>
              <text v-else-if="!avatarChoices.length" class="avatar-empty">没有已发布的形象</text>
              <view
                v-for="item in avatarChoices"
                :key="item.avatarCode"
                class="avatar-item"
                :class="{ current: item.avatarCode === activeAvatarCode }"
                @click="selectAvatar(item)"
              >
                <image class="avatar-thumb" :src="avatarThumb(item)" mode="aspectFill"></image>
                <text class="avatar-name">{{ item.avatarName || item.avatarCode }}</text>
              </view>
            </scroll-view>
          </view>
          <view class="avatar-toggle" @click="toggleAvatarPanel">
            <uni-icons :type="avatarOpen ? 'closeempty' : 'person-filled'" size="28" color="#ffffff"></uni-icons>
          </view>
        </view>
        <view
          v-if="messages.length && chatOpen"
          class="chat-shell"
          :style="chatStyle"
          @touchstart.stop="onSwipeStart($event, true)"
          @touchmove.stop="onSwipeMove($event, true)"
          @touchend.stop="onSwipeEnd(true)"
          @touchcancel.stop="onSwipeCancel(true)"
          @mousedown.stop="onSwipeStart($event, false)"
          @mousemove.stop="onSwipeMove($event, false)"
          @mouseup.stop="onSwipeEnd(false)"
        >
          <view class="chat-bar">
            <view class="chat-close" @click.stop="hideChat">
              <uni-icons type="closeempty" size="18" color="#0b57d0"></uni-icons>
            </view>
          </view>
          <scroll-view
            :scroll-y="!swipeDragging"
            class="chat"
            :style="{ height: chatBodyHeight + 'px' }"
            :scroll-into-view="scrollAnchor"
            scroll-with-animation
            @scroll="onChatScroll"
            @touchstart.stop="onSwipeStart($event, true)"
            @touchmove="onSwipeMove($event, true)"
            @touchend.stop="onSwipeEnd(true)"
            @touchcancel.stop="onSwipeCancel(true)"
          >
            <view v-if="hasOlder" class="older" @click="loadOlderMessages">{{ loadingOlder ? '正在加载更早的消息' : '加载更早的消息' }}</view>
            <view v-for="item in messages" :id="'turn-' + item.localId" :key="item.localId" class="turn">
              <message-bubble home :message="item" :can-confirm="canChat" @confirm="sendPhrase"></message-bubble>
              <text v-if="item.localAudio" class="play" @click="toggleAudio(item)">{{ playingId === item.localId ? '停止播放' : '播放录音' }}</text>
              <view :id="'tail-' + item.localId" class="tail"></view>
            </view>
          </scroll-view>
        </view>
        <view
          v-if="messages.length && !chatOpen"
          class="chat-reopen"
          :style="reopenStyle"
          @click.stop="showChat"
          @touchstart.stop
          @mousedown.stop
        >对话</view>
        <view v-if="notices.length" class="notice-bar" @tap.stop="openNotices" @touchstart.stop @mousedown.stop>
          <view class="notice-track" :style="noticeTrackStyle">
            <text v-for="(item, index) in noticeSlides" :key="index" class="notice-text">{{ item }}</text>
          </view>
        </view>
      </view>
        <view
          v-if="swipeOpen"
          class="swipe-mask"
          @click.stop="onSwipeMaskClick"
          @touchstart.stop="onSwipeStart($event, true)"
          @touchmove.stop="onSwipeMove($event, true)"
          @touchend.stop="onSwipeEnd(true)"
          @touchcancel.stop="onSwipeCancel(true)"
        ></view>
        </view>
        <view
          v-if="swipeOffset > 0"
          class="swipe-hit"
          :style="{ width: swipeOffset + 'px' }"
          @click.stop="confirmFreshChat"
        ></view>
      </view>
      <view class="composer">
        <view class="composer-main">
          <view class="editor-wrap">
            <textarea
              class="editor"
              :style="editorStyle"
              :value="draft"
              :disabled="inputDisabled || sending || recognizing"
              maxlength="8000"
              placeholder="输入后发送"
              @input="onDraftInput"
              @linechange="onEditorLine"
            />
            <view
              class="mic"
              :class="{ holding: recording || startingRecorder }"
              @touchstart.stop="onPressStart($event, true)"
              @touchmove.stop="onPressMove($event, true)"
              @touchend.stop="onPressEnd(true)"
              @touchcancel.stop="onPressCancel(true)"
              @mousedown.stop="onPressStart($event, false)"
              @mousemove.stop="onPressMove($event, false)"
              @mouseup.stop="onPressEnd(false)"
            >
              <uni-icons type="mic-filled" size="20" :color="recording ? '#ffffff' : '#007aff'"></uni-icons>
            </view>
          </view>
          <view class="composer-actions">
            <button v-if="generating" class="action stop" type="warn" :disabled="stopping" @click="handleStop">停止</button>
            <button v-else class="action" type="primary" :disabled="inputDisabled || sending || recognizing || recording" @click="handleSend">发送</button>
          </view>
        </view>
      </view>
    </view>
    <view v-if="voiceSheet" class="voice-mask">
      <text class="voice-status" :style="{ bottom: (voiceRadius + 30) + 'px' }">{{ voiceMaskText }}</text>
      <view class="voice-arc" :style="arcStyle">
        <uni-icons type="mic-filled" size="84" color="#ffffff"></uni-icons>
      </view>
    </view>
    <view v-show="swipeOffset > 0" class="swipe-moon">
      <view class="swipe-crescent" :style="crescentMaskStyle"></view>
      <view
        class="swipe-label"
        @click.stop="confirmFreshChat"
        @touchstart.stop
        @mousedown.stop
      >
        <text class="swipe-char">新</text>
        <text class="swipe-char">建</text>
        <text class="swipe-char">对</text>
        <text class="swipe-char">话</text>
      </view>
    </view>
  </view>
</template>

<script>
  import DigitalStage from '@/components/digital-human/stage.vue'
  import MessageBubble from '@/components/ai/message-bubble.vue'
  import { visemeOf } from '@/components/digital-human/viseme'
  import { createSession, getSession, listMessage, getMessage, reconcileSession } from '@/api/ai/session'
  import { readHomeSession, writeHomeSession, removeHomeSession } from '@/utils/home-session'
  import { startChatStream, stopChat } from '@/api/ai/chat'
  import { asrErrorMessage, recognizeSpeech } from '@/api/ai/asr'
  import { canUseAndroidPcm, ensureMicPermission, isRecorderFormatError, learnAndroidCapture, permissionDeniedMessage, permissionGrantedAgainMessage, prepareWavFile, recordFallbackPlan, recordStartPlan, recorderErrorMessage, recordingTooLong, recordingTooShort, recordingTooShortMessage, startAndroidPcmCapture } from '@/utils/speech-recorder'
  import { MessageStatus, applyMessageAttachment } from '@/api/ai/types'
  import { createAiSocket } from '@/utils/socket'
  import { getPublished, getPublishedDefault, listPublished } from '@/api/digitalhuman/published'
  import { listOpenNotices } from '@/api/system/notice'
  import { assetSrc } from '@/components/digital-human/assets'
  import { isPublishedConfig, publishedImageFiles, sameRelease } from '@/components/digital-human/published-config'

  const HISTORY_PAGE_SIZE = 20

  let turnSeq = 0

  function nextLocalId() {
    turnSeq += 1
    return 'n' + turnSeq
  }

  function preloadImage(src) {
    return new Promise((resolve, reject) => {
      uni.getImageInfo({
        src: src,
        success: () => resolve(),
        fail: () => reject(new Error('image'))
      })
    })
  }

  function sameId(left, right) {
    return left != null && right != null && String(left) === String(right)
  }

  function asStatus(value, fallback) {
    if (value === undefined || value === null || value === '') {
      return fallback
    }
    return String(value)
  }

  const SWIPE_MAX = 112
  const SWIPE_OPEN = 56

  function readSystem() {
    try {
      return uni.getSystemInfoSync() || {}
    } catch (error) {
      return {}
    }
  }

  function pageHeightOf(info) {
    const height = info.windowHeight || 600
    const platform = String(info.uniPlatform || '').toLowerCase()
    if (platform === 'web') {
      return Math.max(240, height - 50)
    }
    return height
  }

  function rowToMessage(row) {
    return applyMessageAttachment({
      localId: 'h' + row.messageId,
      messageId: row.messageId,
      role: row.role,
      content: row.content || '',
      status: asStatus(row.status, MessageStatus.DONE),
      errorMsg: row.errorMsg || '',
      requestId: row.requestId || ''
    }, row.attachmentJson)
  }

  function tailPages(total, pageSize) {
    const count = total > 0 ? total : 0
    const lastPage = Math.max(1, Math.ceil(count / pageSize))
    const lastCount = count - (lastPage - 1) * pageSize
    const startPage = lastPage > 1 && lastCount < pageSize ? lastPage - 1 : lastPage
    return {
      startPage: startPage,
      lastPage: lastPage
    }
  }

  function pressPoint(event) {
    const touch = event && event.touches && event.touches[0]
    const source = touch || event
    if (!source || (source.clientX == null && source.pageX == null)) {
      return null
    }
    return {
      x: source.clientX != null ? source.clientX : source.pageX,
      y: source.clientY != null ? source.clientY : source.pageY
    }
  }

  function overlayChatHeight(slotHeight, imageTop, imageHeight) {
    const slot = slotHeight > 0 ? slotHeight : 0
    if (!(imageHeight > 0) || !(slot > 0)) {
      return Math.max(120, Math.round(slot * 0.5))
    }
    const top = imageTop > 0 ? imageTop : 0
    const height = slot - 10 - top - imageHeight * 0.5
    const max = Math.max(120, slot - 24)
    return Math.max(120, Math.min(max, Math.round(height)))
  }

  export default {
    components: {
      DigitalStage,
      MessageBubble
    },
    data() {
      const info = readSystem()
      const pageHeight = pageHeightOf(info)
      const statusBarHeight = info.statusBarHeight || 0
      const slotHeight = Math.max(160, pageHeight - (statusBarHeight + 44) - 52 - 18)
      return {
        pageHeight: pageHeight,
        statusBarHeight: statusBarHeight,
        viewWidth: info.windowWidth || 375,
        slotHeight: slotHeight,
        chatHeight: overlayChatHeight(slotHeight, 0, 0),
        chatOpen: false,
        imageTop: 0,
        imageHeight: 0,
        messagePage: 1,
        messageTotal: 0,
        loadingOlder: false,
        draft: '',
        editorLines: 1,
        messages: [],
        scrollAnchor: '',
        followTail: true,
        lastScrollTop: 0,
        swipe: null,
        swipeOffset: 0,
        swipeOpen: false,
        swipeDragging: false,
        swipeClickBlockUntil: 0,
        ignoreSwipeMouseUntil: 0,
        openingChat: false,
        replyText: '',
        pendingCitations: null,
        mouthKey: 'rest',
        mouthIndex: 0,
        mouthTimer: null,
        sessionId: null,
        assistantId: null,
        requestId: '',
        generating: false,
        sending: false,
        stopping: false,
        loadingHistory: false,
        socket: null,
        socketWaiters: [],
        needReconcile: false,
        holding: false,
        queued: [],
        recorder: null,
        recording: false,
        voiceSheet: false,
        recognizing: false,
        discardRecording: false,
        startingRecorder: false,
        formatRetried: false,
        recordSeconds: 0,
        recordTimer: null,
        androidCapture: null,
        armStop: false,
        armRecognize: false,
        pendingAudio: '',
        playingId: '',
        audioPlayer: null,
        press: null,
        pressTimer: null,
        voiceFromInput: false,
        voiceFinishing: false,
        micPrompting: false,
        pressReleasedDuringPrompt: false,
        recordPlan: null,
        ignoreMouseUntil: 0,
        avatarLoading: false,
        avatarToken: 0,
        avatarOpen: false,
        avatarChoices: [],
        avatarListLoading: false,
        activeAvatarCode: '',
        notices: [],
        noticeIndex: 0,
        noticeAnimating: false,
        noticeTimer: null,
        noticeReset: null
      }
    },
    computed: {
      canChat() {
        return this.allowed('ai:chat:chat')
      },
      canCreate() {
        return this.allowed('ai:session:add')
      },
      canOpenChat() {
        return this.allowed('ai:session:list')
      },
      canReadHistory() {
        return this.allowed('ai:session:query')
      },
      inputDisabled() {
        return !this.canChat || this.loadingHistory
      },
      logo() {
        const app = getApp()
        const info = app && app.globalData && app.globalData.config && app.globalData.config.appInfo
        return info && info.logo ? info.logo : '/static/logo.png'
      },
      noticeSlides() {
        const rows = this.notices.map(item => this.shortNotice(item))
        if (rows.length > 1) {
          rows.push(rows[0])
        }
        return rows
      },
      noticeTrackStyle() {
        return {
          transform: 'translateY(-' + this.noticeIndex * 56 + 'px)',
          transition: this.noticeAnimating ? 'transform 0.4s ease' : 'none'
        }
      },
      hasOlder() {
        return this.messagePage > 1
      },
      chatBodyHeight() {
        return Math.max(80, this.chatHeight - 50)
      },
      imageBottomGap() {
        if (!(this.imageHeight > 0) || !(this.slotHeight > 0)) {
          return 0
        }
        return Math.max(0, this.slotHeight - this.imageTop - this.imageHeight)
      },
      chatStyle() {
        return {
          bottom: '10px',
          height: this.chatHeight + 'px'
        }
      },
      reopenStyle() {
        return {
          bottom: '10px'
        }
      },
      crescentMaskStyle() {
        const width = this.viewWidth > 0 ? this.viewWidth : 375
        const radius = Math.max(48, Math.round(width - 200))
        const mask = 'radial-gradient(ellipse ' + radius + 'px 50% at 0 50%, transparent 99%, #000 100%)'
        return {
          '-webkit-mask-image': mask,
          'mask-image': mask
        }
      },
      editorStyle() {
        const lines = Math.max(1, Math.min(4, this.editorLines || 1))
        const height = 16 + lines * 24
        return { height: height + 'px' }
      },
      voiceMaskText() {
        if (this.recognizing && !this.recording && !this.startingRecorder) {
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
      }
    },
    watch: {
      draft(value) {
        if (!value && this.editorLines !== 1) {
          this.editorLines = 1
        }
      },
      'messages.length'(length) {
        if (length) {
          this.chatOpen = true
        }
        this.$nextTick(() => {
          this.measureLayout()
          setTimeout(() => this.measureLayout(), 320)
        })
      }
    },
    onLoad() {
      this.measureLayout()
      this.openSocket()
      this.openRecorder()
      this.loadStoredHistory()
      this.loadNotices()
      this.handleWindowResize = () => {
        this.measureLayout()
      }
      if (typeof uni !== 'undefined' && uni.onWindowResize) {
        uni.onWindowResize(this.handleWindowResize)
      }
    },
    onReady() {
      this.measureLayout()
      this.loadPublishedAvatar()
    },
    onShow() {
      this.scheduleLayout()
      this.loadPublishedAvatar()
      this.startNoticeRoll()
      this.learnCaptureRoute()
    },
    onHide() {
      this.stopNoticeRoll()
      this.stopHeldVoice()
      if (this.layoutTimer) {
        clearTimeout(this.layoutTimer)
        this.layoutTimer = null
      }
    },
    onUnload() {
      if (this.layoutTimer) {
        clearTimeout(this.layoutTimer)
        this.layoutTimer = null
      }
      this.avatarToken += 1
      this.stopNoticeRoll()
      this.stopMouth()
      this.stopRecordClock()
      this.voiceSheet = false
      this.clearPressTimer()
      this.unbindPageRelease()
      this.unbindMouseRelease()
      this.stopPlayback()
      this.discardRecording = true
      if (this.androidCapture) {
        const capture = this.androidCapture
        this.androidCapture = null
        this.discardRecording = true
        capture.stop(true)
      } else if (this.recording && this.recorder) {
        this.recorder.stop()
      }
      this.rejectWaiters()
      if (this.socket) {
        this.socket.close()
        this.socket = null
      }
      if (typeof uni !== 'undefined' && uni.offWindowResize && this.handleWindowResize) {
        uni.offWindowResize(this.handleWindowResize)
      }
    },
    methods: {
      loadPublishedAvatar() {
        const stage = this.$refs.human
        if (!stage || typeof stage.replaceConfig !== 'function' || this.avatarLoading) {
          return
        }
        const token = this.avatarToken
        this.avatarLoading = true
        getPublishedDefault().then(body => {
          if (token !== this.avatarToken || !body || body.code !== 200 || !isPublishedConfig(body.data)) {
            return null
          }
          return this.applyPublished(body.data, token)
        }).catch(() => {}).then(() => {
          if (token === this.avatarToken) {
            this.avatarLoading = false
          }
        })
      },
      applyPublished(config, token) {
        const stage = this.$refs.human
        if (!stage || token !== this.avatarToken || !isPublishedConfig(config)) {
          return null
        }
        const code = config.avatarCode ? String(config.avatarCode) : ''
        if (sameRelease(stage.releaseVersion(), config.releaseVersion) && stage.avatarCode() === code) {
          this.activeAvatarCode = code
          return null
        }
        const urls = publishedImageFiles(config).map(file => assetSrc(file))
        return Promise.all(urls.map(preloadImage)).then(() => {
          if (token !== this.avatarToken) {
            return
          }
          const current = this.$refs.human
          if (current && typeof current.replaceConfig === 'function') {
            current.replaceConfig(config)
            this.activeAvatarCode = code
          }
        })
      },
      toggleAvatarPanel() {
        this.avatarOpen = !this.avatarOpen
        if (this.avatarOpen) {
          this.loadAvatarChoices()
        }
      },
      loadAvatarChoices() {
        this.avatarListLoading = true
        listPublished().then(body => {
          const rows = body && body.code === 200 && Array.isArray(body.data) ? body.data : []
          this.avatarChoices = rows.filter(function(item) {
            if (!item || !item.avatarCode) {
              return false
            }
            const code = String(item.avatarCode)
            return code !== 'default' && code !== 'list'
          })
        }).catch(() => {
          this.avatarChoices = []
        }).then(() => {
          this.avatarListLoading = false
        })
      },
      avatarThumb(item) {
        return assetSrc(item && item.releaseThumbnail)
      },
      selectAvatar(item) {
        if (!item || !item.avatarCode) {
          return
        }
        const code = String(item.avatarCode)
        const stage = this.$refs.human
        this.avatarOpen = false
        if (stage && stage.avatarCode() === code && sameRelease(stage.releaseVersion(), item.releaseVersion)) {
          this.activeAvatarCode = code
          return
        }
        const token = this.avatarToken + 1
        this.avatarToken = token
        this.avatarLoading = true
        getPublished(code).then(body => {
          if (token !== this.avatarToken || !body || body.code !== 200 || !isPublishedConfig(body.data)) {
            return null
          }
          return this.applyPublished(body.data, token)
        }).catch(() => {}).then(() => {
          if (token === this.avatarToken) {
            this.avatarLoading = false
          }
        })
      },
      loadNotices() {
        listOpenNotices().then(titles => {
          this.notices = titles || []
          this.noticeIndex = 0
          this.noticeAnimating = false
          this.startNoticeRoll()
        })
      },
      shortNotice(title) {
        const chars = Array.from(String(title || '').trim())
        if (chars.length <= 20) {
          return chars.join('')
        }
        return chars.slice(0, 20).join('') + '…'
      },
      startNoticeRoll() {
        this.stopNoticeRoll()
        if (this.notices.length < 2) {
          this.noticeIndex = 0
          return
        }
        const self = this
        this.noticeTimer = setInterval(function() {
          self.noticeAnimating = true
          self.noticeIndex += 1
          if (self.noticeIndex >= self.notices.length) {
            self.noticeReset = setTimeout(function() {
              self.noticeReset = null
              if (self.noticeIndex < self.notices.length) {
                return
              }
              self.noticeAnimating = false
              self.noticeIndex = 0
            }, 420)
          }
        }, 3000)
      },
      stopNoticeRoll() {
        if (this.noticeTimer) {
          clearInterval(this.noticeTimer)
          this.noticeTimer = null
        }
        if (this.noticeReset) {
          clearTimeout(this.noticeReset)
          this.noticeReset = null
        }
      },
      openNotices() {
        this.$tab.navigateTo('/pages/system/notice/index')
      },
      onPortraitFrame(frame) {
        if (!frame || !(frame.height > 0)) {
          return
        }
        this.imageTop = frame.y || 0
        this.imageHeight = frame.height
        this.chatHeight = overlayChatHeight(this.slotHeight, this.imageTop, this.imageHeight)
      },
      hideChat() {
        this.chatOpen = false
      },
      showChat() {
        this.chatOpen = true
      },
      allowed(code) {
        const permissions = this.$store.getters && this.$store.getters.permissions
        if (!permissions || !permissions.length) {
          return false
        }
        return this.$auth.hasPermi(code)
      },
      scheduleLayout() {
        this.measureLayout()
        this.$nextTick(() => {
          this.measureLayout()
        })
        if (this.layoutTimer) {
          clearTimeout(this.layoutTimer)
        }
        this.layoutTimer = setTimeout(() => {
          this.layoutTimer = null
          this.measureLayout()
        }, 320)
      },
      measureLayout() {
        const info = readSystem()
        this.pageHeight = pageHeightOf(info)
        this.statusBarHeight = info.statusBarHeight || 0
        const query = uni.createSelectorQuery().in(this)
        query.select('.home-bar').boundingClientRect()
        query.select('.composer').boundingClientRect()
        query.select('.swipe-stage').boundingClientRect()
        query.exec(rects => {
          const bar = rects && rects[0]
          const composer = rects && rects[1]
          const stage = rects && rects[2]
          const latest = readSystem()
          const pageHeight = pageHeightOf(latest)
          const barHeight = bar && bar.height ? bar.height : (this.statusBarHeight + 44)
          const composerHeight = 52
          const expected = Math.max(160, pageHeight - barHeight - composerHeight - 18)
          let slotHeight = expected
          if (stage && stage.height > 18) {
            const measured = Math.max(160, Math.round(stage.height - 18))
            const limit = Math.max(24, Math.round(expected * 0.15))
            if (Math.abs(measured - expected) <= limit) {
              slotHeight = measured
            }
          }
          this.pageHeight = pageHeight
          this.viewWidth = stage && stage.width > 0 ? stage.width : (latest.windowWidth || this.viewWidth)
          this.slotHeight = slotHeight
          this.chatHeight = overlayChatHeight(slotHeight, this.imageTop, this.imageHeight)
          this.$nextTick(() => {
            if (this.$refs.human && this.$refs.human.measureFrame) {
              this.$refs.human.measureFrame()
            }
          })
        })
      },
      openFullChat() {
        this.$tab.navigateTo('/pages/ai/session/index')
      },
      loadStoredHistory() {
        if (!this.canReadHistory) {
          return
        }
        const saved = readHomeSession(this.$store.getters.id)
        if (saved === '' || saved == null) {
          return
        }
        this.loadingHistory = true
        const self = this
        this.claimStoredSession(saved).then(function(result) {
          if (result !== 'mine') {
            if (result === 'foreign') {
              self.releaseForeignSession()
            }
            return null
          }
          if (self.sessionId != null && !sameId(self.sessionId, saved)) {
            return null
          }
          self.rememberSession(saved)
          return listMessage(saved, { pageNum: 1, pageSize: HISTORY_PAGE_SIZE })
        }).then(first => {
          if (!first) {
            return null
          }
          const total = Number(first && first.total) || 0
          const plan = tailPages(total, HISTORY_PAGE_SIZE)
          if (plan.startPage === 1 && plan.lastPage === 1) {
            return {
              rows: (first && first.rows) || [],
              startPage: 1,
              total: total
            }
          }
          const tasks = []
          for (let page = plan.startPage; page <= plan.lastPage; page += 1) {
            if (page === 1) {
              tasks.push(Promise.resolve(first))
            } else {
              tasks.push(listMessage(saved, { pageNum: page, pageSize: HISTORY_PAGE_SIZE }))
            }
          }
          return Promise.all(tasks).then(function(pages) {
            const rows = []
            pages.forEach(function(page) {
              ;((page && page.rows) || []).forEach(function(row) {
                rows.push(row)
              })
            })
            return {
              rows: rows,
              startPage: plan.startPage,
              total: total
            }
          })
        }).then(payload => {
          const rows = payload && payload.rows
          if (!payload || self.messages.length || String(self.sessionId) !== String(saved)) {
            return
          }
          self.messageTotal = payload.total
          self.messagePage = payload.startPage
          self.messages = (rows || []).map(rowToMessage)
          const running = self.messages.filter(function(item) {
            return item.role === 'assistant' && item.status === MessageStatus.RUNNING
          }).pop()
          if (running) {
            self.assistantId = running.messageId
            self.requestId = running.requestId || ''
            self.generating = true
            self.replyText = running.content || ''
            self.mouthIndex = self.replyText.length
          }
          self.bump()
        }).catch(() => {}).finally(() => {
          self.loadingHistory = false
        })
      },
      loadOlderMessages() {
        if (!this.hasOlder || this.loadingOlder || this.loadingHistory || !this.canReadHistory || this.sessionId == null) {
          return
        }
        const sessionId = this.sessionId
        const pageNum = this.messagePage - 1
        const anchor = this.messages.length ? ('turn-' + this.messages[0].localId) : ''
        this.loadingOlder = true
        this.followTail = false
        listMessage(sessionId, {
          pageNum: pageNum,
          pageSize: HISTORY_PAGE_SIZE
        }).then(res => {
          if (String(this.sessionId) !== String(sessionId) || !res || res.code !== 200) {
            return
          }
          const seen = {}
          this.messages.forEach(function(item) {
            if (item.messageId != null) {
              seen[String(item.messageId)] = true
            }
          })
          const prefix = (res.rows || []).map(rowToMessage).filter(function(item) {
            return !seen[String(item.messageId)]
          })
          this.messages = prefix.concat(this.messages)
          this.messagePage = pageNum
          if (!anchor) {
            return
          }
          this.scrollAnchor = ''
          this.$nextTick(() => {
            this.scrollAnchor = anchor
          })
        }).catch(() => {}).finally(() => {
          this.loadingOlder = false
        })
      },
      rememberSession(sessionId) {
        this.sessionId = sessionId
        try {
          writeHomeSession(this.$store.getters.id, sessionId)
        } catch (error) {}
      },
      claimStoredSession(sessionId) {
        const mine = this.$store.getters.id
        return getSession(sessionId, { skipErrorToast: true }).then(res => {
          if (res && res.code === 200 && res.data && sameId(res.data.userId, mine)) {
            return 'mine'
          }
          return 'foreign'
        }).catch(function(error) {
          return error === '500' ? 'foreign' : 'unknown'
        })
      },
      releaseForeignSession() {
        this.sessionId = null
        removeHomeSession(this.$store.getters.id)
      },
      openSocket() {
        const self = this
        this.socket = createAiSocket({
          onOpen() {
            const waiters = self.socketWaiters.splice(0)
            waiters.forEach(function(waiter) {
              waiter.resolve()
            })
            self.onSocketOpen()
          },
          onMessage(message) {
            self.onSocketMessage(message)
          },
          onClose() {
            self.onSocketClose()
          },
          onAuthMissing() {
            self.rejectWaiters()
          }
        })
        this.socket.connect()
      },
      ensureSocket() {
        if (this.socket && this.socket.isOpen()) {
          return Promise.resolve()
        }
        const self = this
        return new Promise(function(resolve, reject) {
          const waiter = {
            resolve: function() {
              clearTimeout(timer)
              resolve()
            },
            reject: function(error) {
              clearTimeout(timer)
              reject(error)
            }
          }
          const timer = setTimeout(function() {
            self.socketWaiters = self.socketWaiters.filter(function(item) {
              return item !== waiter
            })
            reject(new Error('socket timeout'))
          }, 8000)
          self.socketWaiters.push(waiter)
          if (!self.socket) {
            self.openSocket()
          } else {
            self.socket.connect()
          }
        })
      },
      onSocketClose() {
        if (this.generating || this.sending) {
          this.needReconcile = true
        }
      },
      onSocketOpen() {
        if (!this.needReconcile || this.sessionId == null || !this.canReadHistory) {
          return
        }
        const sessionId = this.sessionId
        const assistantId = this.assistantId
        this.needReconcile = false
        const self = this
        reconcileSession(sessionId).catch(() => {}).finally(() => {
          if (!sameId(self.sessionId, sessionId) || assistantId == null) {
            return
          }
          getMessage(sessionId, assistantId).then(res => {
            if (!res || res.code !== 200 || !res.data || !sameId(res.data.messageId, self.assistantId)) {
              return
            }
            self.mergeServerText(res.data)
          }).catch(() => {})
        })
      },
      mergeServerText(data) {
        const patch = {
          status: asStatus(data.status, MessageStatus.FAILED)
        }
        if (data.errorMsg) {
          patch.errorMsg = data.errorMsg
        } else if (patch.status !== MessageStatus.FAILED) {
          patch.errorMsg = ''
        }
        if (data.content) {
          patch.content = data.content
          this.replyText = data.content
          this.mouthIndex = data.content.length
        }
        if (patch.status !== MessageStatus.RUNNING) {
          this.generating = false
          this.stopping = false
          this.stopMouth()
        }
        this.patchAssistant(patch)
      },
      rejectWaiters() {
        this.socketWaiters.splice(0).forEach(function(waiter) {
          waiter.reject(new Error('socket closed'))
        })
      },
      onSocketMessage(message) {
        if (this.holding) {
          this.queued.push(message)
          return
        }
        this.applySocket(message)
      },
      releaseQueue() {
        const queued = this.queued.splice(0)
        const self = this
        queued.forEach(function(item) {
          self.applySocket(item)
        })
      },
      applySocket(message) {
        const type = String(message && message.type || '').toUpperCase()
        const data = message && message.data || {}
        if (data.sessionId != null && this.sessionId != null && !sameId(data.sessionId, this.sessionId)) {
          return
        }
        if (type === 'AI_DELTA') {
          this.onDelta(data)
          return
        }
        if (type === 'AI_TOOL_START') {
          this.onTool(data, true)
          return
        }
        if (type === 'AI_TOOL') {
          this.onTool(data, false)
          return
        }
        if (type === 'AI_CITATIONS') {
          this.onCitations(data)
          return
        }
        if (type === 'AI_DONE') {
          this.onDone(data)
          return
        }
        if (type === 'AI_CANCELLED') {
          this.generating = false
          this.stopping = false
          this.pendingCitations = null
          this.replyText = data.content || this.replyText
          this.mouthIndex = (this.replyText || '').length
          this.patchAssistant({
            status: MessageStatus.STOPPED,
            content: this.replyText
          })
          this.stopMouth()
          this.bump()
          return
        }
        if (type === 'AI_ERROR') {
          this.onError(data)
        }
      },
      assistantIndex() {
        return this.messages.findIndex(item => sameId(item.messageId, this.assistantId))
      },
      patchAssistant(partial) {
        const index = this.assistantIndex()
        if (index < 0) {
          return
        }
        this.$set(this.messages, index, Object.assign({}, this.messages[index], partial))
      },
      onDelta(data) {
        if (data.messageId == null || !sameId(data.messageId, this.assistantId) || !data.delta) {
          return
        }
        const index = this.assistantIndex()
        const current = index < 0 ? '' : (this.messages[index].content || '')
        const base = this.replyText || current
        this.replyText = base + data.delta
        this.patchAssistant({ content: this.replyText })
        this.ensureMouth()
        this.bump()
      },
      onTool(data, starting) {
        if (data.messageId == null || !sameId(data.messageId, this.assistantId)) {
          return
        }
        const index = this.assistantIndex()
        const current = index < 0 ? null : this.messages[index]
        if (starting && current && current.tool && current.tool.records && current.tool.records.length) {
          return
        }
        const kept = current && current.tool && Array.isArray(current.tool.records) ? current.tool.records : []
        const tool = {
          name: data.name || (current && current.tool && current.tool.name) || '',
          status: starting ? '' : (data.status || ''),
          saved: data.saved === true,
          ready: data.ready !== false,
          message: data.message || '',
          expireTime: data.expireTime || '',
          records: Array.isArray(data.records) ? data.records : kept,
          candidates: Array.isArray(data.candidates) ? data.candidates : []
        }
        if (data.saved === true && data.recordId != null) {
          tool.recordId = data.recordId
        }
        this.patchAssistant({ tool: tool })
        this.bump()
      },
      onCitations(data) {
        if (data.messageId == null || !sameId(data.messageId, this.assistantId)) {
          return
        }
        this.pendingCitations = {
          citations: data.citations || [],
          grounded: data.grounded === true,
          citationStatus: data.status || ''
        }
      },
      onDone(data) {
        if (data.messageId != null && !sameId(data.messageId, this.assistantId)) {
          return
        }
        this.generating = false
        this.stopping = false
        this.replyText = data.content || this.replyText
        const patch = {
          status: MessageStatus.DONE,
          content: this.replyText,
          errorMsg: ''
        }
        if (this.pendingCitations) {
          Object.assign(patch, this.pendingCitations)
          this.pendingCitations = null
        }
        this.patchAssistant(patch)
        this.ensureMouth()
        this.bump()
      },
      onError(data) {
        this.generating = false
        this.stopping = false
        this.pendingCitations = null
        const errorText = data.msg || '生成失败'
        const index = this.assistantIndex()
        const current = index < 0 ? null : this.messages[index]
        const partial = {
          status: MessageStatus.FAILED,
          errorMsg: errorText
        }
        if (errorText === '健康记录保存失败' && current && current.tool) {
          partial.tool = Object.assign({}, current.tool, { saved: false })
          if (partial.tool.status === 'saved') {
            partial.tool.status = ''
          }
        }
        this.patchAssistant(partial)
        this.stopMouth()
        if (this.sessionId != null && data.messageId != null) {
          getMessage(this.sessionId, data.messageId).then(res => {
            if (!res || res.code !== 200 || !res.data || !sameId(res.data.messageId, this.assistantId)) {
              return
            }
            const patch = {
              status: asStatus(res.data.status, MessageStatus.FAILED),
              errorMsg: res.data.errorMsg || errorText
            }
            if (res.data.content) {
              patch.content = res.data.content
              this.replyText = res.data.content
              this.mouthIndex = res.data.content.length
            }
            this.patchAssistant(patch)
          }).catch(() => {})
        }
        this.bump()
      },
      ensureMouth() {
        if (this.mouthTimer) {
          return
        }
        const self = this
        this.mouthTimer = setInterval(function() {
          const text = self.replyText || ''
          if (self.mouthIndex >= text.length) {
            if (!self.generating) {
              self.mouthKey = 'rest'
              self.stopMouth()
            }
            return
          }
          const lag = text.length - self.mouthIndex
          const step = lag > 30 ? 3 : 1
          self.mouthKey = visemeOf(text.charAt(self.mouthIndex))
          self.mouthIndex += step
        }, 90)
      },
      stopMouth() {
        if (this.mouthTimer) {
          clearInterval(this.mouthTimer)
          this.mouthTimer = null
        }
        this.mouthKey = 'rest'
      },
      onChatScroll(event) {
        const detail = event && event.detail ? event.detail : {}
        const top = Number(detail.scrollTop) || 0
        const height = Number(detail.scrollHeight) || 0
        const view = this.chatHeight || 0
        const nearBottom = height - view - top <= 48
        const previous = this.lastScrollTop
        this.lastScrollTop = top
        if (nearBottom) {
          this.followTail = true
          return
        }
        if (top < previous - 12) {
          this.followTail = false
        }
      },
      bump() {
        if (!this.followTail) {
          return
        }
        const last = this.messages[this.messages.length - 1]
        if (!last) {
          return
        }
        const anchor = 'tail-' + last.localId
        this.scrollAnchor = ''
        this.$nextTick(() => {
          this.scrollAnchor = anchor
        })
      },
      onSwipeStart(event, fromTouch) {
        if (fromTouch) {
          this.ignoreSwipeMouseUntil = Date.now() + 800
        } else if (Date.now() < this.ignoreSwipeMouseUntil) {
          return
        }
        if (!this.canCreate || this.recording || this.recognizing || this.startingRecorder || this.openingChat) {
          return
        }
        const point = pressPoint(event)
        if (!point) {
          return
        }
        this.swipe = {
          x: point.x,
          y: point.y,
          origin: this.swipeOffset,
          locked: false,
          moved: false
        }
      },
      onSwipeMove(event, fromTouch) {
        if (!fromTouch && Date.now() < this.ignoreSwipeMouseUntil) {
          return
        }
        if (!this.swipe) {
          return
        }
        const point = pressPoint(event)
        if (!point) {
          return
        }
        const dx = point.x - this.swipe.x
        const dy = point.y - this.swipe.y
        if (!this.swipe.locked) {
          if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
            return
          }
          if (Math.abs(dy) >= Math.abs(dx)) {
            this.swipe = null
            return
          }
          this.swipe.locked = true
          this.swipeDragging = true
        }
        this.swipe.moved = true
        const next = this.swipe.origin - dx
        this.swipeOffset = Math.max(0, Math.min(SWIPE_MAX, next))
      },
      onSwipeEnd(fromTouch) {
        if (!fromTouch && Date.now() < this.ignoreSwipeMouseUntil) {
          return
        }
        const swipe = this.swipe
        this.swipe = null
        if (!swipe || !swipe.locked) {
          this.swipeDragging = false
          return
        }
        if (swipe.moved) {
          this.swipeClickBlockUntil = Date.now() + 350
        }
        const target = this.swipeOffset >= SWIPE_OPEN ? SWIPE_MAX : 0
        this.swipeDragging = false
        this.swipeOpen = target === SWIPE_MAX
        this.$nextTick(() => {
          this.swipeOffset = target
        })
      },
      onSwipeCancel(fromTouch) {
        this.onSwipeEnd(fromTouch)
      },
      onSwipeMaskClick() {
        if (Date.now() < this.swipeClickBlockUntil) {
          return
        }
        this.closeSwipe()
      },
      closeSwipe() {
        this.swipe = null
        this.swipeDragging = false
        this.swipeOpen = false
        this.swipeOffset = 0
      },
      confirmFreshChat() {
        if (Date.now() < this.swipeClickBlockUntil || !this.swipeOpen || this.openingChat) {
          return
        }
        this.openFreshChat()
      },
      openFreshChat() {
        if (this.openingChat || this.recording || this.recognizing || this.startingRecorder) {
          return
        }
        if (!this.canCreate) {
          this.$modal.msgError('没有新建会话权限')
          return
        }
        const previousId = this.sessionId
        const requestId = this.generating ? this.requestId : ''
        this.openingChat = true
        const stop = requestId ? stopChat(requestId).catch(() => {}) : Promise.resolve()
        if (requestId) {
          this.stopping = true
          this.mouthIndex = (this.replyText || '').length
          this.stopMouth()
        }
        stop.then(() => {
          return createSession({ title: '首页对话' })
        }).then(res => {
          if (!res || res.code !== 200 || !res.data || !res.data.sessionId) {
            return
          }
          if (previousId != null && !sameId(this.sessionId, previousId)) {
            return
          }
          this.rememberSession(res.data.sessionId)
          this.closeSwipe()
          this.messages = []
          this.messagePage = 1
          this.messageTotal = 0
          this.assistantId = null
          this.requestId = ''
          this.generating = false
          this.sending = false
          this.replyText = ''
          this.mouthIndex = 0
          this.pendingAudio = ''
          this.queued = []
          this.followTail = true
          this.scrollAnchor = ''
          this.stopMouth()
        }).catch(() => {}).finally(() => {
          this.openingChat = false
          this.stopping = false
        })
      },
      applyStoredUserText(sessionId, messageId) {
        getMessage(sessionId, messageId).then(res => {
          if (!sameId(this.sessionId, sessionId) || !res || res.code !== 200 || !res.data) {
            return
          }
          const stored = res.data.content
          if (stored == null || stored === '') {
            return
          }
          const index = this.messages.findIndex(function(item) {
            return item.role === 'user' && sameId(item.messageId, messageId)
          })
          if (index === -1) {
            return
          }
          this.$set(this.messages, index, Object.assign({}, this.messages[index], {
            content: stored
          }))
        }).catch(() => {})
      },
      sendPhrase(text) {
        if (text !== '确认' && text !== '取消') {
          return
        }
        this.sendContent(text)
      },
      handleSend() {
        this.sendContent(this.draft, true)
      },
      sendContent(raw, withRecording) {
        if (this.sending || this.generating || this.loadingHistory || this.recording || this.recognizing || this.openingChat) {
          return
        }
        const content = String(raw || '').trim()
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
        const localId = nextLocalId()
        const attachedAudio = withRecording ? this.pendingAudio : ''
        const userMessage = {
          localId: localId,
          role: 'user',
          content: content,
          status: MessageStatus.DONE
        }
        if (attachedAudio) {
          userMessage.localAudio = attachedAudio
          this.pendingAudio = ''
        }
        this.messages.push(userMessage)
        if (this.draft.trim() === content) {
          this.draft = ''
        }
        this.stopMouth()
        this.replyText = ''
        this.mouthIndex = 0
        this.followTail = true
        this.bump()
        const forgetLocal = () => {
          const index = this.messages.findIndex(function(item) {
            return item.localId === localId && item.messageId == null
          })
          if (index !== -1) {
            this.messages.splice(index, 1)
            if (attachedAudio) {
              this.pendingAudio = attachedAudio
            }
          }
          if (!this.draft) {
            this.draft = content
          }
        }
        const sendTo = (sessionId) => {
          this.sending = true
          this.holding = true
          return this.ensureSocket().then(() => {
            return startChatStream({
              sessionId: sessionId,
              content: content
            })
          }).then(res => {
            if (!sameId(this.sessionId, sessionId)) {
              return
            }
            if (!res || res.code !== 200 || !res.data || !res.data.assistantMessageId) {
              forgetLocal()
              return
            }
            const userIndex = this.messages.findIndex(function(item) {
              return item.localId === localId
            })
            if (userIndex !== -1 && res.data.userMessageId != null) {
              const userMessageId = res.data.userMessageId
              this.$set(this.messages, userIndex, Object.assign({}, this.messages[userIndex], {
                messageId: userMessageId
              }))
              this.applyStoredUserText(sessionId, userMessageId)
            }
            this.assistantId = res.data.assistantMessageId
            this.requestId = res.data.requestId || ''
            this.pendingCitations = null
            this.generating = true
            this.mouthKey = 'rest'
            this.messages.push({
              localId: nextLocalId(),
              messageId: res.data.assistantMessageId,
              role: 'assistant',
              content: '',
              status: MessageStatus.RUNNING,
              requestId: this.requestId,
              intent: res.data.intent || '',
              errorMsg: '',
              tool: null
            })
            this.bump()
          }).catch(error => {
            forgetLocal()
            if (error && error.message === 'socket timeout') {
              this.$modal.msgError('实时连接失败')
            }
          }).finally(() => {
            this.sending = false
            this.holding = false
            this.releaseQueue()
          })
        }
        const openOwnSession = () => {
          if (!this.canCreate) {
            forgetLocal()
            this.$modal.msgError('没有新建会话权限')
            return
          }
          this.sending = true
          createSession({ title: '首页对话' }).then(res => {
            if (!res || res.code !== 200 || !res.data || !res.data.sessionId) {
              this.sending = false
              forgetLocal()
              return
            }
            this.rememberSession(res.data.sessionId)
            return sendTo(res.data.sessionId)
          }).catch(() => {
            this.sending = false
            forgetLocal()
          })
        }
        if (!this.sessionId) {
          openOwnSession()
          return
        }
        this.claimStoredSession(this.sessionId).then(result => {
          if (result === 'foreign') {
            this.releaseForeignSession()
            openOwnSession()
            return
          }
          sendTo(this.sessionId)
        })
      },
      onDraftInput(event) {
        const detail = event && event.detail
        const value = detail && detail.value != null ? detail.value : ''
        this.draft = String(value)
        if (!this.draft) {
          this.editorLines = 1
        }
      },
      onEditorLine(event) {
        const count = event && event.detail ? Number(event.detail.lineCount) : 0
        if (count > 0) {
          this.editorLines = count
        }
      },
      handleStop() {
        if (!this.requestId || this.stopping) {
          return
        }
        this.stopping = true
        this.mouthIndex = (this.replyText || '').length
        this.stopMouth()
        stopChat(this.requestId).catch(() => {
          this.stopping = false
        })
      },
      openRecorder() {
        if (!uni.getRecorderManager) {
          return
        }
        const recorder = uni.getRecorderManager()
        const self = this
        recorder.onStart(function() {
          if (self.androidCapture || (!self.armStop && !self.startingRecorder && !self.voiceFromInput)) {
            return
          }
          self.recording = true
          self.voiceSheet = true
          self.startingRecorder = false
          if (!self.recordTimer) {
            self.startRecordClock()
          }
          if (self.armStop) {
            self.discardRecording = !self.armRecognize
            self.recorder.stop()
          }
        })
        recorder.onStop(function(res) {
          if (self.androidCapture || (!self.recording && !self.startingRecorder && !self.voiceFinishing)) {
            return
          }
          self.recording = false
          self.startingRecorder = false
          self.voiceFinishing = false
          self.formatRetried = false
          self.armStop = false
          self.armRecognize = false
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
          if (self.androidCapture || (!self.recording && !self.startingRecorder && !self.voiceFromInput)) {
            return
          }
          const retry = !self.formatRetried && !self.armStop && isRecorderFormatError(error)
          self.recording = false
          self.startingRecorder = false
          self.voiceFinishing = false
          if (retry) {
            self.formatRetried = true
            self.discardRecording = false
            const fallback = recordFallbackPlan()
            self.recordPlan = fallback
            self.startingRecorder = true
            self.startRecordClock()
            try {
              self.recorder.start(fallback.options)
            } catch (retryError) {
              self.startingRecorder = false
              self.voiceFromInput = false
              self.formatRetried = false
              self.stopRecordClock()
              self.showVoiceError(recorderErrorMessage(retryError))
            }
            return
          }
          self.formatRetried = false
          self.armStop = false
          self.armRecognize = false
          self.discardRecording = false
          self.voiceFromInput = false
          self.stopRecordClock()
          self.showVoiceError(recorderErrorMessage(error))
        })
        this.recorder = recorder
      },
      clearPressTimer() {
        if (this.pressTimer) {
          clearTimeout(this.pressTimer)
          this.pressTimer = null
        }
      },
      startRecordClock() {
        this.stopRecordClock()
        this.recordSeconds = 0
        this.recordTimer = setInterval(() => {
          if (this.recordSeconds < 60) {
            this.recordSeconds += 1
          }
        }, 1000)
      },
      stopRecordClock() {
        if (this.recordTimer) {
          clearInterval(this.recordTimer)
          this.recordTimer = null
        }
        this.recordSeconds = 0
      },
      showVoiceError(message) {
        this.voiceSheet = false
        const text = String(message || '录音失败，请改用文字')
        this.$modal.alert(text)
        this.scheduleCaptureRoute()
      },
      insideArc(point) {
        if (!point) {
          return false
        }
        const cx = (this.viewWidth || 375) / 2
        const cy = this.pageHeight
        const radius = this.voiceRadius
        const dx = point.x - cx
        const dy = point.y - cy
        return dx * dx + dy * dy <= radius * radius && point.y <= cy + 2
      },
      bindPageRelease() {
        if (typeof document === 'undefined' || this.onPageTouchEnd) {
          return
        }
        this.onPageTouchEnd = () => {
          this.onHomeTouchEnd()
        }
        this.onPageTouchCancel = () => {
          this.onHomeTouchCancel()
        }
        this.onPageTouchMove = (event) => {
          this.onHomeTouchMove(event)
        }
        document.addEventListener('touchend', this.onPageTouchEnd, true)
        document.addEventListener('touchcancel', this.onPageTouchCancel, true)
        document.addEventListener('touchmove', this.onPageTouchMove, true)
      },
      unbindPageRelease() {
        if (typeof document === 'undefined' || !this.onPageTouchEnd) {
          return
        }
        document.removeEventListener('touchend', this.onPageTouchEnd, true)
        document.removeEventListener('touchcancel', this.onPageTouchCancel, true)
        document.removeEventListener('touchmove', this.onPageTouchMove, true)
        this.onPageTouchEnd = null
        this.onPageTouchCancel = null
        this.onPageTouchMove = null
      },
      voiceGestureActive() {
        return !!(this.press || this.micPrompting || this.voiceFromInput || this.recording || this.startingRecorder)
      },
      onHomeTouchMove(event) {
        if (!this.press) {
          return
        }
        this.onPressMove(event, true)
      },
      onHomeTouchEnd() {
        if (!this.voiceGestureActive()) {
          return
        }
        this.onPressEnd(true)
      },
      onHomeTouchCancel() {
        if (!this.voiceGestureActive()) {
          return
        }
        this.onPressCancel(true)
      },
      stopHeldVoice() {
        this.unbindPageRelease()
        this.unbindMouseRelease()
        this.clearPressTimer()
        this.press = null
        this.pressReleasedDuringPrompt = true
        if (this.micPrompting && !this.recording && !this.startingRecorder) {
          this.voiceFromInput = false
          return
        }
        if (this.recording || this.startingRecorder || this.androidCapture) {
          this.voiceFromInput = false
          this.finishInputHold(false)
        }
      },
      bindMouseRelease() {
        if (typeof document === 'undefined' || this.onDocRelease) {
          return
        }
        this.onDocRelease = () => {
          this.onPressEnd(false)
        }
        document.addEventListener('mouseup', this.onDocRelease)
      },
      unbindMouseRelease() {
        if (typeof document === 'undefined' || !this.onDocRelease) {
          return
        }
        document.removeEventListener('mouseup', this.onDocRelease)
        this.onDocRelease = null
      },
      onPressStart(event, fromTouch) {
        if (fromTouch) {
          this.ignoreMouseUntil = Date.now() + 800
        } else if (Date.now() < this.ignoreMouseUntil) {
          return
        }
        if (this.inputDisabled || this.sending || this.generating || this.recognizing || this.recording || this.startingRecorder) {
          return
        }
        const point = pressPoint(event)
        if (!point) {
          return
        }
        this.armStop = false
        this.armRecognize = false
        this.press = {
          x: point.x,
          y: point.y,
          moved: false
        }
        this.clearPressTimer()
        this.pressTimer = setTimeout(() => {
          this.pressTimer = null
          if (!this.press || this.press.moved) {
            return
          }
          this.voiceFromInput = true
          this.beginRecording()
        }, 450)
        this.bindPageRelease()
        if (!fromTouch) {
          this.bindMouseRelease()
        }
      },
      onPressMove(event, fromTouch) {
        if (!fromTouch && Date.now() < this.ignoreMouseUntil) {
          return
        }
        if (!this.press) {
          return
        }
        if (this.micPrompting) {
          const moved = pressPoint(event)
          if (moved && (Math.abs(moved.x - this.press.x) > 28 || Math.abs(moved.y - this.press.y) > 28)) {
            this.pressReleasedDuringPrompt = true
            this.voiceFromInput = false
          }
          return
        }
        const point = pressPoint(event)
        if (!point) {
          return
        }
        const far = Math.abs(point.x - this.press.x) > 28 || Math.abs(point.y - this.press.y) > 28
        if (this.recording || this.startingRecorder) {
          if (!this.insideArc(point)) {
            this.press = null
            this.finishInputHold(true)
          }
          return
        }
        if (far) {
          this.press.moved = true
          this.clearPressTimer()
        }
      },
      onPressEnd(fromTouch) {
        if (!fromTouch && Date.now() < this.ignoreMouseUntil) {
          return
        }
        this.unbindMouseRelease()
        this.unbindPageRelease()
        if (this.micPrompting) {
          this.pressReleasedDuringPrompt = true
          this.voiceFromInput = false
          this.clearPressTimer()
          this.press = null
          return
        }
        const armed = this.voiceFromInput || this.recording || this.startingRecorder
        this.clearPressTimer()
        this.press = null
        if (!armed) {
          return
        }
        this.voiceFromInput = false
        this.finishInputHold(true)
      },
      onPressCancel(fromTouch) {
        if (!fromTouch && Date.now() < this.ignoreMouseUntil) {
          return
        }
        this.unbindMouseRelease()
        this.unbindPageRelease()
        if (this.micPrompting) {
          this.pressReleasedDuringPrompt = true
          this.voiceFromInput = false
          this.clearPressTimer()
          this.press = null
          return
        }
        this.clearPressTimer()
        this.press = null
        if (!this.voiceFromInput && !this.recording && !this.startingRecorder) {
          return
        }
        this.voiceFromInput = false
        if (this.recording || this.startingRecorder) {
          this.finishInputHold(true)
          return
        }
        this.finishInputHold(false)
      },
      finishInputHold(recognize) {
        if (this.voiceFinishing) {
          return
        }
        if (!this.recording && !this.startingRecorder) {
          this.armStop = true
          this.armRecognize = recognize
          return
        }
        this.voiceFinishing = true
        this.armRecognize = recognize
        this.armStop = true
        if (this.androidCapture) {
          const capture = this.androidCapture
          this.androidCapture = null
          this.discardRecording = !recognize
          capture.stop(!recognize)
          return
        }
        if (this.recording && this.recorder) {
          this.discardRecording = !recognize
          this.recorder.stop()
        }
      },
      learnCaptureRoute() {
        if (this.recording || this.startingRecorder || this.androidCapture || this.voiceFromInput || this.micPrompting || this.recognizing) {
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
      beginRecording() {
        if (!this.recorder && !canUseAndroidPcm()) {
          this.voiceFromInput = false
          this.showVoiceError('当前环境不能录音，请改用文字')
          return
        }
        this.formatRetried = false
        const plan = recordStartPlan()
        this.recordPlan = plan
        this.micPrompting = true
        this.pressReleasedDuringPrompt = false
        const self = this
        ensureMicPermission().then(function(result) {
          self.micPrompting = false
          if (result === 'denied') {
            self.voiceFromInput = false
            self.showVoiceError(permissionDeniedMessage())
            return
          }
          if (self.pressReleasedDuringPrompt || !self.voiceFromInput) {
            self.voiceFromInput = false
            if (result === 'just-granted') {
              self.showVoiceError(permissionGrantedAgainMessage())
            }
            self.learnCaptureRoute()
            return
          }
          if (canUseAndroidPcm()) {
            self.launchAndroidRecorder()
            return
          }
          self.launchRecorder()
        }).catch(function() {
          self.micPrompting = false
          self.voiceFromInput = false
          self.showVoiceError(recorderErrorMessage())
        })
      },
      launchRecorder() {
        if (!this.recorder) {
          if (this.voiceFromInput && canUseAndroidPcm()) {
            this.launchAndroidRecorder()
            return
          }
          this.voiceFromInput = false
          this.showVoiceError('当前环境不能录音，请改用文字')
          return
        }
        const plan = this.recordPlan || recordStartPlan()
        this.recordPlan = plan
        this.stopPlayback()
        this.discardRecording = false
        this.startingRecorder = true
        this.voiceSheet = true
        this.startRecordClock()
        try {
          this.recorder.start(plan.options)
        } catch (error) {
          if (!this.formatRetried && isRecorderFormatError(error)) {
            this.formatRetried = true
            const fallback = recordFallbackPlan()
            this.recordPlan = fallback
            try {
              this.recorder.start(fallback.options)
              return
            } catch (retryError) {
              error = retryError
            }
          }
          this.startingRecorder = false
          this.voiceFromInput = false
          this.formatRetried = false
          this.stopRecordClock()
          this.showVoiceError(recorderErrorMessage(error))
        }
      },
      launchAndroidRecorder() {
        const self = this
        this.recordPlan = { wrapPcm: false }
        this.stopPlayback()
        this.discardRecording = false
        this.startingRecorder = true
        this.voiceSheet = true
        this.startRecordClock()
        let opened = false
        let failedBeforeStart = false
        let released = false
        const holder = { capture: null }
        holder.capture = startAndroidPcmCapture({
          onStart: function() {
            opened = true
            self.recording = true
            self.voiceSheet = true
            self.startingRecorder = false
            if (!self.recordTimer) {
              self.startRecordClock()
            }
            if (self.armStop && self.androidCapture) {
              const active = self.androidCapture
              self.androidCapture = null
              self.discardRecording = !self.armRecognize
              active.stop(self.discardRecording)
            }
          },
          onStop: function(res) {
            self.androidCapture = null
            self.recording = false
            self.startingRecorder = false
            self.voiceFinishing = false
            self.armStop = false
            self.armRecognize = false
            self.stopRecordClock()
            if (self.discardRecording) {
              self.discardRecording = false
              self.voiceSheet = false
              self.scheduleCaptureRoute()
              return
            }
            self.submitRecording(res || {})
          },
          onError: function() {
            if (holder.capture && self.androidCapture === holder.capture) {
              self.androidCapture = null
            }
            released = self.armStop
            self.recording = false
            self.startingRecorder = false
            self.voiceFinishing = false
            self.armStop = false
            self.armRecognize = false
            self.discardRecording = false
            self.stopRecordClock()
            if (!opened || (arguments[0] && arguments[0].empty)) {
              failedBeforeStart = !opened
              if (opened && self.voiceFromInput && self.recorder && !released) {
                self.formatRetried = false
                self.launchRecorder()
                return
              }
              if (!opened) {
                return
              }
            }
            self.voiceFromInput = false
            self.showVoiceError('当前设备不能按要求录音，请改用文字')
          }
        })
        if (failedBeforeStart) {
          if (self.voiceFromInput && self.recorder && !released) {
            self.formatRetried = false
            self.launchRecorder()
            return
          }
          self.voiceFromInput = false
          self.showVoiceError('当前设备不能按要求录音，请改用文字')
          return
        }
        if (self.armStop) {
          self.recording = false
          self.startingRecorder = false
          self.voiceFinishing = false
          self.stopRecordClock()
          holder.capture.stop(!self.armRecognize)
          self.armStop = false
          self.armRecognize = false
          return
        }
        if (this.recording || this.startingRecorder) {
          this.androidCapture = holder.capture
        }
      },
      launchPcmRecorder() {
        if (!this.recorder) {
          this.voiceFromInput = false
          this.showVoiceError('当前设备不能按要求录音，请改用文字')
          return
        }
        const plan = recordFallbackPlan()
        this.recordPlan = plan
        this.formatRetried = true
        this.stopPlayback()
        this.discardRecording = false
        this.startingRecorder = true
        this.voiceSheet = true
        this.startRecordClock()
        try {
          this.recorder.start(plan.options)
        } catch (error) {
          this.startingRecorder = false
          this.voiceFromInput = false
          this.formatRetried = false
          this.stopRecordClock()
          this.showVoiceError(recorderErrorMessage(error))
        }
      },
      submitRecording(result) {
        if (result && result.silent) {
          this.showVoiceError('没有采集到声音，请靠近手机再说')
          return
        }
        const filePath = result.tempFilePath || ''
        if (!filePath) {
          this.showVoiceError('没有录音文件，请重新按住说话')
          return
        }
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
          if ((!ready || ready.error) && !wrapPcm) {
            return prepareWavFile(filePath, true)
          }
          return ready
        }).then(function(ready) {
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
        if (this.sessionId) {
          extra.sessionId = this.sessionId
        }
        this.recognizing = true
        recognizeSpeech(filePath, extra).then(res => {
          const text = res && res.data && res.data.recognizedText != null ? String(res.data.recognizedText) : ''
          if (!text) {
            this.showVoiceError('没有识别到文字')
            return
          }
          this.draft = text
          this.pendingAudio = filePath
        }).catch(error => {
          this.showVoiceError(asrErrorMessage(error))
        }).finally(() => {
          this.recognizing = false
          this.voiceSheet = false
          this.scheduleCaptureRoute()
        })
      },
      toggleAudio(item) {
        if (!item || !item.localAudio) {
          return
        }
        if (this.playingId === item.localId) {
          this.stopPlayback()
          return
        }
        this.stopPlayback()
        if (!uni.createInnerAudioContext) {
          this.$modal.msgError('当前环境不能播放录音')
          return
        }
        const player = uni.createInnerAudioContext()
        const self = this
        player.src = item.localAudio
        player.onEnded(function() {
          if (self.audioPlayer !== player) {
            return
          }
          self.audioPlayer = null
          self.playingId = ''
          if (player.destroy) {
            player.destroy()
          }
        })
        player.onError(function() {
          self.stopPlayback()
          self.$modal.msgError('无法播放这段录音')
        })
        this.audioPlayer = player
        this.playingId = item.localId
        player.play()
      },
      stopPlayback() {
        const player = this.audioPlayer
        this.audioPlayer = null
        this.playingId = ''
        if (!player) {
          return
        }
        try {
          player.stop()
        } catch (error) {}
        if (player.destroy) {
          player.destroy()
        }
      }
    }
  }
</script>

<style scoped>
  .home {
    position: relative;
    overflow: hidden;
    background: #e7edf4;
  }

  .home-fore {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    height: 100%;
    box-sizing: border-box;
    padding: 0 24rpx;
    pointer-events: none;
  }

  .home-bar,
  .swipe-stage,
  .portrait-slot,
  .chat-shell,
  .chat-reopen,
  .chat,
  .composer {
    pointer-events: auto;
  }

  .home-bar {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    min-height: 88rpx;
    margin: 0 -24rpx;
    padding-left: 24rpx;
    padding-right: 24rpx;
    background: rgba(245, 246, 247, 0.92);
  }

  .brand {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .brand-logo {
    box-sizing: border-box;
    width: 20px;
    height: 20px;
    border: 2px solid #d9d9d9;
    border-radius: 4px;
    background: #fff;
  }

  .home-title {
    height: 20px;
    margin-left: 8px;
    color: #222;
    font-size: 20px;
    font-weight: 600;
    line-height: 20px;
  }

  .home-link {
    color: #007aff;
    font-size: 26rpx;
  }

  .swipe-stage {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    margin: 0 -24rpx;
    overflow: hidden;
  }

  .swipe-track {
    position: relative;
    z-index: 1;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #e7edf4;
  }

  .swipe-track.snapping {
    transition: transform 0.2s ease;
  }

  .swipe-moon {
    position: absolute;
    z-index: 8;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    pointer-events: none;
  }

  .swipe-crescent {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    background: linear-gradient(180deg, rgba(247, 251, 255, 0.96) 0%, rgba(232, 241, 255, 0.9) 100%);
  }

  .swipe-label {
    position: absolute;
    top: 50%;
    right: 30px;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 36px;
    padding: 10px 0;
    border-radius: 16px;
    background: linear-gradient(180deg, #ffffff 0%, #e8f1ff 100%);
    box-shadow: 0 8px 20px rgba(11, 87, 208, 0.08);
    pointer-events: auto;
    transform: translateY(-50%);
  }

  .swipe-char {
    color: #0b57d0;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.35;
  }

  .swipe-hit {
    position: absolute;
    z-index: 2;
    right: 0;
    top: 0;
    bottom: 0;
  }

  .swipe-mask {
    position: absolute;
    z-index: 4;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
  }

  .portrait-gap {
    flex: none;
    height: 18px;
  }

  .portrait-slot {
    position: relative;
    flex: none;
    min-height: 0;
  }

  .stage-fill {
    width: 100%;
    height: 100%;
  }

  .avatar-dock {
    position: absolute;
    z-index: 3;
    left: 20rpx;
    top: 16rpx;
    width: 72rpx;
    height: 72rpx;
  }

  .avatar-toggle {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 96rpx;
    height: 96rpx;
    border-radius: 36rpx;
    background: rgba(20, 28, 40, 0.72);
    box-shadow: 0 8rpx 20rpx rgba(0, 0, 0, 0.16);
  }

  .avatar-panel {
    position: absolute;
    left: 84rpx;
    top: 0;
    width: 440rpx;
    max-height: 520rpx;
    overflow: hidden;
    border-radius: 24rpx;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 12rpx 32rpx rgba(0, 0, 0, 0.12);
    opacity: 0;
    transform: translateX(-12rpx) scale(0.96);
    transform-origin: left top;
    pointer-events: none;
    transition: opacity 0.28s ease, transform 0.28s ease;
  }

  .avatar-panel.open {
    opacity: 1;
    transform: none;
    pointer-events: auto;
  }

  .avatar-scroll {
    max-height: 520rpx;
    padding: 12rpx;
    box-sizing: border-box;
  }

  .avatar-empty {
    display: block;
    padding: 24rpx 12rpx;
    color: #667;
    font-size: 16px;
  }

  .avatar-item {
    display: flex;
    align-items: center;
    margin-bottom: 8rpx;
    padding: 8rpx;
    border-radius: 16rpx;
  }

  .avatar-item.current {
    background: rgba(0, 122, 255, 0.12);
  }

  .avatar-thumb {
    width: 72rpx;
    height: 72rpx;
    border-radius: 12rpx;
    background: #e7edf4;
  }

  .avatar-name {
    flex: 1;
    margin-left: 12rpx;
    color: #222;
    font-size: 16px;
  }

  .notice-bar {
    position: absolute;
    z-index: 3;
    top: 20rpx;
    right: 20rpx;
    width: 33.33%;
    height: 56px;
    overflow: hidden;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.88);
  }

  .notice-track {
    width: 100%;
  }

  .notice-text {
    display: block;
    height: 56px;
    padding: 0 12px;
    overflow: hidden;
    color: #333;
    font-size: 16px;
    line-height: 56px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .chat-shell {
    position: absolute;
    z-index: 5;
    left: 12px;
    right: 12px;
    bottom: 12px;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    padding: 8px 10px 10px;
    border-radius: 16px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(247, 251, 255, 0.94) 100%);
    box-shadow: 0 8px 24px rgba(11, 87, 208, 0.08);
    overflow: hidden;
  }

  .chat-bar {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: flex-end;
    height: 28px;
    margin-bottom: 4px;
  }

  .chat-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 14px;
    background: #e8f1ff;
  }

  .chat-reopen {
    position: absolute;
    z-index: 5;
    right: 16px;
    bottom: 16px;
    padding: 6px 14px;
    border-radius: 16px;
    background: linear-gradient(180deg, #ffffff 0%, #e8f1ff 100%);
    box-shadow: 0 8px 20px rgba(11, 87, 208, 0.08);
    color: #0b57d0;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.5;
  }

  .chat {
    flex: none;
    box-sizing: border-box;
  }

  .older {
    margin-bottom: 8px;
    color: #007aff;
    font-size: 24rpx;
    text-align: center;
  }

  .empty {
    color: #667;
    font-size: 26rpx;
    line-height: 1.6;
  }

  .turn {
    margin-bottom: 8px;
  }

  .tail {
    height: 1px;
  }

  .play {
    display: inline-block;
    margin: 4px 12px 0;
    color: #007aff;
    font-size: 24rpx;
  }

  .composer {
    position: relative;
    z-index: 6;
    flex: none;
    box-sizing: border-box;
    height: 52px;
    padding: 0 0 12px;
  }

  .composer-main {
    display: flex;
    align-items: stretch;
    height: 40px;
  }

  .editor-wrap {
    position: relative;
    flex: 1;
    height: 40px;
    min-width: 0;
  }

  .editor {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 40px;
    min-height: 40px;
    max-height: 112px;
    box-sizing: border-box;
    background: rgba(255, 255, 255, 0.96);
    border-radius: 16rpx;
    padding: 8px 88rpx 8px 16rpx;
    font-size: 18px;
    line-height: 24px;
  }

  .mic {
    position: absolute;
    right: 8rpx;
    top: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64rpx;
    height: 64rpx;
    margin-top: -32rpx;
    border-radius: 32rpx;
    background: rgba(0, 122, 255, 0.12);
    transition: background 0.2s ease, transform 0.2s ease;
  }

  .mic.holding {
    background: #007aff;
    transform: scale(1.06);
  }

  .composer-actions {
    display: flex;
    flex-shrink: 0;
    align-items: stretch;
    margin-left: 12rpx;
  }

  .action {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 72rpx;
    line-height: 1.2;
    font-size: 28rpx;
    padding: 0 28rpx;
    text-align: center;
    margin-left: 0;
  }

  button.action {
    background: #007aff;
    color: #fff;
  }

  .stop {
    background: #e64340;
  }

  .voice-mask {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    z-index: 30;
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
