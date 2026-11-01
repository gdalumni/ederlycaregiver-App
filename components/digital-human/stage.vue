<template>
  <view class="stage">
    <view class="frame">
      <image
        v-if="!portraitMissing"
        class="layer"
        :style="portraitStyle"
        :src="portrait"
        mode="scaleToFill"
        @load="onPortraitLoad"
        @error="onPortraitError"
      ></image>
      <view v-else class="portrait-missing">
        <text class="missing-title">等待人物照片</text>
        <text class="missing-desc">人物图应为 static/digital-human/avatar-base.png。</text>
      </view>
      <view v-if="calibration && fit.scale" class="guide-x" :style="guideStyle"></view>
      <image
        v-if="!useShape"
        class="layer mouth"
        :style="mouthStyle"
        :src="currentSrc"
        mode="scaleToFill"
        @error="onMouthError"
        @touchstart.stop="onDragStart"
        @touchmove.stop.prevent="onDragMove"
        @touchend.stop="onDragEnd"
      ></image>
      <view
        v-else
        class="layer mouth shape"
        :style="mouthStyle"
        @touchstart.stop="onDragStart"
        @touchmove.stop.prevent="onDragMove"
        @touchend.stop="onDragEnd"
      ></view>
      <view
        v-if="calibration && fit.scale"
        class="resize"
        :style="resizeStyle"
        @touchstart.stop="onResizeStart"
        @touchmove.stop.prevent="onResizeMove"
      ></view>
    </view>
    <view v-if="calibration" class="panel" :style="{ top: insetTop + 'px' }">
      <text class="panel-title">校准（原图像素，仅开发环境）</text>
      <text class="panel-line">垂直线是嘴型中心 x={{ formatNum(live.mouth.centerX) }}，不是画面对称轴。</text>
      <text class="panel-line">中心 {{ formatNum(live.mouth.centerX) }}，{{ formatNum(live.mouth.centerY) }}　宽 {{ formatNum(live.mouth.width) }}　高 {{ formatNum(live.mouth.height) }}　缩放 {{ formatNum(live.mouth.scale) }}</text>
      <text class="panel-line">当前 {{ activeKey }} 偏移 {{ formatNum(activeViseme.offsetX) }}，{{ formatNum(activeViseme.offsetY) }}　图内锚点 {{ activeViseme.contentX }}，{{ activeViseme.contentY }}</text>
      <view class="row">
        <text
          v-for="item in mouthStates"
          :key="item.key"
          class="chip"
          :class="{ on: item.key === activeKey }"
          @click="selectViseme(item.key)"
        >{{ item.label }}</text>
      </view>
      <view class="row">
        <text class="chip" :class="{ on: nudgeViseme }" @click="nudgeViseme = !nudgeViseme">{{ nudgeViseme ? '拖动：微调当前嘴型' : '拖动：移动共用中心' }}</text>
        <text class="chip" @click="changeScale(0.05)">放大</text>
        <text class="chip" @click="changeScale(-0.05)">缩小</text>
        <text class="chip" @click="exportConfig">导出 JSON</text>
      </view>
      <text v-if="exported" class="export">{{ exported }}</text>
    </view>
  </view>
</template>

<script>
  import {
    MOUTH_STATES,
    assetSrc,
    cloneMouthConfig,
    isMouthCalibrationBuild,
    mouthSrc
  } from '@/components/digital-human/assets'
  import { fitContain, imageRectToView, mouthRectInImage, portraitRect } from '@/components/digital-human/layout'

  function touchPoint(event) {
    const touch = event.touches && event.touches[0]
    if (!touch) {
      return null
    }
    return {
      x: touch.clientX != null ? touch.clientX : touch.pageX,
      y: touch.clientY != null ? touch.clientY : touch.pageY
    }
  }

  function roundPx(value) {
    return Math.round(value * 10) / 10
  }

  export default {
    props: {
      mouth: {
        type: String,
        default: 'rest'
      },
      viewWidth: {
        type: Number,
        default: 0
      },
      viewHeight: {
        type: Number,
        default: 0
      },
      insetTop: {
        type: Number,
        default: 0
      },
      pinTop: {
        type: Boolean,
        default: false
      },
      showCalibration: {
        type: Boolean,
        default: false
      }
    },
    data() {
      return {
        portraitMissing: false,
        useShape: false,
        containerWidth: 0,
        containerHeight: 0,
        measured: false,
        measureToken: 0,
        live: cloneMouthConfig(),
        previousLive: null,
        portraitReady: false,
        previewKey: '',
        nudgeViseme: false,
        drag: null,
        exported: ''
      }
    },
    computed: {
      calibration() {
        return this.showCalibration && isMouthCalibrationBuild()
      },
      portrait() {
        return assetSrc(this.live && this.live.sourceImage)
      },
      mouthStates() {
        return MOUTH_STATES
      },
      activeKey() {
        return this.previewKey || this.mouth || 'rest'
      },
      activeViseme() {
        return this.live.visemes[this.activeKey] || this.live.visemes.rest
      },
      currentSrc() {
        return mouthSrc(this.live, this.activeKey)
      },
      fit() {
        const system = (this.live && this.live.coordinateSystem) || {}
        const fitted = fitContain(this.containerWidth, this.containerHeight, system.referenceWidth, system.referenceHeight)
        if (!this.pinTop || !fitted.scale) {
          return fitted
        }
        return {
          x: fitted.x,
          y: 0,
          width: fitted.width,
          height: fitted.height,
          scale: fitted.scale
        }
      },
      portraitStyle() {
        return this.boxStyle(imageRectToView(portraitRect(this.live), this.fit))
      },
      mouthStyle() {
        return this.boxStyle(imageRectToView(mouthRectInImage(this.live, this.activeKey), this.fit))
      },
      guideStyle() {
        const x = this.fit.x + this.live.mouth.centerX * this.fit.scale
        return {
          left: x + 'px',
          top: this.fit.y + 'px',
          height: this.fit.height + 'px'
        }
      },
      resizeStyle() {
        const box = imageRectToView(mouthRectInImage(this.live, this.activeKey), this.fit)
        return {
          left: box.left + box.width - 8 + 'px',
          top: box.top + box.height - 8 + 'px'
        }
      }
    },
    watch: {
      mouth() {
        this.useShape = false
      },
      viewWidth() {
        this.measured = false
        this.syncView()
        if (this._isMounted) {
          this.measureFrame()
        }
      },
      viewHeight() {
        this.measured = false
        this.syncView()
        if (this._isMounted) {
          this.measureFrame()
        }
      }
    },
    mounted() {
      const self = this
      this.syncView()
      this.handleWindowResize = function() {
        self.measureFrame()
      }
      this.$nextTick(() => {
        this.measureFrame()
      })
      if (typeof uni !== 'undefined' && uni.onWindowResize) {
        uni.onWindowResize(this.handleWindowResize)
      }
    },
    beforeDestroy() {
      if (typeof uni !== 'undefined' && uni.offWindowResize && this.handleWindowResize) {
        uni.offWindowResize(this.handleWindowResize)
      }
    },
    methods: {
      releaseVersion() {
        const value = this.live && this.live.releaseVersion
        if (value === undefined || value === null || value === '') {
          return null
        }
        return value
      },
      avatarCode() {
        const value = this.live && this.live.avatarCode
        return value ? String(value) : ''
      },
      replaceConfig(config) {
        this.previousLive = JSON.parse(JSON.stringify(this.live))
        this.live = JSON.parse(JSON.stringify(config))
        this.portraitReady = false
        this.portraitMissing = false
        this.useShape = false
        this.$nextTick(() => {
          this.emitFrame()
        })
      },
      onPortraitLoad() {
        this.portraitReady = true
        this.previousLive = null
        this.portraitMissing = false
      },
      restorePrevious() {
        if (!this.previousLive) {
          return false
        }
        this.live = this.previousLive
        this.previousLive = null
        this.portraitReady = true
        this.portraitMissing = false
        this.useShape = false
        return true
      },
      onPortraitError() {
        if (!this.portraitReady && this.restorePrevious()) {
          return
        }
        if (!this.portraitReady) {
          this.portraitMissing = true
        }
      },
      onMouthError() {
        if (!this.portraitReady && this.restorePrevious()) {
          return
        }
        if (this.releaseVersion() != null) {
          return
        }
        this.useShape = true
      },
      boxStyle(box) {
        return {
          left: box.left + 'px',
          top: box.top + 'px',
          width: box.width + 'px',
          height: box.height + 'px'
        }
      },
      formatNum(value) {
        const number = Number(value)
        if (number === Math.round(number)) {
          return String(number)
        }
        return number.toFixed(1)
      },
      syncView() {
        if (this.measured) {
          return
        }
        if (this.viewWidth > 0 && this.viewHeight > 0) {
          this.containerWidth = this.viewWidth
          this.containerHeight = this.viewHeight
        }
      },
      portraitFrame() {
        const fit = this.fit || {}
        return {
          x: fit.x || 0,
          y: fit.y || 0,
          width: fit.width || 0,
          height: fit.height || 0
        }
      },
      emitFrame() {
        const frame = this.portraitFrame()
        if (frame.height > 0) {
          this.$emit('frame', frame)
        }
      },
      measureFrame() {
        const token = this.measureToken + 1
        this.measureToken = token
        const query = uni.createSelectorQuery().in(this)
        query.select('.frame').boundingClientRect(rect => {
          if (token !== this.measureToken) {
            return
          }
          if (!rect || !(rect.width > 0) || !(rect.height > 0)) {
            this.syncView()
            this.emitFrame()
            return
          }
          this.measured = true
          this.containerWidth = rect.width
          this.containerHeight = rect.height
          this.emitFrame()
        }).exec()
      },
      selectViseme(key) {
        this.previewKey = key
        this.useShape = false
        this.$emit('preview', key)
      },
      imageDelta(event) {
        const point = touchPoint(event)
        if (!point || !this.drag || !this.fit.scale) {
          return null
        }
        return {
          x: (point.x - this.drag.x) / this.fit.scale,
          y: (point.y - this.drag.y) / this.fit.scale
        }
      },
      onDragStart(event) {
        if (!this.calibration) {
          return
        }
        const point = touchPoint(event)
        if (!point) {
          return
        }
        this.drag = {
          mode: 'move',
          x: point.x,
          y: point.y,
          centerX: this.live.mouth.centerX,
          centerY: this.live.mouth.centerY,
          offsetX: this.activeViseme.offsetX,
          offsetY: this.activeViseme.offsetY
        }
      },
      onDragMove(event) {
        const delta = this.imageDelta(event)
        if (!delta || this.drag.mode !== 'move') {
          return
        }
        if (this.nudgeViseme) {
          this.activeViseme.offsetX = roundPx(this.drag.offsetX + delta.x)
          this.activeViseme.offsetY = roundPx(this.drag.offsetY + delta.y)
          return
        }
        this.live.mouth.centerX = roundPx(this.drag.centerX + delta.x)
        this.live.mouth.centerY = roundPx(this.drag.centerY + delta.y)
      },
      onDragEnd() {
        this.drag = null
      },
      onResizeStart(event) {
        const point = touchPoint(event)
        if (!point) {
          return
        }
        this.drag = {
          mode: 'resize',
          x: point.x,
          y: point.y,
          scale: this.live.mouth.scale
        }
      },
      onResizeMove(event) {
        const delta = this.imageDelta(event)
        if (!delta || this.drag.mode !== 'resize') {
          return
        }
        const next = this.drag.scale + delta.x / this.live.mouth.width
        this.live.mouth.scale = roundPx(Math.max(0.4, Math.min(2.5, next)))
      },
      changeScale(step) {
        const next = this.live.mouth.scale + step
        this.live.mouth.scale = roundPx(Math.max(0.4, Math.min(2.5, next)))
      },
      exportConfig() {
        const text = JSON.stringify(this.live, null, 2)
        this.exported = text
        uni.setClipboardData({
          data: text,
          showToast: false
        })
        uni.showToast({
          title: '配置已复制',
          icon: 'none'
        })
      }
    }
  }
</script>

<style scoped>
  .stage {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .frame {
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    overflow: hidden;
  }

  .layer {
    position: absolute;
  }

  .mouth {
    z-index: 2;
  }

  .shape {
    background: rgba(201, 139, 139, 0.45);
  }

  .guide-x {
    position: absolute;
    z-index: 3;
    width: 1px;
    background: rgba(255, 59, 48, 0.9);
    pointer-events: none;
  }

  .resize {
    position: absolute;
    z-index: 4;
    width: 16px;
    height: 16px;
    background: #007aff;
    border-radius: 8px;
  }

  .portrait-missing {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40rpx;
    box-sizing: border-box;
  }

  .missing-title {
    color: #333;
    font-size: 32rpx;
  }

  .missing-desc {
    margin-top: 16rpx;
    color: #667;
    font-size: 24rpx;
    line-height: 1.6;
    text-align: center;
  }

  .panel {
    position: absolute;
    left: 16rpx;
    right: 16rpx;
    z-index: 6;
    max-height: 42%;
    overflow: auto;
    box-sizing: border-box;
    padding: 12rpx;
    border-radius: 16rpx;
    background: rgba(255, 255, 255, 0.92);
  }

  .panel-title,
  .panel-line,
  .export {
    display: block;
    color: #667;
    font-size: 22rpx;
    line-height: 1.5;
  }

  .panel-title {
    color: #333;
    font-size: 24rpx;
  }

  .export {
    margin-top: 8rpx;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 180rpx;
    overflow: hidden;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    margin-top: 8rpx;
  }

  .chip {
    margin: 0 8rpx 8rpx 0;
    padding: 4rpx 12rpx;
    border-radius: 20rpx;
    background: #fff;
    color: #333;
    font-size: 22rpx;
  }

  .on {
    background: #007aff;
    color: #fff;
  }
</style>
