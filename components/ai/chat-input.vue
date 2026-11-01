<template>
  <view class="chat-input">
    <view v-if="notice" class="notice">
      <text>{{ notice }}</text>
      <text v-if="canResend" class="resend" @click="$emit('resend')">重试</text>
    </view>
    <view class="input-row">
      <textarea
        class="editor"
        :style="editorStyle"
        :value="value"
        :disabled="disabled || sending || running || recording || recognizing"
        :maxlength="8000"
        placeholder="输入消息"
        @input="onInput"
        @linechange="onLine"
      />
      <view
        v-if="showVoice"
        class="icon-btn"
        @touchstart.stop.prevent="onHoldStart"
        @mousedown.stop.prevent="onHoldStart"
      >
        <uni-icons type="mic-filled" size="22" color="#3c96f3"></uni-icons>
      </view>
      <view v-if="running" class="send-btn stop" @click="$emit('stop')">
        <uni-icons type="smallcircle-filled" size="18" color="#ffffff"></uni-icons>
      </view>
      <view v-else class="send-btn" :class="{ off: !canSend }" @click="emitSend">
        <uni-icons type="paperplane-filled" size="20" color="#ffffff"></uni-icons>
      </view>
    </view>
  </view>
</template>

<script>
  export default {
    props: {
      value: {
        type: String,
        default: ''
      },
      disabled: {
        type: Boolean,
        default: false
      },
      sending: {
        type: Boolean,
        default: false
      },
      running: {
        type: Boolean,
        default: false
      },
      stopping: {
        type: Boolean,
        default: false
      },
      notice: {
        type: String,
        default: ''
      },
      canResend: {
        type: Boolean,
        default: false
      },
      recording: {
        type: Boolean,
        default: false
      },
      recognizing: {
        type: Boolean,
        default: false
      }
    },
    data() {
      return {
        lines: 1
      }
    },
    computed: {
      showVoice() {
        return !this.disabled && !this.sending && !this.running && !this.recognizing
      },
      canSend() {
        return !this.disabled && !this.sending && !this.recording && !this.recognizing
      },
      editorStyle() {
        const lines = Math.max(1, Math.min(6, this.lines || 1))
        return { height: (16 + lines * 24) + 'px' }
      }
    },
    watch: {
      value(text) {
        if (!text && this.lines !== 1) {
          this.lines = 1
          this.$emit('lines', 1)
        }
      }
    },
    methods: {
      onInput(event) {
        const text = event.detail ? event.detail.value : ''
        this.$emit('input', text == null ? '' : String(text))
      },
      onLine(event) {
        const count = event && event.detail ? Number(event.detail.lineCount) : 1
        const lines = Math.max(1, Math.min(6, count || 1))
        this.lines = lines
        this.$emit('lines', lines)
      },
      onHoldStart() {
        if (!this.showVoice) {
          return
        }
        this.$emit('voice-hold')
      },
      emitSend() {
        if (!this.canSend) {
          return
        }
        this.$emit('send')
      }
    }
  }
</script>

<style lang="scss" scoped>
  .chat-input {
    background: #ffffff;
    border-top: 1px solid #e6eef8;
    padding: 10px 12px 12px;
    box-sizing: border-box;
  }

  .notice {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #c4564a;
    font-size: 16px;
    line-height: 1.5;
    margin-bottom: 8px;
  }

  .resend {
    color: #3c96f3;
    font-size: 16px;
  }

  .input-row {
    display: flex;
    align-items: flex-end;
    min-width: 0;
  }

  .editor {
    flex: 1;
    width: auto;
    min-width: 0;
    box-sizing: border-box;
    background: #f5f8fc;
    border-radius: 16px;
    padding: 8px 12px;
    font-size: 18px;
    line-height: 24px;
  }

  .icon-btn,
  .send-btn {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    margin-left: 8px;
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon-btn {
    background: #e8f3ff;
  }

  .send-btn {
    background: #3c96f3;
  }

  .send-btn.off {
    opacity: 0.45;
  }

  .stop {
    background: #d9655b;
  }
</style>
