<template>
  <view class="mine-container" :style="{height: `${windowHeight}px`}">
    <!--顶部个人信息栏-->
    <view class="header-section">
      <view class="flex padding justify-between">
        <view class="flex align-center">
          <view v-if="!avatar" class="cu-avatar xl round bg-white">
            <view class="iconfont icon-people text-gray icon"></view>
          </view>
          <image v-if="avatar" @click="handleToAvatar" :src="avatar" class="cu-avatar xl round" mode="widthFix">
          </image>
          <view v-if="!name" @click="handleToLogin" class="login-tip">
            点击登录
          </view>
          <view v-if="name" @click="handleToInfo" class="user-info">
            <view class="u_title">
              用户名：{{ name }}
            </view>
          </view>
        </view>
        <view @click="handleToInfo" class="flex align-center">
          <text>个人信息</text>
          <view class="iconfont icon-right"></view>
        </view>
      </view>
    </view>

    <view class="content-section">
      <view class="mine-actions grid col-4 text-center">
        <view class="action-item" @click="handleJiaoLiuQun">
          <view class="iconfont icon-friendfill text-pink icon"></view>
          <text class="text">交流群</text>
        </view>
        <view class="action-item" @click="handleBuilding">
          <view class="iconfont icon-service text-blue icon"></view>
          <text class="text">在线客服</text>
        </view>
        <view class="action-item" @click="handleBuilding">
          <view class="iconfont icon-community text-mauve icon"></view>
          <text class="text">反馈社区</text>
        </view>
        <view class="action-item" @click="handleBuilding">
          <view class="iconfont icon-dianzan text-green icon"></view>
          <text class="text">点赞我们</text>
        </view>
      </view>

      <view class="menu-list">
        <view class="list-cell list-cell-arrow" @click="handleToEditInfo">
          <view class="menu-item-box">
            <view class="iconfont icon-user menu-icon"></view>
            <view>编辑资料</view>
          </view>
        </view>
        <view class="list-cell list-cell-arrow" @click="handleHelp">
          <view class="menu-item-box">
            <view class="iconfont icon-help menu-icon"></view>
            <view>常见问题</view>
          </view>
        </view>
        <view class="list-cell list-cell-arrow" @click="handleAbout">
          <view class="menu-item-box">
            <view class="iconfont icon-aixin menu-icon"></view>
            <view>关于我们</view>
          </view>
        </view>
        <view class="list-cell list-cell-arrow" @click="handleToSetting">
          <view class="menu-item-box">
            <view class="iconfont icon-setting menu-icon"></view>
            <view>应用设置</view>
          </view>
        </view>
        <view class="list-cell list-cell-arrow" @click="runRecordProbe">
          <view class="menu-item-box">
            <view class="iconfont icon-service menu-icon"></view>
            <view>{{ probing ? '正在测试本机录音' : '测试本机录音' }}</view>
          </view>
        </view>
      </view>
      <view v-if="probeLines.length" class="probe">
        <scroll-view scroll-y class="probe-log">
          <text class="probe-text" selectable>{{ probeText }}</text>
        </scroll-view>
        <button class="probe-copy" size="mini" type="primary" @click="copyProbe">复制日志</button>
      </view>

    </view>
  </view>
</template>

<script>
  import { describeAndroidRecordProbe, describeDecodedPeak, ensureMicPermission, readLocalBytes } from '@/utils/speech-recorder'

  const FORMATS = ['aac', 'wav', 'pcm', 'mp3']

  function errorText(error) {
    if (!error) {
      return ''
    }
    const code = error.errCode != null ? error.errCode : error.code
    const message = error.errMsg || error.message || error.stack || String(error)
    return (code != null && code !== '' ? 'code=' + code + ' ' : '') + message
  }

  function wait(ms) {
    return new Promise(function(resolve) {
      setTimeout(resolve, ms)
    })
  }

  function hexBytes(bytes) {
    const parts = []
    const total = Math.min(bytes.length, 16)
    for (let index = 0; index < total; index += 1) {
      const value = bytes[index].toString(16)
      parts.push(value.length === 1 ? '0' + value : value)
    }
    return parts.join(' ')
  }

  function audioKind(bytes) {
    if (bytes.length >= 12
      && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) {
      return 'wav'
    }
    if (bytes.length >= 5
      && bytes[0] === 0x23 && bytes[1] === 0x21 && bytes[2] === 0x41 && bytes[3] === 0x4d && bytes[4] === 0x52) {
      return 'AMR'
    }
    if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      return 'mp3'
    }
    if (bytes.length >= 8
      && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
      return 'm4a'
    }
    if (bytes.length >= 4
      && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
      return 'ogg'
    }
    if (bytes.length >= 4
      && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
      return 'webm'
    }
    return '认不出'
  }

  export default {
    data() {
      return {
        name: this.$store.state.user.name,
        probing: false,
        probeLines: []
      }
    },
    computed: {
      avatar() {
        return this.$store.state.user.avatar
      },
      windowHeight() {
        return uni.getSystemInfoSync().windowHeight - 50
      },
      probeText() {
        return this.probeLines.join('\n')
      }
    },
    methods: {
      handleToInfo() {
        this.$tab.navigateTo('/pages/mine/info/index')
      },
      handleToEditInfo() {
        this.$tab.navigateTo('/pages/mine/info/edit')
      },
      handleToSetting() {
        this.$tab.navigateTo('/pages/mine/setting/index')
      },
      handleToLogin() {
        this.$tab.reLaunch('/pages/login')
      },
      handleToAvatar() {
        this.$tab.navigateTo('/pages/mine/avatar/index')
      },
      handleHelp() {
        this.$tab.navigateTo('/pages/mine/help/index')
      },
      handleAbout() {
        this.$tab.navigateTo('/pages/mine/about/index')
      },
      handleJiaoLiuQun() {
        this.$modal.showToast('QQ群：①133713780(满)、②146013835(满)、③189091635')
      },
      handleBuilding() {
        this.$modal.showToast('模块建设中~')
      },
      copyProbe() {
        uni.setClipboardData({
          data: this.probeText
        })
      },
      pushProbe(line) {
        this.probeLines.push(line)
      },
      runRecordProbe() {
        if (this.probing) {
          return
        }
        this.probing = true
        this.probeLines = []
        this.collectDevice().then(() => {
          return ensureMicPermission()
        }).then((permission) => {
          this.pushProbe('麦克风权限: ' + permission)
          if (permission === 'denied') {
            return
          }
          return this.probeUniFormats().then(() => {
            return this.probeAudioRecord()
          })
        }).catch((error) => {
          this.pushProbe('测试中断: ' + errorText(error))
        }).finally(() => {
          this.probing = false
          this.pushProbe('测试结束')
        })
      },
      collectDevice() {
        const info = uni.getSystemInfoSync()
        const os = typeof plus !== 'undefined' && plus.os ? plus.os : {}
        this.pushProbe('品牌: ' + (info.brand || os.vendor || ''))
        this.pushProbe('型号: ' + (info.model || ''))
        this.pushProbe('系统: ' + (info.system || '') + ' / ' + (info.osName || info.platform || '') + ' / ' + (os.name || ''))
        this.pushProbe('uni.getRecorderManager: ' + (typeof uni.getRecorderManager))
        return Promise.resolve()
      },
      probeUniFormats() {
        let chain = Promise.resolve()
        const self = this
        FORMATS.forEach(function(format) {
          chain = chain.then(function() {
            return self.probeOneFormat(format)
          })
        })
        return chain
      },
      probeOneFormat(format) {
        const self = this
        if (!uni.getRecorderManager) {
          this.pushProbe(format + ': 没有 uni.getRecorderManager')
          return Promise.resolve()
        }
        return new Promise(function(resolve) {
          const recorder = uni.getRecorderManager()
          let started = false
          let settled = false
          const finish = function(line) {
            if (settled) {
              return
            }
            settled = true
            self.pushProbe(line)
            resolve()
          }
          recorder.onStart(function() {
            started = true
          })
          recorder.onError(function(error) {
            finish(format + ' 失败: ' + errorText(error) + (started ? ' 已开始' : ' 未开始'))
          })
          recorder.onStop(function(res) {
            const head = format + (started ? ' 成功: 已开始并停止' : ' 失败: 未开始就停止')
            const path = res && res.tempFilePath ? res.tempFilePath : ''
            if (!path) {
              finish(head + ' 无文件')
              return
            }
            self.describeFile(path).then(function(line) {
              finish(head + ' ' + line)
            }).catch(function(error) {
              finish(head + ' 文件读取失败: ' + errorText(error))
            })
          })
          try {
            recorder.start({
              duration: 1500,
              sampleRate: 16000,
              numberOfChannels: 1,
              encodeBitRate: 96000,
              format: format
            })
          } catch (error) {
            finish(format + ' 启动异常: ' + errorText(error))
            return
          }
          setTimeout(function() {
            try {
              recorder.stop()
            } catch (error) {
              finish(format + ' 停止异常: ' + errorText(error))
            }
          }, 800)
          setTimeout(function() {
            finish(format + ' 超时: ' + (started ? '已开始但没有停止回调' : '没有开始回调'))
          }, 2500)
        }).then(function() {
          return wait(300)
        })
      },
      describeFile(filePath) {
        return readLocalBytes(filePath).then(function(bytes) {
          const head = bytes.subarray(0, 16)
          const kind = audioKind(head)
          let line = '大小=' + bytes.length + ' 头=' + (hexBytes(head) || '空') + ' ' + kind
          if (kind === 'AMR') {
            line += ' ' + describeDecodedPeak(filePath, bytes)
          }
          return line
        })
      },
      probeAudioRecord() {
        if (typeof plus === 'undefined' || !plus.android) {
          this.pushProbe('AudioRecord: 当前环境没有安卓接口')
          return Promise.resolve()
        }
        const self = this
        try {
          describeAndroidRecordProbe().forEach(function(line) {
            self.pushProbe(line)
          })
        } catch (error) {
          this.pushProbe('AudioRecord 异常: ' + errorText(error))
        }
        return Promise.resolve()
      }
    }
  }
</script>

<style lang="scss" scoped>
  page {
    background-color: #f5f6f7;
  }

  .mine-container {
    width: 100%;
    height: 100%;


    .header-section {
      padding: 15px 15px 45px 15px;
      background-color: #3c96f3;
      color: white;

      .login-tip {
        font-size: 18px;
        margin-left: 10px;
      }

      .cu-avatar {
        border: 2px solid #eaeaea;

        .icon {
          font-size: 40px;
        }
      }

      .user-info {
        margin-left: 15px;

        .u_title {
          font-size: 18px;
          line-height: 30px;
        }
      }
    }

    .content-section {
      position: relative;
      top: -50px;

      .mine-actions {
        margin: 15px 15px;
        padding: 20px 0px;
        border-radius: 8px;
        background-color: white;

        .action-item {
          .icon {
            font-size: 28px;
          }

          .text {
            display: block;
            font-size: 13px;
            margin: 8px 0px;
          }
        }
      }
    }

    .probe {
      margin: 0 15px 24px;
      padding: 12px;
      border-radius: 8px;
      background: #ffffff;
    }

    .probe-log {
      height: 280px;
    }

    .probe-text {
      color: #222222;
      font-size: 14px;
      line-height: 1.6;
      word-break: break-all;
    }

    .probe-copy {
      margin-top: 12px;
      background-color: #0b57d0;
    }
  }
</style>
