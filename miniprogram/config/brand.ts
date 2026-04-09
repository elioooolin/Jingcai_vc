export const brandConfig = {
  shortNameCn: '晶采',
  englishName: 'Yummy Jingcai',
  displayName: '舌尖上的晶采',
  slogan: '用晶采美味，宠爱生命初见',
  adminTitle: '晶采 · 管理后台',
  adminSubtitle: '专业月子服务管理系统',
  customerManageSubtitle: '晶采 · 用心服务每一位客户',
  menuManageSubtitle: '统一维护轮换起始日期与餐单轮换区间',
  herbalCultureTitle: '晶采药食文化',
  healthHeaderTitle: '健康档案',
  healthHeaderSubtitle: '专属中医调理方案',
  consultationArchiveTitle: '中医问诊档案',
  tcmRxAddTitle: '添加处方',
  visitorWelcomeTitle: '欢迎来到舌尖上的晶采',
  visitorUnregisteredTitle: '当前账号尚未登记为客户',
  visitorOrderBlockedText: '当前账号尚未登记为客户，暂不可进入点餐系统',
  visitorBrowseOnlyText: '当前账号尚未登记为客户，可浏览基础界面，暂不可进入点餐系统',
  customerStayGreeting: '欢迎入住',
  customerCompanionText: '舌尖上的晶采陪伴您',
  profileWelcomeText: '欢迎入住·舌尖上的晶采',
  loginNoticeText: '未登记用户可访客浏览，已登记客户可使用完整服务',
  loginFooterText: '未登录用户可先浏览基础界面，需要完整会员功能时再登录',
  appNavigationTitle: '服务平台',
  loginNavigationTitle: '登录',
  visitorNavigationTitle: '访客浏览',
  customerDashboardNavigationTitle: '首页',
  adminDashboardNavigationTitle: '管理后台',
  phoneBindingNavigationTitle: '手机号绑定',
  customerProfileNavigationTitle: '个人中心',
  healthNavigationTitle: '健康档案',
  legalEntityName: '晶采月子中心',
  contactPhone: '187 7111 6893',
  logoPath: '/assets/icons/logo_jingcai_transparent.png'
} as const

export function getShareTitle(prefix?: string) {
  return prefix ? `${prefix} - ${brandConfig.displayName}` : brandConfig.displayName
}

export function buildUserAgreementContent() {
  return `欢迎使用${brandConfig.legalEntityName}小程序（以下简称"本小程序"）。使用本小程序前，请您仔细阅读本用户协议（以下简称"本协议"）。一旦您使用本小程序，即表示您已同意本协议的所有条款。

1. 服务内容
本小程序提供${brandConfig.legalEntityName}在住客户的月子餐点的选择及下单及健康档案的管理服务。

2. 用户账户
用户需注册账户并妥善保管账户信息，因账户信息泄露造成的损失由用户自行承担。

3. 用户义务
用户承诺在使用本小程序时遵守相关法律法规，不得发布违法信息。

4. 知识产权
本小程序及其内容的知识产权归开发者所有，未经授权不得使用。

5. 责任限制
对于因不可抗力导致的服务中断，开发者不承担责任。

6. 协议修改
开发者有权随时修改本协议，修改后的协议将在本小程序上公布。

7. 法律适用
本协议适用中华人民共和国法律，任何争议应提交至开发者所在地法院解决。

8. 联系方式
如您对本协议或服务内容有疑问，可联系 ${brandConfig.legalEntityName}，联系电话：${brandConfig.contactPhone}。\r\n\r\n\r\n\r\n\r\n\r\n`
}

export function buildPrivacyPolicyContent() {
  return `${brandConfig.legalEntityName}非常重视您的隐私保护。请您仔细阅读本隐私政策，以了解我们如何收集、使用和保护您的个人信息。

1. 信息收集
我们会收集您的姓名、联系方式及订单信息，以便为您提供服务。

2. 信息使用
收集的信息将用于处理您的订单、提供客户服务及改进我们的服务。

3. 信息共享
我们不会将您的个人信息出售给第三方，但可能会在法律要求或保护我们权利的情况下共享信息。

4. 信息安全
我们采取合理的技术和管理措施保护您的个人信息安全。

5. 用户权利
您有权访问、修改和删除您的个人信息，具体操作请联系${brandConfig.legalEntityName}。

6. 政策变更
我们可能会不定期更新本隐私政策，更新后将在本小程序上公布。

7. 联系方式
如您对本隐私政策有疑问，可联系${brandConfig.legalEntityName}，联系电话：${brandConfig.contactPhone}。\r\n\r\n\r\n\r\n`
}

export function buildTcmRxAddSubtitle(customerName: string) {
  return `为 ${customerName} 添加中医处方记录`
}
