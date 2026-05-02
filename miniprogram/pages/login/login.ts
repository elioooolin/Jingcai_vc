// pages/login/login.ts

import {
  brandConfig,
  buildPrivacyPolicyContent,
  buildUserAgreementContent,
  getShareTitle
} from '../../config/brand'

// 管理员密码（实际项目中应该从云端验证）
const ADMIN_PASSWORD = 'jingcai999999';

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
    brandDisplayName: brandConfig.displayName,
    brandSlogan: brandConfig.slogan,
    brandLogoPath: brandConfig.logoPath,
    loginNoticeText: brandConfig.loginNoticeText,
    loginFooterText: brandConfig.loginFooterText,
    userAgreementContent: buildUserAgreementContent(),
    privacyPolicyVisible: false,
    privacyPolicyContent: buildPrivacyPolicyContent()
  },

  onLoad() {
    wx.setNavigationBarTitle({
      title: brandConfig.loginNavigationTitle
    });

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
      userNotFoundContent: `抱歉，您的账号尚未创建。请联系工作人员为您开通服务。\n\n📞 联系电话：${brandConfig.contactPhone}\n🕒 服务时间：09:00-18:00`
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
      title: getShareTitle(),
      path: '/pages/customer/dashboard/dashboard'
    };
  }
});
