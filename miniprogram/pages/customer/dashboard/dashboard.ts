// pages/customer/dashboard/dashboard.ts

Page({
  data: {
    userInfo: {},
    checkInDays: 0,
    activeTab: 'order',
    selectedDate: '',
    dateList: [] as any[],
    orderDateRange: '',
    todayOrder: {
      id: 'today_001',
      date: '2024-01-05',
      status: 'submitted',
      statusText: '待确认',
      items: [
        { type: '早餐', dishes: '小米粥 + 蒸蛋' },
        { type: '午餐', dishes: '红烧鸡腿 + 冬瓜汤' },
        { type: '晚餐', dishes: '清蒸鲈鱼 + 紫菜蛋花汤' }
      ]
    },
    orderHistory: [
      {
        id: 'order_001',
        date: '2024年1月4日',
        status: 'confirmed',
        statusText: '已确认',
        items: [
          { type: '早餐', dishes: '燕麦粥 + 煮鸡蛋' },
          { type: '午餐', dishes: '蒸蛋羹 + 排骨汤' }
        ]
      },
      {
        id: 'order_002',
        date: '2024年1月3日',
        status: 'confirmed',
        statusText: '已确认',
        items: [
          { type: '早餐', dishes: '小米粥 + 蒸蛋' },
          { type: '午餐', dishes: '红烧鸡腿 + 冬瓜汤' }
        ]
      }
    ]
  },

  onLoad() {
    this.checkLoginStatus();
    // checkLoginStatus 中已经包含了用户信息初始化和日期列表初始化
  },

  onShow() {
    this.refreshOrderData();
    this.refreshUserInfo();
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
    
    // 计算入住天数
    const checkInDays = this.calculateCheckInDays(userInfo.checkInDate);
    this.setData({ 
      userInfo,
      checkInDays 
    });
    
    // 用户信息验证通过后立即初始化日期列表
    this.initDateList();
  },

  // 初始化用户信息（仅用于设置数据，不初始化日期列表）
  initUserInfo() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      // 计算入住天数
      const checkInDays = this.calculateCheckInDays(userInfo.checkInDate);
      this.setData({ 
        userInfo,
        checkInDays 
      });
    }
  },

  // 计算入住天数
  calculateCheckInDays(checkInDate: string): number {
    if (!checkInDate) return 0;
    
    const checkIn = new Date(checkInDate);
    const today = new Date();
    
    // 设置时间为当天的开始，避免时间差异
    checkIn.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    
    // 计算天数差
    const timeDiff = today.getTime() - checkIn.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
    
    // 入住当天算第1天，所以要加1
    return daysDiff + 1;
  },

  // 初始化日期列表
  /**
   * Initializes the date list for ordering meals.
   * Falls back to default date range if user info is incomplete.
   */
  initDateList() {
    const userInfo: { checkInDate?: string; totalDays?: number } = this.data.userInfo || {};
    
    console.log('初始化日期列表，用户信息:', {
      checkInDate: userInfo.checkInDate,
      totalDays: userInfo.totalDays
    });
    
    if (
      typeof userInfo.checkInDate !== 'string' ||
      typeof userInfo.totalDays !== 'number' ||
      !userInfo.checkInDate ||
      userInfo.totalDays <= 0
    ) {
      console.log('用户信息不完整，使用默认日期范围');
      this.initDefaultDateList();
      return;
    }

    const checkInDate = new Date(userInfo.checkInDate);
    const today = new Date();
    const dateList = [];
    
    // 计算可点餐的开始日期（入住第8天）
    const orderStartDate = new Date(checkInDate);
    orderStartDate.setDate(checkInDate.getDate() + 7); // 入住第8天
    
    // 计算可点餐的结束日期（出所当日）
    const checkOutDate = new Date(checkInDate);
    checkOutDate.setDate(checkInDate.getDate() + userInfo.totalDays - 1);
    
    // 计算并设置可点餐日期范围文字
    const orderDateRange = `${this.formatDateChinese(orderStartDate)}-${this.formatDateChinese(checkOutDate)}`;
    this.setData({ orderDateRange });
    
    console.log('日期计算结果：', {
      checkInDate: userInfo.checkInDate,
      totalDays: userInfo.totalDays,
      orderStartDate: this.formatDate(orderStartDate),
      checkOutDate: this.formatDate(checkOutDate),
      orderDateRange
    });
    
    // 计算提前3天的最早可点餐日期（今天+3天）
    const earliestOrderDate = new Date(today);
    earliestOrderDate.setDate(today.getDate() + 3);
    
    // 确定日期范围的开始和结束
    // 开始日期：入住第8天和今天中的较晚者
    const rangeStartDate = new Date(Math.max(orderStartDate.getTime(), today.getTime()));
    
    // 结束日期：出所当日
    const rangeEndDate = new Date(checkOutDate);
    
    // 计算日期范围的天数
    const rangeDays = Math.ceil((rangeEndDate.getTime() - rangeStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    // 限制最大显示天数为21天，避免界面过长
    const displayDays = Math.min(rangeDays, 21);
    
    let selectedIndex = -1;
    
    for (let i = 0; i < displayDays; i++) {
      const currentDate = new Date(rangeStartDate);
      currentDate.setDate(rangeStartDate.getDate() + i);
      
      // 如果当前日期超出了实际的入住期间，停止生成
      if (currentDate > checkOutDate) {
        break;
      }
      
      // 判断日期状态
      let disabled = false;
      let tooEarly = false;
      let expired = false;
      
      if (currentDate < orderStartDate) {
        // 还未到可点餐的入住第8天
        disabled = true;
        tooEarly = true;
      } else if (currentDate > checkOutDate) {
        // 已经超出入住期间
        disabled = true;
      } else if (currentDate < earliestOrderDate) {
        // 需要提前3天预订，今天、明天、后天不能点餐
        disabled = true;
        expired = true;
      }
      
      const dateObj = {
        date: this.formatDate(currentDate),
        day: currentDate.getDate(),
        month: currentDate.getMonth() + 1,
        monthName: this.getMonthName(currentDate.getMonth() + 1),
        year: currentDate.getFullYear(),
        disabled: disabled,
        tooEarly: tooEarly,
        expired: expired,
        selected: false,
        isToday: this.isSameDate(currentDate, today),
        showMonth: currentDate.getDate() === 1 || i === 0 // 每月1号或第一个日期显示月份
      };
      
      // 如果当前日期可用且还没有选中日期，选中它
      if (!disabled && selectedIndex === -1) {
        dateObj.selected = true;
        selectedIndex = i;
        this.setData({ selectedDate: dateObj.date });
      }
      
      dateList.push(dateObj);
      
      // 如果已经超过结束日期，停止生成
      if (currentDate >= checkOutDate) {
        break;
      }
    }
    
    this.setData({ dateList });
  },

  // 默认日期列表（当用户信息不完整时使用）
  initDefaultDateList() {
    const today = new Date();
    const dateList = [];
    
    // 设置默认的可点餐日期范围文字
    this.setData({ orderDateRange: '入住第8天到出所当日' });
    
    // 计算提前3天的最早可点餐日期
    const earliestOrderDate = new Date(today);
    earliestOrderDate.setDate(today.getDate() + 3);
    
    // 从今天开始显示14天，但优先显示可点餐的日期
    let selectedIndex = -1;
    
    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      
      // 判断是否需要提前3天预订
      const disabled = date < earliestOrderDate;
      
      const dateObj = {
        date: this.formatDate(date),
        day: date.getDate(),
        month: date.getMonth() + 1,
        monthName: this.getMonthName(date.getMonth() + 1),
        year: date.getFullYear(),
        disabled: disabled,
        tooEarly: false,
        expired: disabled, // 前3天标记为expired
        selected: false,
        isToday: this.isSameDate(date, today),
        showMonth: date.getDate() === 1 || i === 0
      };
      
      // 选择第一个可用日期
      if (!disabled && selectedIndex === -1) {
        dateObj.selected = true;
        selectedIndex = i;
        this.setData({ selectedDate: dateObj.date });
      }
      
      dateList.push(dateObj);
    }
    
    this.setData({ dateList });
  },

  // 获取月份名称
  getMonthName(month: number): string {
    const months = ['1月', '2月', '3月', '4月', '5月', '6月', 
                   '7月', '8月', '9月', '10月', '11月', '12月'];
    return months[month - 1] || `${month}月`;
  },

  // 判断是否为同一天
  isSameDate(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  },

  // 格式化日期
  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 格式化中文日期显示
  formatDateChinese(date: Date): string {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  },

  // 标签页切换
  onTabChange(e: any) {
    this.setData({ activeTab: e.detail.value });
  },

  // 选择日期
  selectDate(e: any) {
    const { date, index } = e.currentTarget.dataset;
    const { dateList } = this.data;
    const item = dateList[index];
    
    // 检查是否为禁用日期
    if (item.disabled || item.tooEarly || item.expired) {
      wx.showToast({
        title: '该日期不可点餐',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    // 更新选中状态
    const newDateList = dateList.map((dateItem, idx) => ({
      ...dateItem,
      selected: idx === index
    }));
    
    this.setData({
      dateList: newDateList,
      selectedDate: date
    });
    
    // 跳转到点餐页面
    console.log('跳转到点餐页面，日期:', date);
    wx.navigateTo({
      url: `/pages/customer/menu/menu?date=${date}`,
      fail: (error) => {
        console.error('跳转失败:', error);
        wx.showToast({
          title: '页面跳转失败',
          icon: 'error',
          duration: 2000
        });
      }
    });
  },

  // 刷新订单数据
  refreshOrderData() {
    // 这里可以调用API获取最新的订单数据
    console.log('刷新订单数据');
  },

  // 刷新用户信息
  refreshUserInfo() {
    wx.cloud.callFunction({
      name: 'getUserProfile',
      success: (res: any) => {
        if (res.result.success) {
          console.log('获取最新用户信息成功:', res.result.user);
          // 更新本地存储
          wx.setStorageSync('userInfo', res.result.user);
          
          // 计算入住天数并更新页面数据
          const checkInDays = this.calculateCheckInDays(res.result.user.checkInDate);
          this.setData({ 
            userInfo: res.result.user,
            checkInDays 
          });
          
          // 重新初始化日期列表
          this.initDateList();
        } else {
          console.log('获取用户信息失败:', res.result.message);
        }
      },
      fail: (err: any) => {
        console.error('调用getUserProfile失败:', err);
      }
    });
  },

  // 编辑个人信息
  editProfile() {
    wx.showToast({
      title: '编辑个人信息功能开发中',
      icon: 'none',
      duration: 2000
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
          wx.reLaunch({
            url: '/pages/login/login'
          });
        }
      }
    });
  }
});
