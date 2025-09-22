// pages/customer/profile/profile.ts

Page({
  data: {
    userInfo: {} as any,
    loading: false,
    extraFamilyMealCost: 0,  // 额外陪人餐总费用
    extraFamilyMealFormula: '' // 费用计算公式
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
        
        // 计算额外陪人餐费用
        this.calculateExtraFamilyMealCost(fullUserInfo);
        
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
          
          // 计算额外陪人餐费用
          this.calculateExtraFamilyMealCost(localUserInfo);
          
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

  // 计算额外陪人餐费用
  calculateExtraFamilyMealCost(userInfo: any) {
    if (!userInfo) {
      this.setData({
        extraFamilyMealCost: 0,
        extraFamilyMealFormula: ''
      });
      return;
    }

    const freeFamilyMealCount = userInfo.freeFamilyMealCount || 0;
    const familyBreakfastCnt = userInfo.familyBreakfastCnt || 0;
    const familyMainMealCnt = userInfo.familyMainMealCnt || 0;
    
    // 价格常量
    const BREAKFAST_PRICE = 28; // 早餐陪人餐价格
    const MAIN_MEAL_PRICE = 38; // 午晚餐陪人餐价格
    
    // 计算需要付费的陪人餐数量
    // freeFamilyMealCount 优先抵扣 familyMainMealCnt，其次抵扣 familyBreakfastCnt
    let remainingFreeMeals = freeFamilyMealCount;
    
    // 优先抵扣午晚餐（更贵）
    const freeMainMeals = Math.min(familyMainMealCnt, remainingFreeMeals);
    const paidMainMeals = familyMainMealCnt - freeMainMeals;
    remainingFreeMeals -= freeMainMeals;
    
    // 剩余免费次数抵扣早餐
    const freeBreakfastMeals = Math.min(familyBreakfastCnt, remainingFreeMeals);
    const paidBreakfastMeals = familyBreakfastCnt - freeBreakfastMeals;
    
    // 计算费用
    const breakfastCost = paidBreakfastMeals * BREAKFAST_PRICE;
    const mainMealCost = paidMainMeals * MAIN_MEAL_PRICE;
    const totalCost = breakfastCost + mainMealCost;
    
    // 生成计算公式
    let formula = '';
    const formulaParts = [];
    
    if (paidBreakfastMeals > 0) {
      formulaParts.push(`早餐 ${paidBreakfastMeals}份 × ${BREAKFAST_PRICE}元/份 = ${breakfastCost}元`);
    }
    
    if (paidMainMeals > 0) {
      formulaParts.push(`午晚餐 ${paidMainMeals}份 × ${MAIN_MEAL_PRICE}元/份 = ${mainMealCost}元`);
    }
    
    if (formulaParts.length > 0) {
      formula = formulaParts.join('\n'); // 使用换行符分隔
    } else {
      formula = ''; // 无额外费用时公式为空
    }
    
    console.log('💰 陪人餐费用计算:', {
      freeFamilyMealCount,
      familyBreakfastCnt,
      familyMainMealCnt,
      freeMainMeals,
      paidMainMeals,
      freeBreakfastMeals,
      paidBreakfastMeals,
      breakfastCost,
      mainMealCost,
      totalCost,
      formula
    });
    
    this.setData({
      extraFamilyMealCost: totalCost,
      extraFamilyMealFormula: formula
    });
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
  }
});
