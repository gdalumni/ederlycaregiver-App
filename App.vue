<script>
  import config from './config'
  import { ensureLoginWindow } from '@/utils/auth'

  export default {
    onLaunch: function() {
      this.initApp()
    },
    methods: {
      initApp() {
        this.initConfig()
        ensureLoginWindow()
      },
      initConfig() {
        this.globalData.config = config
      }
    }
  }
</script>

<style lang="scss">
  @import '@/static/scss/index.scss';

  page {
    font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
    font-size: 16px;
    line-height: 1.5;
    letter-spacing: 0.5px;
    color: #222222;
    background-color: #f5f6f7;
  }

  .uni-icons,
  .iconfont,
  [class*="cuIcon-"] {
    letter-spacing: 0;
  }
</style>
