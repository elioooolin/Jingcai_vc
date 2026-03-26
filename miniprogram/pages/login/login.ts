// pages/login/login.ts

// 管理员密码（实际项目中应该从云端验证）
const ADMIN_PASSWORD = 'admin123';

Page({
  data: {
    loginLoading: false,
    pageReady: false,
    phoneAuthLoginEnabled: false,
    agreementChecked: false,
    redirectTarget: '',
    redirectDate: '',
    userNotFoundVisible: false,
    userNotFoundContent: '',
    adminVerifyVisible: false,
    adminPassword: '',
    currentUser: null as any,
    userAgreementVisible: false,
    userAgreementContent: `欢迎使用爱睦月子管理小程序（以下简称"本小程序"）。使用本小程序前，请您仔细阅读本用户协议（以下简称"本协议"）。一旦您使用本小程序，即表示您已同意本协议的所有条款。

1. 服务内容
本小程序提供爱睦月子中心在住客户的月子餐点的选择及下单及健康档案的管理服务。

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
本协议适用中华人民共和国法律，任何争议应提交至开发者所在地法院解决。\r\n\r\n\r\n\r\n\r\n\r\n`,
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
我们可能会不定期更新本隐私政策，更新后将在本小程序上公布。\r\n\r\n\r\n\r\n`
  },

  onLoad() {
    const { redirect = '', date = '', forceAuth = '' } = this.options || {};
    const shouldForceAuth = forceAuth === '1';

    if (redirect || date) {
      this.setData({
        redirectTarget: redirect,
        redirectDate: date
      } as any);
    }

    if (shouldForceAuth) {
      this.bootstrapLoginState(true);
      return;
    }

    const manualLogout = wx.getStorageSync('manualLogout');
    const sessionToken = wx.getStorageSync('sessionToken');

    const userInfo = wx.getStorageSync('userInfo');
    if (!manualLogout && sessionToken) {
      this.validateSession(sessionToken, userInfo);
      return;
    }

    if (!manualLogout && userInfo && (userInfo.role === 'visitor' || userInfo.userType === 'visitor')) {
      this.redirectToHomePage(userInfo);
      return;
    }

    if (!manualLogout && userInfo && userInfo._id) {
      this.validateUserInfo(userInfo);
      return;
    }

    this.bootstrapLoginState(!!manualLogout);
  },

  validateSession(sessionToken: string, fallbackUserInfo?: any) {
    this.setData({
      loginLoading: true,
      pageReady: false
    });

    wx.cloud.callFunction({
      name: 'validateSession',
      data: {
        sessionToken
      },
      success: (res: any) => {
        if (res.result?.success) {
          wx.setStorageSync('sessionToken', res.result.session.sessionToken);
          wx.setStorageSync('userInfo', res.result.user);
          wx.removeStorageSync('manualLogout');
          this.redirectToHomePage(res.result.user);
          return;
        }

        wx.removeStorageSync('sessionToken');

        if (fallbackUserInfo && fallbackUserInfo._id) {
          this.validateUserInfo(fallbackUserInfo);
          return;
        }

        this.bootstrapLoginState();
      },
      fail: (err: any) => {
        console.error('校验 session 失败:', err);
        wx.removeStorageSync('sessionToken');

        if (fallbackUserInfo && fallbackUserInfo._id) {
          this.validateUserInfo(fallbackUserInfo);
          return;
        }

        this.bootstrapLoginState();
      }
    });
  },

  // 验证用户信息有效性
  validateUserInfo(userInfo: any) {
    wx.cloud.callFunction({
      name: 'getUserProfile',
      success: (res: any) => {
        if (res.result.success) {
          console.log('用户信息有效:', res.result.user);
          // 更新本地存储的用户信息
          wx.setStorageSync('userInfo', res.result.user);
          this.redirectToHomePage(res.result.user);
        } else {
          // 用户信息已失效，清除本地存储
          wx.removeStorageSync('userInfo');
          console.log('用户信息已失效，已清除');
        }
      },
      fail: (err: any) => {
        console.error('验证用户信息失败:', err);
        wx.removeStorageSync('userInfo');
        this.bootstrapLoginState();
      }
    });
  },

  bootstrapLoginState(suppressAutoLogin = false) {
    this.setData({
      loginLoading: true,
      pageReady: false,
      phoneAuthLoginEnabled: true
    });

    this.setData({
      loginLoading: false,
      pageReady: true,
      phoneAuthLoginEnabled: true
    });
  },

  onAgreementChange(e: any) {
    const values = e.detail?.value || [];
    this.setData({
      agreementChecked: values.includes('agreed')
    });
  },

  // 处理微信登录
  handleWechatLogin() {
    this.setData({ loginLoading: true });

    // 调用微信登录云函数
    wx.cloud.callFunction({
      name: 'wechatLogin',
      success: (res: any) => {
        console.log('微信登录结果:', res.result);
        
        if (res.result.success) {
          if (res.result.session?.role === 'visitor') {
            this.handleLoginSuccess(res.result.user);
          } else if (res.result.isRegistered) {
            // 用户已注册，检查是否需要管理员验证
            if (res.result.user.role === 'admin') {
              this.setData({ 
                currentUser: res.result.user,
                loginLoading: false 
              });
              this.showAdminVerifyDialog();
            } else {
              // 普通用户直接登录
              this.handleLoginSuccess(res.result.user);
            }
          }
        } else {
          this.handleLoginError(res.result);
        }
      },
      fail: (err: any) => {
        console.error('微信登录云函数调用失败:', err);
        this.setData({ loginLoading: false });
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'error'
        });
      }
    });
  },

  handleLoginWithPhoneAuth(e: any) {
    if (!this.data.agreementChecked) {
      wx.showToast({
        title: '请先阅读并同意相关协议',
        icon: 'none'
      });
      return;
    }

    const detail = e.detail || {};
    const code = detail.code;

    if (!code) {
      if (detail.errMsg && detail.errMsg.includes('fail user deny')) {
        wx.showToast({
          title: '未授权手机号',
          icon: 'none'
        });
        return;
      }

      wx.showToast({
        title: '手机号授权失败',
        icon: 'none'
      });
      return;
    }

    this.setData({ loginLoading: true });

    wx.cloud.callFunction({
      name: 'loginWithPhoneAuth',
      data: {
        phoneCode: code
      },
      success: (res: any) => {
        console.log('登录页手机号授权登录结果:', res.result);

        if (res.result.success) {
          if (res.result.user.role === 'admin') {
            this.setData({
              currentUser: res.result.user,
              loginLoading: false
            });
            this.showAdminVerifyDialog();
            return;
          }

          this.handleLoginSuccess(res.result.user, res.result.session);
          return;
        }

        if (res.result.error === 'USER_NOT_FOUND') {
          this.handleLoginSuccess(
            {
              name: '微信访客',
              role: 'visitor',
              userType: 'visitor'
            },
            res.result.session
          );
          return;
        }

        this.setData({ loginLoading: false });
        this.handleLoginError(res.result);
      },
      fail: (err: any) => {
        console.error('登录页手机号绑定失败:', err);
        this.setData({ loginLoading: false });
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'error'
        });
      }
    });
  },

  // 处理登录成功
  handleLoginSuccess(user: any, session?: any) {
    // 保存用户信息到本地存储
    wx.setStorageSync('userInfo', user);
    if (session?.sessionToken) {
      wx.setStorageSync('sessionToken', session.sessionToken);
    }
    wx.removeStorageSync('manualLogout');
    
    this.setData({ loginLoading: false });
    
    wx.showToast({
      title: `欢迎您，${user.name}！`,
      icon: 'success',
      duration: 2000
    });

    setTimeout(() => {
      this.redirectToHomePage(user);
    }, 1000);
  },

  // 处理登录错误
  handleLoginError(result: any) {
    this.setData({ loginLoading: false });
    
    wx.showToast({
      title: result.message || '登录失败，请重试',
      icon: 'error'
    });
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
    const { adminPassword, currentUser } = this.data;
    
    if (adminPassword === ADMIN_PASSWORD) {
      // 管理员验证成功
      this.closeAdminVerifyDialog();
      this.handleLoginSuccess(currentUser);
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
    const redirectTarget = (this.data as any).redirectTarget;
    const redirectDate = (this.data as any).redirectDate;

    if ((userInfo.role === 'customer' || userInfo.userType === 'customer') && redirectTarget === 'menu' && redirectDate) {
      wx.reLaunch({
        url: `/pages/customer/menu/menu?date=${redirectDate}`
      });
      return;
    }

    if (userInfo.role === 'visitor' || userInfo.userType === 'visitor') {
      wx.reLaunch({
        url: '/pages/customer/dashboard/dashboard'
      });
    } else if (userInfo.role === 'admin' || userInfo.role === 'staff' || userInfo.userType === 'admin' || userInfo.userType === 'staff') {
      wx.reLaunch({
        url: `/pages/admin/dashboard/dashboard${userInfo.role === 'staff' || userInfo.userType === 'staff' ? '?mode=readonly' : ''}`
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
  },

  // 页面分享
  onShareAppMessage() {
    return {
      title: '爱睦 Love Moon',
      path: '/pages/customer/dashboard/dashboard'
    };
  }
});
