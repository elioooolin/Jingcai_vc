// pages/customer/dashboard/dashboard.ts
import Toast from 'tdesign-miniprogram/toast/index';

Page({
  data: {
    userInfo: {},
    checkInDays: 5,
    activeTab: 'order',
    selectedDate: '',
    dateList: [] as any[],
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
    this.initUserInfo();
    this.initDateList();
  },

  onShow() {
    this.refreshOrderData();
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

  // 初始化用户信息
  initUserInfo() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({ userInfo });
    }
  },

  // 初始化日期列表
  initDateList() {
    const today = new Date();
    const dateList = [];
    
    for (let i = -4; i <= 9; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      
      const dateObj = {
        date: this.formatDate(date),
        day: date.getDate(),
        disabled: i < 0, // 过去的日期禁用
        selected: i === 0 // 今天默认选中
      };
      
      dateList.push(dateObj);
      
      if (i === 0) {
        this.setData({ selectedDate: dateObj.date });
      }
    }
    
    this.setData({ dateList });
  },

  // 格式化日期
  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 标签页切换
  onTabChange(e: any) {
    this.setData({ activeTab: e.detail.value });
  },

  // 选择日期
  selectDate(e: any) {
    const { date, index } = e.currentTarget.dataset;
    const { dateList } = this.data;
    
    // 检查是否为禁用日期
    if (dateList[index].disabled) {
      Toast({
        context: this,
        selector: '#t-toast',
        message: '无法选择过去的日期',
        theme: 'warning',
        direction: 'column',
      });
      return;
    }
    
    // 更新选中状态
    const newDateList = dateList.map((item, idx) => ({
      ...item,
      selected: idx === index
    }));
    
    this.setData({
      dateList: newDateList,
      selectedDate: date
    });
  },

  // 开始点餐
  startOrdering() {
    const { selectedDate } = this.data;
    
    if (!selectedDate) {
      Toast({
        context: this,
        selector: '#t-toast',
        message: '请先选择日期',
        theme: 'warning',
        direction: 'column',
      });
      return;
    }
    
    wx.navigateTo({
      url: `/pages/customer/menu/menu?date=${selectedDate}`
    });
  },

  // 刷新订单数据
  refreshOrderData() {
    // 这里可以调用API获取最新的订单数据
    console.log('刷新订单数据');
  },

  // 编辑个人信息
  editProfile() {
    Toast({
      context: this,
      selector: '#t-toast',
      message: '编辑个人信息功能开发中',
      theme: 'warning',
      direction: 'column',
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
