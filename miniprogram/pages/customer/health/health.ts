// pages/customer/health/health.ts

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
  },

  onShow() {
  },

  onPullDownRefresh() {
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

});
