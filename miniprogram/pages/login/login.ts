// pages/login/login.ts

// 模拟用户数据库
const mockUsers = {
  customers: [
    { phone: '13800138001', name: '张女士', isAdmin: false },
    { phone: '13800138002', name: '李女士', isAdmin: false },
    { phone: '13800138003', name: '王女士', isAdmin: false }
  ],
  admins: [
    { phone: '13900139001', name: '管理员', isAdmin: true }
  ]
};

Page({
  data: {
    loginLoading: false,
    userNotFoundVisible: false,
    userNotFoundContent: '',
    adminVerifyVisible: false,
    adminPassword: '',
    userAgreementVisible: false,
    userAgreementContent: `欢迎使用爱睦月子餐点餐小程序（以下简称"本小程序"）。使用本小程序前，请您仔细阅读本用户协议（以下简称"本协议"）。一旦您使用本小程序，即表示您已同意本协议的所有条款。

1. 服务内容
本小程序提供爱睦月子中心在住客户的月子餐点的选择及下单服务。

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
本协议适用中华人民共和国法律，任何争议应提交至开发者所在地法院解决。`,
    privacyPolicyVisible: false,
    privacyPolicyContent: `我们非常重视您的隐私保护。请您仔细阅读本隐私政策，以了解我们如何收集、使用和保护您的个人信息。

1. 信息收集
我们会收集您的姓名、联系方式及订单信息，以便为您提供服务。

2. 信息使用
收集的信息将用于处理您的订单、提供客户服务及改进我们的服务。

3. 信息共享
我们不会将您的个人信息出售给第三方，但可能会在法律要求或保护我们权利的情况下共享信息。

4. 信息安全
我们采取合理的技术和管理措施保护您的个人信息安全。

5. 用户权利
您有权访问、修改和删除您的个人信息，具体操作请联系我们。

6. 政策变更
我们可能会不定期更新本隐私政策，更新后将在本小程序上公布。`
  },

  onLoad() {
    // 检查是否已登录
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.redirectToHomePage(userInfo);
    }
  },

  // 处理微信登录
  handleWechatLogin() {
    this.setData({ loginLoading: true });

    // 模拟微信登录获取手机号
    const mockPhones = ['13800138001', '13800138002', '13800138999', '13900139001'];
    const randomPhone = mockPhones[Math.floor(Math.random() * mockPhones.length)];
    
    // 模拟网络延迟
    setTimeout(() => {
      this.verifyUserIdentity(randomPhone);
      this.setData({ loginLoading: false });
    }, 1500);
  },

  // 验证用户身份
  verifyUserIdentity(phone: string) {
    console.log('验证手机号:', phone);
    
    // 检查是否为客户
    const customer = mockUsers.customers.find(user => user.phone === phone);
    if (customer) {
      this.handleCustomerLogin(customer);
      return;
    }

    // 检查是否为管理员
    const admin = mockUsers.admins.find(user => user.phone === phone);
    if (admin) {
      this.showAdminVerifyDialog();
      return;
    }

    // 用户不存在
    this.showUserNotFoundDialog();
  },

  // 客户登录成功
  handleCustomerLogin(customer: any) {
    const userInfo = {
      ...customer,
      userType: 'customer'
    };
    
    // 保存用户信息
    wx.setStorageSync('userInfo', userInfo);
    
    wx.showToast({
      title: `欢迎您，${customer.name}！`,
      icon: 'success',
      duration: 2000
    });

    setTimeout(() => {
      this.redirectToHomePage(userInfo);
    }, 1000);
  },

  // 显示用户不存在弹窗
  showUserNotFoundDialog() {
    this.setData({
      userNotFoundVisible: true,
      userNotFoundContent: '抱歉，您的账号尚未创建。请联系工作人员为您开通服务。\n\n📞 客服电话：400-123-4567\n🕒 服务时间：09:00-18:00'
    });
  },

  // 关闭用户不存在弹窗
  closeUserNotFoundDialog() {
    this.setData({ userNotFoundVisible: false });
  },

  // 显示管理员验证弹窗
  showAdminVerifyDialog() {
    this.setData({ 
      adminVerifyVisible: true,
      adminPassword: ''
    });
  },

  // 关闭管理员验证弹窗
  closeAdminVerifyDialog() {
    this.setData({ 
      adminVerifyVisible: false,
      adminPassword: ''
    });
  },

  // 管理员密码输入
  onAdminPasswordChange(e: any) {
    this.setData({ adminPassword: e.detail.value });
  },

  // 验证管理员密码
  verifyAdminPassword() {
    const { adminPassword } = this.data;
    const correctPassword = 'admin123';
    
    if (adminPassword === correctPassword) {
      const userInfo = {
        phone: '13900139001',
        name: '管理员',
        isAdmin: true,
        userType: 'admin'
      };
      
      // 保存用户信息
      wx.setStorageSync('userInfo', userInfo);
      
      this.closeAdminVerifyDialog();
      
      wx.showToast({
        title: '管理员登录成功！',
        icon: 'success',
        duration: 2000
      });

      setTimeout(() => {
        this.redirectToHomePage(userInfo);
      }, 1000);
    } else {
      wx.showToast({
        title: '密码错误，请重试',
        icon: 'error',
        duration: 2000
      });
      this.setData({ adminPassword: '' });
    }
  },

  // 跳转到主页
  redirectToHomePage(userInfo: any) {
    if (userInfo.userType === 'admin') {
      wx.reLaunch({
        url: '/pages/admin/dashboard/dashboard'
      });
    } else {
      wx.reLaunch({
        url: '/pages/customer/dashboard/dashboard'
      });
    }
  },

  // 显示用户协议
  showUserAgreement() {
    this.setData({ userAgreementVisible: true });
  },

  // 关闭用户协议弹窗
  closeUserAgreementDialog() {
    this.setData({ userAgreementVisible: false });
  },

  // 显示隐私政策
  showPrivacyPolicy() {
    this.setData({ privacyPolicyVisible: true });
  },

  // 关闭隐私政策弹窗
  closePrivacyPolicyDialog() {
    this.setData({ privacyPolicyVisible: false });
  }
});
