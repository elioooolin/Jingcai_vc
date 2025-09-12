// pages/login/login.ts
import Toast from 'tdesign-miniprogram/toast/index';

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
    adminPassword: ''
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
    
    Toast({
      context: this,
      selector: '#t-toast',
      message: `欢迎您，${customer.name}！`,
      theme: 'success',
      direction: 'column',
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
      
      Toast({
        context: this,
        selector: '#t-toast',
        message: '管理员登录成功！',
        theme: 'success',
        direction: 'column',
      });

      setTimeout(() => {
        this.redirectToHomePage(userInfo);
      }, 1000);
    } else {
      Toast({
        context: this,
        selector: '#t-toast',
        message: '密码错误，请重试',
        theme: 'error',
        direction: 'column',
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
    Toast({
      context: this,
      selector: '#t-toast',
      message: '用户协议功能待开发',
      theme: 'warning',
      direction: 'column',
    });
  },

  // 显示隐私政策
  showPrivacyPolicy() {
    Toast({
      context: this,
      selector: '#t-toast',
      message: '隐私政策功能待开发',
      theme: 'warning',
      direction: 'column',
    });
  }
});
