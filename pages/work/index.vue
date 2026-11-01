<template>
  <view class="work-container">
    <view class="hero">
      <image class="hero-image" src="/static/images/banner/care-ai.jpg" mode="widthFix"></image>
      <view class="hero-caption">
        <image class="hero-logo" src="/static/logo200.png" mode="aspectFit"></image>
        <view class="hero-copy">
          <text class="hero-name">华申慧养老</text>
          <text class="hero-slogan">科技让养老更便捷，AI让关爱更温暖</text>
        </view>
      </view>
    </view>
    <view class="service-grid">
      <view v-if="canOpenElderly" class="service-card" @click="openElderly">
        <view class="service-icon">
          <uni-icons type="heart-filled" size="26" color="#0b57d0"></uni-icons>
        </view>
        <view class="service-copy">
          <text class="service-name">健康管理</text>
          <text class="service-summary">查看健康趋势</text>
        </view>
      </view>
      <view v-if="canOpenAi" class="service-card" @click="openAi">
        <view class="service-icon">
          <uni-icons type="chatboxes-filled" size="26" color="#0b57d0"></uni-icons>
        </view>
        <view class="service-copy">
          <text class="service-name">慧老智问</text>
          <text class="service-summary">智能问答助手</text>
        </view>
      </view>
      <view class="service-card" @click="openNotices">
        <view class="service-icon">
          <uni-icons type="notification-filled" size="26" color="#0b57d0"></uni-icons>
        </view>
        <view class="service-copy">
          <text class="service-name">通知公告</text>
          <text class="service-summary">查看最新通知</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
  export default {
    computed: {
      canOpenAi() {
        return this.allowed('ai:session:list')
      },
      canOpenElderly() {
        return this.allowed('elderly:person:list')
          || this.allowed('elderly:bp:list')
          || this.allowed('elderly:glucose:list')
          || this.allowed('elderly:body:list')
          || this.allowed('elderly:sleep:list')
          || this.allowed('elderly:medication:list')
      }
    },
    methods: {
      openNotices() {
        this.$tab.navigateTo('/pages/system/notice/index')
      },
      openAi() {
        this.$tab.navigateTo('/pages/ai/session/index')
      },
      openElderly() {
        this.$tab.navigateTo('/pages/elderly/record/index')
      },
      allowed(code) {
        const permissions = this.$store.getters && this.$store.getters.permissions
        if (!permissions || !permissions.length) {
          return false
        }
        return this.$auth.hasPermi(code)
      }
    }
  }
</script>

<style lang="scss" scoped>
  page {
    background-color: #f4f7fb;
  }

  .work-container {
    min-height: 100%;
    box-sizing: border-box;
    padding: 16px;
    background: #f4f7fb;
  }

  .hero {
    position: relative;
    margin-bottom: 16px;
    border-radius: 16px;
    overflow: hidden;
    background: #f7fbff;
    box-shadow: 0 8px 20px rgba(11, 87, 208, 0.08);
  }

  .hero-image {
    display: block;
    width: 100%;
  }

  .hero-caption {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    align-items: center;
    padding: 28px 14px 14px;
    background: linear-gradient(180deg, rgba(247, 251, 255, 0) 0%, rgba(247, 251, 255, 0.94) 36%, #f7fbff 100%);
  }

  .hero-logo {
    width: 56px;
    height: 56px;
    flex-shrink: 0;
  }

  .hero-copy {
    min-width: 0;
    margin-left: 10px;
  }

  .hero-name,
  .hero-slogan {
    display: block;
  }

  .hero-name {
    color: #1a2b3c;
    font-size: 20px;
    font-weight: 600;
    line-height: 1.4;
  }

  .hero-slogan {
    margin-top: 2px;
    color: #3d4f63;
    font-size: 14px;
    line-height: 1.5;
  }

  .service-grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
  }

  .service-card {
    display: flex;
    align-items: center;
    width: 48%;
    box-sizing: border-box;
    margin-bottom: 12px;
    padding: 16px 12px;
    border-radius: 16px;
    background: #ffffff;
    box-shadow: 0 8px 20px rgba(11, 87, 208, 0.08);
  }

  .service-icon {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: linear-gradient(180deg, #e8f1ff 0%, #f7fbff 100%);
  }

  .service-copy {
    min-width: 0;
    margin-left: 10px;
  }

  .service-name,
  .service-summary {
    display: block;
    line-height: 1.5;
  }

  .service-name {
    color: #1a2b3c;
    font-size: 17px;
    font-weight: 600;
  }

  .service-summary {
    color: #3d4f63;
    font-size: 15px;
  }
</style>
