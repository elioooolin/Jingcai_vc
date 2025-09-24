// pages/customer/dashboard/dashboard.ts

Page({
  data: {
    userInfo: {},
    checkInDays: 0,
    selectedDate: '',
    dateList: [] as any[],
    orderDateRange: '',
    // 用户订单相关数据
    userOrders: [] as any[],
    orderedDates: [] as string[],  // 已订餐的日期数组
    pendingOrders: [] as any[],  // 待确认的订单
    refreshingOrders: false,  // 是否正在刷新订单数据
    showOrderSubmitSuccess: false,  // 是否显示订单提交成功提示
    cancellingOrderId: ''  // 正在取消的订单ID
  },

  onLoad(options: any) {
    console.log('Dashboard页面加载，参数:', options);
    
    this.checkLoginStatus();
    // checkLoginStatus 中已经包含了用户信息初始化和日期列表初始化
    this.loadSupplementData();
    this.loadUserOrders();
    
    // 检查是否是订单提交成功后的重新加载
    if (options && options.orderSubmitted === 'true') {
      console.log('检测到订单提交成功，显示成功提示');
      // 延迟显示成功提示，确保页面完全加载后再显示
      setTimeout(() => {
        wx.showToast({
          title: '订单已提交！',
          icon: 'success',
          duration: 2000
        });
      }, 800);
    }
    
    // 如果有refresh参数，说明是从其他地方跳转过来需要刷新的（保留原有逻辑）
    if (options && options.refresh === 'true') {
      console.log('检测到refresh参数，将刷新数据');
      this.setData({ showOrderSubmitSuccess: true });
      
      // 延迟一下再刷新，确保页面已经完全加载
      setTimeout(() => {
        this.refreshOrderData();
      }, 500);
    }
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
      let hasOrder = false;
      
      // 检查该日期是否已有订单
      const currentDateString = this.formatDate(currentDate);
      if (this.data.orderedDates.includes(currentDateString)) {
        disabled = true;
        hasOrder = true;
      } else if (currentDate < orderStartDate) {
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
        hasOrder: hasOrder,  // 新增：是否已有订单
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


  // 选择日期
  selectDate(e: any) {
    const { date, index } = e.currentTarget.dataset;
    const { dateList } = this.data;
    const item = dateList[index];
    
    // 检查是否为禁用日期
    if (item.disabled) {
      let message = '该日期不可点餐';
      
      if (item.hasOrder) {
        message = '该日期已有订单，不可重复点餐';
      } else if (item.tooEarly) {
        message = '还未到可点餐时间（入住第8天起）';
      } else if (item.expired) {
        message = '需要提前3天预订';
      }
      
      wx.showToast({
        title: message,
        icon: 'none',
        duration: 2500
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
    console.log('刷新订单数据...');
    
    // 设置刷新状态
    this.setData({ refreshingOrders: true });
    
    // 重新加载用户订单数据
    this.loadUserOrders();
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

  // 加载高补品数据
  loadSupplementData() {
    console.log('开始加载高补品数据...');
    
    wx.cloud.callFunction({
      name: 'getSupplementDishes',
      data: {},
      success: (res: any) => {
        if (res.result && res.result.success) {
          console.log('高补品数据加载成功:', res.result.dishes);
          
          // 存储到本地，供点餐页面使用
          wx.setStorageSync('supplementDishes', {
            data: res.result.dishes,
            timestamp: Date.now(),
            expiry: 24 * 60 * 60 * 1000 // 24小时过期
          });
          
          console.log('高补品数据已存储到本地');
        } else {
          console.error('获取高补品数据失败:', res.result?.message || '未知错误');
        }
      },
      fail: (error: any) => {
        console.error('调用getSupplementDishes云函数失败:', error);
      }
    });
  },

  // 加载用户订单数据
  loadUserOrders() {
    console.log('开始加载用户订单数据...');
    
    const userInfo = this.data.userInfo as any;
    if (!userInfo || !userInfo._id) {
      console.log('用户信息不存在，跳过订单加载');
      return;
    }
    
    wx.cloud.callFunction({
      name: 'getUserOrders',
      data: {
        userId: userInfo._id
      },
      success: (res: any) => {
        if (res.result && res.result.success) {
          console.log('用户订单数据加载成功:', res.result);
          
          const allOrders = res.result.orders || [];
          
          // 筛选出 pending 状态的订单并按订单日期降序排列（越晚的日期在前）
          const pendingOrders = allOrders
            .filter((order: any) => order.status === 'pending')
            .sort((a: any, b: any) => {
              const dateA = new Date(a.orderDate || a.orderDateString);
              const dateB = new Date(b.orderDate || b.orderDateString);
              
              // 调试信息
              console.log('🔍 排序调试:');
              console.log('  订单A:', a.orderId, '日期:', a.orderDate || a.orderDateString, '解析后:', dateA);
              console.log('  订单B:', b.orderId, '日期:', b.orderDate || b.orderDateString, '解析后:', dateB);
              console.log('  比较结果:', dateB.getTime() - dateA.getTime());
              
              return dateB.getTime() - dateA.getTime(); // 降序排列，越晚的日期在前
            });
          
          // 调试：显示排序后的订单顺序
          console.log('📋 排序后的订单顺序:');
          pendingOrders.forEach((order: any, index: number) => {
            console.log(`  ${index + 1}. ${order.orderId} - ${order.orderDate || order.orderDateString}`);
          });
          
          // 转换 pending 订单格式以适配 UI 显示
          const formattedPendingOrders = pendingOrders.map((order: any, index: number) => ({
            id: order.orderId,
            uniqueKey: `${order.orderId}_${Date.now()}_${index}`, // 添加唯一标识
            date: this.formatOrderDate(order.orderDate || order.orderDateString),
            isCancelable: this.calculateIsCancelable(order.orderDate || order.orderDateString),
            status: order.status,
            statusText: '待确认',
            items: this.formatOrderItems(order.orderSummary)
          }));
          
          this.setData({
            userOrders: allOrders,
            orderedDates: res.result.orderedDates || [],
            pendingOrders: formattedPendingOrders,
            refreshingOrders: false,  // 清除刷新状态
            showOrderSubmitSuccess: false  // 清除成功提示
          });
          
          console.log('✅ 订单数据加载完成:');
          console.log('  - 总订单数:', allOrders.length);
          console.log('  - 待确认订单数:', formattedPendingOrders.length);
          
          console.log('已订餐的日期:', res.result.orderedDates);
          console.log('待确认订单:', formattedPendingOrders);
          
          // 重新初始化日期列表，应用订单限制
          this.initDateList();
          
        } else {
          console.error('获取用户订单失败:', res.result?.message || '未知错误');
          this.setData({ refreshingOrders: false });  // 清除刷新状态
        }
      },
      fail: (error: any) => {
        console.error('调用getUserOrders云函数失败:', error);
        this.setData({ refreshingOrders: false });  // 清除刷新状态
      }
    });
  },

  // 格式化订单日期显示
  formatOrderDate(dateInput: any): string {
    if (!dateInput) return '';
    
    let date: Date;
    if (typeof dateInput === 'string') {
      date = new Date(dateInput);
    } else {
      date = dateInput;
    }
    
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    return `${year}年${month}月${day}日`;
  },

  // 计算订单是否可取消
  calculateIsCancelable(orderDateString: string): boolean {
    try {
      const orderDate = new Date(orderDateString);
      const today = new Date();
      
      // 设置时间为0点，只比较日期
      orderDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      
      // 计算日期差（毫秒）
      const timeDiff = orderDate.getTime() - today.getTime();
      
      // 转换为天数
      const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
      
      console.log(`订单日期: ${orderDateString}, 今天: ${today.toISOString().split('T')[0]}, 相差天数: ${daysDiff}`);
      
      // 如果订单日期与当日日期间隔小于3天，则不可取消
      // 例如：订单日期为1月8日，如果今天是1月6日或之后，则不可取消
      return daysDiff >= 3;
      
    } catch (error) {
      console.error('计算订单可取消状态失败:', error);
      // 出错时默认不可取消，保证安全
      return false;
    }
  },

  // 格式化订单项目显示
  formatOrderItems(orderSummary: any): any[] {
    if (!orderSummary) return [];
    
    const items = [];
    
    // 早餐
    if (orderSummary.breakfast) {
      items.push({
        type: '早餐',
        dishes: orderSummary.breakfast
      });
    }
    
    // 午餐
    if (orderSummary.lunch) {
      items.push({
        type: '午餐',
        dishes: orderSummary.lunch
      });
    }
    
    // 晚餐
    if (orderSummary.dinner) {
      items.push({
        type: '晚餐',
        dishes: orderSummary.dinner
      });
    }
    
    // 高补餐
    if (orderSummary.supplement) {
      items.push({
        type: '高补餐',
        dishes: orderSummary.supplement
      });
    }
    
    // 特殊需求
    if (orderSummary.special_requirements && orderSummary.special_requirements.trim()) {
      items.push({
        type: '特殊需求',
        dishes: orderSummary.special_requirements.trim()
      });
    }
    
    return items;
  },

  // 获取订单状态文本
  getStatusText(status: string): string {
    const statusMap: Record<string, string> = {
      'pending': '待确认',
      'confirmed': '已确认',
      'preparing': '准备中',
      'completed': '已完成',
      'cancelled': '已取消'
    };
    
    return statusMap[status] || status;
  },

  // 取消订单
  cancelOrder(e: any) {
    const { orderId, orderDate } = e.currentTarget.dataset;
    
    if (!orderId) {
      wx.showToast({ title: '订单信息错误', icon: 'error' });
      return;
    }

    // 检查订单是否可取消
    const isCancelable = this.calculateIsCancelable(orderDate);
    
    if (!isCancelable) {
      wx.showToast({
        title: '订单已临近，无法取消',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    // 显示确认弹窗
    wx.showModal({
      title: '确认取消订单',
      content: `确定要取消 ${orderDate} 的订单吗？\n\n取消后如果订单包含高补餐，相应次数将会恢复。`,
      confirmText: '确认取消',
      confirmColor: '#ff6b6b',
      cancelText: '我再想想',
      success: (res) => {
        if (res.confirm) {
          this.performCancelOrder(orderId);
        }
      }
    });
  },

  // 执行取消订单操作
  async performCancelOrder(orderId: string) {
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo || !userInfo._id) {
      wx.showToast({ title: '用户信息错误，请重新登录', icon: 'error' });
      return;
    }

    // 设置取消状态
    this.setData({ cancellingOrderId: orderId });

    try {
      // 显示加载提示
      wx.showLoading({ title: '正在取消订单...', mask: true });

      // 调用云函数取消订单
      const result = await wx.cloud.callFunction({
        name: 'cancelOrder',
        data: {
          orderId: orderId,
          userId: userInfo._id
        }
      });

      wx.hideLoading();

      if (result.result && typeof result.result === 'object' && 'success' in result.result && result.result.success) {
        // 取消成功
        let successMessage = '订单取消成功';
        
        if ((result.result as any).supplementCountRestored) {
          successMessage += `，高补餐次数已恢复为 ${(result.result as any).newSupplementCount}`;
        }

        wx.showToast({
          title: successMessage,
          icon: 'success',
          duration: 3000
        });

        // 刷新订单数据
        this.refreshOrderData();

      } else {
        // 取消失败
        const errorMessage = (result.result && typeof result.result === 'object' && 'message' in result.result)
          ? (result.result as any).message
          : '取消订单失败';
        
        wx.showModal({
          title: '取消失败',
          content: errorMessage,
          showCancel: false,
          confirmText: '确定'
        });
      }

    } catch (error) {
      wx.hideLoading();
      console.error('取消订单时发生错误:', error);
      
      wx.showModal({
        title: '取消失败',
        content: '网络错误，请检查网络连接后重试',
        showCancel: true,
        cancelText: '取消',
        confirmText: '重试',
        success: (res) => {
          if (res.confirm) {
            this.performCancelOrder(orderId);
          }
        }
      });
    } finally {
      // 清除取消状态
      this.setData({ cancellingOrderId: '' });
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
          wx.removeStorageSync('supplementDishes'); // 清理高补品数据
          wx.reLaunch({
            url: '/pages/login/login'
          });
        }
      }
    });
  }
});
