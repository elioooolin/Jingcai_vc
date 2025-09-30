// pages/customer/profile/profile.ts

Page({
  data: {
    userInfo: {} as any,
    loading: false,
  },

  onLoad() {
    this.checkLoginStatus();
    this.loadUserProfile();
  },

  onShow() {
    // 页面显示时刷新用户信息
    this.loadUserProfile();
  },

  // 检查登录状态
  checkLoginStatus() {
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo || userInfo.userType !== 'customer') {
      wx.reLaunch({
        url: '/pages/login/login'
      });
      return;
    }
    this.setData({ userInfo });
  },

  // 加载用户完整信息
  async loadUserProfile() {
    if (this.data.loading) return;
    
    this.setData({ loading: true });
    
    try {
      const userInfo = wx.getStorageSync('userInfo');
      if (!userInfo || !userInfo._id) {
        console.error('用户信息不完整');
        this.setData({ loading: false });
        return;
      }

      console.log('开始加载用户完整信息...');
      
      // 调用云函数获取用户完整信息
      const result = await wx.cloud.callFunction({
        name: 'getUserInfo',
        data: {
          userId: userInfo._id
        }
      });
      
      console.log('用户信息云函数调用结果:', result.result);
      
      if (result.result && typeof result.result === 'object' && 'success' in result.result && result.result.success) {
        const fullUserInfo = result.result.userInfo;
        
        console.log('✅ 用户信息获取成功');
        
        // 计算入住天数
        const checkInDays = this.calculateCheckInDays(fullUserInfo.checkInDate);
        
        this.setData({
          userInfo: {
            ...fullUserInfo,
            checkInDays: checkInDays
          },
          loading: false
        });
        
        console.log('✅ 用户信息加载完成', this.data.userInfo);
        
      } else {
        console.error('获取用户信息失败:', result.result);
        
        // 如果云函数失败，使用本地存储的基本信息
        console.log('🔄 云函数失败，使用本地存储信息');
        const localUserInfo = wx.getStorageSync('userInfo');
        if (localUserInfo) {
          this.setData({
            userInfo: localUserInfo,
            loading: false
          });
          
          console.log('📱 使用本地存储的用户信息:', localUserInfo);
        } else {
          this.setData({ loading: false });
          wx.showToast({
            title: '加载失败',
            icon: 'error'
          });
        }
      }
      
    } catch (error) {
      console.error('加载用户信息出错:', error);
      
      // 如果出现异常，也尝试使用本地存储信息
      console.log('🔄 出现异常，使用本地存储信息');
      const localUserInfo = wx.getStorageSync('userInfo');
      if (localUserInfo) {
        this.setData({
          userInfo: localUserInfo,
          loading: false
        });
        console.log('📱 使用本地存储的用户信息:', localUserInfo);
      } else {
        this.setData({ loading: false });
        wx.showToast({
          title: '加载失败',
          icon: 'error'
        });
      }
    }
  },

  // 计算入住天数
  calculateCheckInDays(checkInDate: string): number {
    if (!checkInDate) return 0;
    
    try {
      const checkIn = new Date(checkInDate);
      const today = new Date();
      const diffTime = today.getTime() - checkIn.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return Math.max(1, diffDays); // 至少显示第1天
    } catch (error) {
      console.error('计算入住天数失败:', error);
      return 1;
    }
  },

  // 退出登录
  logout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      confirmText: '退出',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('profileData');
          wx.reLaunch({
            url: '/pages/login/login'
          });
        }
      }
    });
  },

  // 页面分享
  onShareAppMessage() {
    return {
      title: '爱睦 Love Moon',
      path: '/pages/login/login'
    };
  }
});
