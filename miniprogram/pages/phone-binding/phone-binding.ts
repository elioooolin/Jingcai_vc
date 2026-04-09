// pages/phone-binding/phone-binding.ts

import { brandConfig, getShareTitle } from '../../config/brand'

Page({
  data: {
    phone: '',
    isPhoneValid: false,
    bindingLoading: false,
    errorDialogVisible: false,
    errorDialogTitle: '',
    errorDialogContent: '',
    contactDialogVisible: false,
    brandDisplayName: brandConfig.displayName,
    brandLogoPath: brandConfig.logoPath
  },

  onLoad(options: any) {
    console.log('手机号绑定页面加载', options)

    wx.setNavigationBarTitle({
      title: brandConfig.phoneBindingNavigationTitle
    })
    
    // 检查用户是否已经登录过微信
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo && userInfo._id) {
      // 用户已经完成绑定，跳转到主页
      this.redirectToHomePage(userInfo)
    }
  },

  // 手机号输入变化
  onPhoneChange(e: any) {
    const phone = e.detail.value
    const isValid = this.validatePhone(phone)
    
    this.setData({
      phone: phone,
      isPhoneValid: isValid
    })
  },

  // 验证手机号格式
  validatePhone(phone: string): boolean {
    const phoneRegex = /^1[3-9]\d{9}$/
    return phoneRegex.test(phone)
  },

  // 处理绑定手机号
  handleBindPhone() {
    const { phone } = this.data
    
    if (!this.validatePhone(phone)) {
      this.showErrorDialog('手机号格式错误', '请输入正确的已登记手机号')
      return
    }

    this.setData({ bindingLoading: true })

    // 调用云函数绑定手机号
    wx.cloud.callFunction({
      name: 'bindPhone',
      data: {
        phone: phone
      },
      success: (res: any) => {
        console.log('绑定手机号结果:', res.result)
        
        if (res.result.success) {
          // 绑定成功
          this.handleBindingSuccess(res.result.user, res.result.session)
        } else {
          // 绑定失败
          this.handleBindingError(res.result)
        }
      },
      fail: (err: any) => {
        console.error('调用绑定手机号云函数失败:', err)
        this.setData({ bindingLoading: false })
        this.showErrorDialog('网络错误', '网络连接失败，请检查网络后重试')
      }
    })
  },

  // 处理微信手机号授权绑定
  handleGetPhoneNumber(e: any) {
    const detail = e.detail || {}
    const code = detail.code

    if (!code) {
      if (detail.errMsg && detail.errMsg.includes('fail user deny')) {
        this.showErrorDialog('未授权手机号', '您取消了微信手机号授权，可改用下方手动输入手机号绑定')
        return
      }

      this.showErrorDialog('授权失败', '未能获取微信手机号授权，请稍后重试')
      return
    }

    this.setData({ bindingLoading: true })

    wx.cloud.callFunction({
      name: 'bindPhone',
      data: {
        phoneCode: code
      },
      success: (res: any) => {
        console.log('微信手机号绑定结果:', res.result)

        if (res.result.success) {
          this.handleBindingSuccess(res.result.user, res.result.session)
        } else {
          this.handleBindingError(res.result)
        }
      },
      fail: (err: any) => {
        console.error('调用微信手机号绑定云函数失败:', err)
        this.setData({ bindingLoading: false })
        this.showErrorDialog('网络错误', '网络连接失败，请检查网络后重试')
      }
    })
  },

  // 处理绑定成功
  handleBindingSuccess(user: any, session?: any) {
    // 保存用户信息到本地存储
    wx.setStorageSync('userInfo', user)
    if (session?.sessionToken) {
      wx.setStorageSync('sessionToken', session.sessionToken)
    }
    wx.removeStorageSync('manualLogout')
    
    this.setData({ bindingLoading: false })
    
    wx.showToast({
      title: `欢迎您，${user.name}！`,
      icon: 'success',
      duration: 2000
    })

    setTimeout(() => {
      this.redirectToHomePage(user)
    }, 1500)
  },

  // 处理绑定错误
  handleBindingError(result: any) {
    this.setData({ bindingLoading: false })
    
    switch (result.error) {
      case 'PHONE_ALREADY_BOUND':
        this.showErrorDialog('手机号已被使用', '该手机号已被其他微信账号绑定，请联系客服处理')
        break
      case 'USER_NOT_FOUND':
        this.setData({ contactDialogVisible: true })
        break
      case 'USER_INACTIVE':
        this.showErrorDialog('账号状态异常', '您的账号状态异常，请联系管理员处理')
        break
      case 'OPENID_ALREADY_BOUND':
        this.showErrorDialog('微信账号已绑定', '您的微信账号已绑定其他账号，无法重复绑定')
        break
      case 'INVALID_PHONE':
        this.showErrorDialog('手机号格式错误', '请输入正确的手机号')
        break
      case 'PHONE_AUTH_FAILED':
        this.showErrorDialog('授权失败', result.message || '微信手机号授权失败，请稍后重试')
        break
      default:
        this.showErrorDialog('绑定失败', result.message || '绑定失败，请稍后重试')
        break
    }
  },

  // 显示错误弹窗
  showErrorDialog(title: string, content: string) {
    this.setData({
      errorDialogVisible: true,
      errorDialogTitle: title,
      errorDialogContent: content
    })
  },

  // 关闭错误弹窗
  closeErrorDialog() {
    this.setData({
      errorDialogVisible: false,
      errorDialogTitle: '',
      errorDialogContent: ''
    })
  },

  // 关闭联系客服弹窗
  closeContactDialog() {
    this.setData({ contactDialogVisible: false })
  },

  // 跳转到主页
  redirectToHomePage(user: any) {
    if (user.role === 'admin' || user.role === 'staff' || user.isAdmin) {
      wx.reLaunch({
        url: `/pages/admin/dashboard/dashboard${user.role === 'staff' ? '?mode=readonly' : ''}`
      })
    } else {
      wx.reLaunch({
        url: '/pages/customer/dashboard/dashboard'
      })
    }
  },

  // 页面分享
  onShareAppMessage() {
    return {
      title: getShareTitle(),
      path: '/pages/login/login'
    };
  }
})
