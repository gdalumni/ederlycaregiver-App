// 应用全局配置
module.exports = {
  baseUrl: 'http://192.168.3.109:8080',
  // baseUrl: 'https://vue.ruoyi.vip/prod-api',
  // 应用信息
  appInfo: {
    // 应用名称
    name: "ruoyi-app",
    // 应用版本
    version: "1.2.0",
    // 应用logo
    logo: "/static/logo.png",
    // 官方网站
    site_url: "http://ruoyi.vip",
    // 政策协议
    agreements: [{
        title: "隐私协议",
        url: "/pages/common/agreement/privacy"
      },
      {
        title: "用户协议",
        url: "/pages/common/agreement/user"
      }
    ]
  }
}
