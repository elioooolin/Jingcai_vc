// pages/customer/history/history.ts

interface OrderItem {
  id: string;
  date: string;
  submitTime: string;
  status: string;
  statusText: string;
  items: Array<{
    type: string;
    dishes: string;
  }>;
  specialRequirements?: string;
}

Page({
  data: {
    userInfo: {} as any,
    orderList: [] as OrderItem[],
    loading: false
  },

  onLoad() {
    this.checkLoginStatus();
    this.loadOrderList();
  },

  onShow() {
    // 页面显示时刷新数据
    this.loadOrderList();
  },

  onPullDownRefresh() {
    this.loadOrderList();
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

  // 加载订单列表
  async loadOrderList() {
    if (this.data.loading) return;
    
    this.setData({ loading: true });
    
    try {
      console.log('开始加载订单历史...');
      
      // 调用云函数获取用户订单
      const result = await wx.cloud.callFunction({
        name: 'getUserOrders',
        data: {
          userId: this.data.userInfo._id
        }
      });
      
      console.log('订单历史云函数调用结果:', result.result);
      
      if (result.result && typeof result.result === 'object' && 'success' in result.result && result.result.success) {
        const allOrders = result.result.orders || [];
        
        // 筛选出非pending状态的订单（历史订单）
        const historyOrders = allOrders.filter((order: any) => order.status !== 'pending');
        
        // 按订单日期降序排列（越晚的日期在前）
        historyOrders.sort((a: any, b: any) => {
          const dateA = new Date(a.orderDate || a.orderDateString);
          const dateB = new Date(b.orderDate || b.orderDateString);
          return dateB.getTime() - dateA.getTime();
        });
        
        // 转换订单格式以适配UI显示
        const formattedOrders = historyOrders.map((order: any) => ({
          id: order.orderId,
          date: this.formatOrderDate(order.orderDate || order.orderDateString),
          submitTime: this.formatSubmitTime(order.createdAt),
          status: order.status,
          statusText: this.getStatusText(order.status, order.orderDate || order.orderDateString),
          items: this.formatOrderItems(order.orderSummary),
          specialRequirements: order.orderSummary?.special_requirements || ''
        }));
        
        this.setData({
          orderList: formattedOrders,
          loading: false
        });
        
        console.log('✅ 订单历史加载完成:', formattedOrders.length, '个订单');
        
      } else {
        console.error('获取订单历史失败:', result.result);
        this.setData({
          orderList: [],
          loading: false
        });
        
        wx.showToast({
          title: '加载失败',
          icon: 'error'
        });
      }
      
    } catch (error) {
      console.error('加载订单历史出错:', error);
      this.setData({
        orderList: [],
        loading: false
      });
      
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      });
    }
    
    // 停止下拉刷新
    wx.stopPullDownRefresh();
  },

  // 格式化订单日期
  formatOrderDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      return `${year}年${month}月${day}日`;
    } catch (error) {
      console.error('日期格式化失败:', error);
      return dateString;
    }
  },

  // 格式化提交时间
  formatSubmitTime(dateString: string): string {
    try {
      const date = new Date(dateString);
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    } catch (error) {
      console.error('时间格式化失败:', error);
      return '';
    }
  },

  // 根据订单状态和日期获取状态文本
  getStatusText(status: string, orderDate: string): string {
    if (status === 'pending') {
      return '待确认';
    } else if (status === 'cancelled') {
      return '已取消';
    } else {
      // 对于其他状态（confirmed等），根据日期判断
      try {
        const orderDateObj = new Date(orderDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        orderDateObj.setHours(0, 0, 0, 0);
        
        if (orderDateObj.getTime() < today.getTime()) {
          return '已上餐';
        } else {
          return '已确认';
        }
      } catch (error) {
        console.error('日期比较失败:', error);
        return '已确认';
      }
    }
  },

  // 格式化订单项目
  formatOrderItems(orderSummary: any): Array<{type: string, dishes: string}> {
    if (!orderSummary) return [];
    
    const items: Array<{type: string, dishes: string}> = [];
    
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
    
    return items;
  }
});
