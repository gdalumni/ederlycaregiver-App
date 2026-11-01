<template>
  <view class="normal-login-container">
    <view class="logo-content">
      <view class="brand">
        <image class="logo" src="/static/logo200.png" mode="aspectFit"></image>
        <text class="title">华申慧养老</text>
      </view>
      <text class="slogan">科技让养老更便捷 AI让关爱更温暖</text>
    </view>
    <view class="login-form-content">
      <view class="input-item flex align-center">
        <view class="iconfont icon-user icon"></view>
        <input v-model="loginForm.username" class="input" type="text" placeholder="请输入账号" maxlength="30" />
      </view>
      <view class="input-item flex align-center">
        <view class="iconfont icon-password icon"></view>
        <input v-model="loginForm.password" type="password" class="input" placeholder="请输入密码" maxlength="20" />
      </view>
      <view class="action-btn">
        <button @click="handleLogin" class="login-btn cu-btn block bg-blue lg round">登录</button>
      </view>
      <view class="reg text-center" v-if="register">
        <text class="text-grey1">没有账号？</text>
        <text @click="handleUserRegister" class="text-blue">立即注册</text>
      </view>
      <view class="permit">
        <text class="permit-title">登录后将使用的权限</text>
        <text class="permit-line">麦克风：仅在首页按住话筒说话时录音，用来转成文字。不用于声纹识别。拒绝后仍可以打字。</text>
      </view>
      <view class="xieyi text-center">
        <text class="text-grey1">登录即代表同意</text>
        <text @click="handleUserAgrement" class="text-blue">《用户协议》</text>
        <text @click="handlePrivacy" class="text-blue">《隐私协议》</text>
      </view>
    </view>
    <view class="footer">-- 关爱老人 智慧养老 --</view>
  </view>
</template>

<script>
  import { ensureLoginWindow, getRememberedUsername, markLoginWindow, setRememberedUsername } from '@/utils/auth'

  export default {
    data() {
      return {
        // 用户注册开关
        register: false,
        loginForm: {
          username: "",
          password: "",
          code: "",
          uuid: ""
        }
      }
    },
    onLoad() {
      const remembered = getRememberedUsername()
      if (remembered) {
        this.loginForm.username = remembered
      }
      if (ensureLoginWindow()) {
        this.$tab.reLaunch('/pages/index')
      }
    },
    methods: {
      // 用户注册
      handleUserRegister() {
        this.$tab.redirectTo(`/pages/register`)
      },
      // 隐私协议
      handlePrivacy() {
        this.$tab.navigateTo('/pages/common/agreement/privacy')
      },
      // 用户协议
      handleUserAgrement() {
        this.$tab.navigateTo('/pages/common/agreement/user')
      },
      // 登录方法
      async handleLogin() {
        if (this.loginForm.username === "") {
          this.$modal.msgError("请输入账号")
        } else if (this.loginForm.password === "") {
          this.$modal.msgError("请输入密码")
        } else {
          this.$modal.loading("登录中，请耐心等待...")
          this.pwdLogin()
        }
      },
      // 密码登录
      async pwdLogin() {
        this.$store.dispatch('Login', this.loginForm).then(() => {
          this.$modal.closeLoading()
          setRememberedUsername(this.loginForm.username)
          markLoginWindow()
          this.loginSuccess()
        }).catch(() => {})
      },
      // 登录成功后，处理函数
      loginSuccess(result) {
        // 设置用户信息
        this.$store.dispatch('GetInfo').then(res => {
          this.$tab.reLaunch('/pages/index')
        })
      }
    }
  }
</script>

<style lang="scss" scoped>
  page {
    background-color: #f4f7fb;
    height: 100%;
  }

  .normal-login-container {
    width: 100%;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    background: #f4f7fb;

    .logo-content {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding-top: 12%;

      .brand {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
      }

      .logo {
        width: 22px;
        height: 22px;
        border-radius: 4px;
      }

      .title {
        height: 22px;
        margin-left: 8px;
        color: #1a2b3c;
        font-size: 22px;
        font-weight: 600;
        line-height: 22px;
      }

      .slogan {
        margin-top: 8px;
        padding: 0 24px;
        color: #3d4f63;
        font-size: 16px;
        line-height: 1.5;
        text-align: center;
      }
    }

    .footer {
      margin-top: auto;
      padding: 16px 16px 28px;
      color: #5b6b7c;
      font-size: 15px;
      line-height: 1.5;
      text-align: center;
    }

    .login-form-content {
      text-align: center;
      margin: 20px auto;
      margin-top: 8%;
      width: 80%;

      .permit {
        margin: 8px auto 0;
        padding: 12px 14px;
        text-align: left;
        background: #f5f8fc;
        border-radius: 12px;
      }

      .permit-title,
      .permit-line {
        display: block;
      }

      .permit-title {
        color: #1a2b3c;
        font-size: 16px;
        font-weight: 600;
      }

      .permit-line {
        margin-top: 6px;
        color: #3d4f63;
        font-size: 14px;
        line-height: 1.6;
      }

      .input-item {
        margin: 20px auto;
        background-color: #f3f6fb;
        height: 45px;
        border-radius: 20px;

        .icon {
          font-size: 38rpx;
          margin-left: 10px;
          color: #999;
        }

        .input {
          width: 100%;
          font-size: 14px;
          line-height: 20px;
          text-align: left;
          padding-left: 15px;
        }

      }

      .login-btn {
        margin-top: 40px;
        height: 45px;
        background-color: #0b57d0;
        font-size: 16px;
      }
      
      .reg {
        margin-top: 15px;
      }
      
      .xieyi {
        color: #333;
        margin-top: 20px;
      }
    }
  }

</style>
