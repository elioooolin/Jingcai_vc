// pages/customer/history/history.ts

interface OrderItem {
  id: string;
  date: string;
  submitTime: string;
  status: string;
  statusText: string;
  dishes: Array<{
    type: string;
    names: string;
  }>;
  specialRequirements?: string;
}

Page({
  data: {
    selectedMonth: '2024-01',
    selectedMonthText: '2024年1月',
    selectedStatus: 'all',
    selectedStatusText: '全部状态',
    orderList: [] as OrderItem[],
    hasMore: true,
    loadingMore: false,
    currentPage: 1,
    pageSize: 10,
    
    monthOptions: [
      { label: '2024年1月', value: '2024-01' },
      { label: '2023年12月', value: '2023-12' },
      { label: '2023年11月', value: '2023-11' }
    ],
    
    statusOptions: [
      { label: '全部状态', value: 'all' },
      { label: '待确认', value: 'submitted' },
      { label: '已确认', value: 'confirmed' },
      { label: '已取消', value: 'cancelled' }
    ]
  },

  onLoad() {
    this.checkLoginStatus();
    this.loadOrderList();
  },

  onShow() {
    // 页面显示时刷新数据
    this.refreshData();
  },

  onPullDownRefresh() {
    this.refreshData();
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadMore();
    }
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
  },

  // 刷新数据
  refreshData() {
    this.setData({
      orderList: [],
      currentPage: 1,
      hasMore: true
    });
    this.loadOrderList();
  },

  // 加载订单列表
  loadOrderList() {
    const { selectedMonth, selectedStatus, currentPage, pageSize } = this.data;
    
    // 模拟API调用
    setTimeout(() => {
      const mockOrders = this.generateMockOrders();
      const filteredOrders = this.filterOrders(mockOrders, selectedMonth, selectedStatus);
      
      // 分页处理
      const startIndex = (currentPage - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const pageOrders = filteredOrders.slice(startIndex, endIndex);
      
      const newOrderList = currentPage === 1 ? pageOrders : [...this.data.orderList, ...pageOrders];
      
      this.setData({
        orderList: newOrderList,
        hasMore: endIndex < filteredOrders.length,
        loadingMore: false
      });

      // 停止下拉刷新
      wx.stopPullDownRefresh();
    }, 1000);
  },

  // 生成模拟订单数据
  generateMockOrders(): OrderItem[] {
    return [
      {
        id: 'order_001',
        date: '2024年1月5日',
        submitTime: '09:30',
        status: 'submitted',
        statusText: '待确认',
        dishes: [
          { type: '早餐', names: '小米粥 + 蒸蛋' },
          { type: '午餐', names: '红烧鸡腿 + 蒸蛋羹 + 冬瓜汤' },
          { type: '晚餐', names: '清蒸鲈鱼 + 紫菜蛋花汤' }
        ],
        specialRequirements: '少盐，不吃蒜',
        customerName: "",
        room: ""
      },
      {
        id: 'order_002',
        date: '2024年1月4日',
        submitTime: '08:45',
        status: 'confirmed',
        statusText: '已确认',
        dishes: [
          { type: '早餐', names: '燕麦粥 + 煮鸡蛋' },
          { type: '午餐', names: '蒸蛋羹 + 排骨汤' },
          { type: '晚餐', names: '时令蔬菜 + 丝瓜汤' }
        ],
        customerName: "",
        room: ""
      },
      {
        id: 'order_003',
        date: '2024年1月3日',
        submitTime: '10:15',
        status: 'confirmed',
        statusText: '已确认',
        dishes: [
          { type: '早餐', names: '小米粥 + 蒸蛋' },
          { type: '午餐', names: '红烧鸡腿 + 冬瓜汤' },
          { type: '晚餐', names: '豆腐汤 + 紫菜蛋花汤' },
          { type: '高补餐', names: '猪蹄汤' }
        ],
        customerName: "",
        room: ""
      },
      {
        id: 'order_004',
        date: '2024年1月2日',
        submitTime: '09:00',
        status: 'confirmed',
        statusText: '已确认',
        dishes: [
          { type: '早餐', names: '燕麦粥 + 煮鸡蛋' },
          { type: '午餐', names: '清蒸鲈鱼 + 排骨汤' },
          { type: '晚餐', names: '时令蔬菜 + 丝瓜汤' }
        ],
        customerName: "",
        room: ""
      },
      {
        id: 'order_005',
        date: '2024年1月1日',
        submitTime: '11:30',
        status: 'confirmed',
        statusText: '已确认',
        dishes: [
          { type: '早餐', names: '小米粥 + 蒸蛋' },
          { type: '午餐', names: '瘦肉粥 + 冬瓜汤' },
          { type: '晚餐', names: '清蒸鲈鱼 + 紫菜蛋花汤' },
          { type: '高补餐', names: '乌鸡汤' }
        ],
        specialRequirements: '不吃辣',
        customerName: "",
        room: ""
      }
    ];
  },

  // 过滤订单
  filterOrders(orders: OrderItem[], month: string, status: string): OrderItem[] {
    return orders.filter(order => {
      const monthMatch = month === 'all' || order.date.includes(month.replace('-', '年') + '月');
      const statusMatch = status === 'all' || order.status === status;
      return monthMatch && statusMatch;
    });
  },

  // 月份选择
  onMonthChange(e: any) {
    const selectedOption = this.data.monthOptions.find(option => option.value === e.detail.value);
    this.setData({
      selectedMonth: e.detail.value,
      selectedMonthText: selectedOption?.label || ''
    });
    this.refreshData();
  },

  // 状态选择
  onStatusChange(e: any) {
    const selectedOption = this.data.statusOptions.find(option => option.value === e.detail.value);
    this.setData({
      selectedStatus: e.detail.value,
      selectedStatusText: selectedOption?.label || ''
    });
    this.refreshData();
  },

  // 加载更多
  loadMore() {
    if (this.data.loadingMore || !this.data.hasMore) return;
    
    this.setData({ 
      loadingMore: true,
      currentPage: this.data.currentPage + 1
    });
    
    this.loadOrderList();
  },

  // 修改订单
  editOrder(e: any) {
    const orderId = e.currentTarget.dataset.id;
    const order = this.data.orderList.find(item => item.id === orderId);
    
    if (!order) return;
    
    // 跳转到点餐页面，传入订单信息进行编辑
    wx.navigateTo({
      url: `/pages/customer/menu/menu?date=${order.date}&editMode=true&orderId=${orderId}`
    });
  },

  // 取消订单
  cancelOrder(e: any) {
    const orderId = e.currentTarget.dataset.id;
    
    Dialog.confirm({
      context: this,
      selector: '#t-dialog',
      title: '确认取消',
      content: '确定要取消这个订单吗？取消后无法恢复。',
      confirmBtn: '确认取消',
      cancelBtn: '我再想想'
    }).then(() => {
      // 执行取消操作
      this.performCancelOrder(orderId);
    }).catch(() => {
      // 用户取消操作
    });
  },

  // 执行取消订单
  performCancelOrder(orderId: string) {
    // 模拟API调用
    setTimeout(() => {
      const orderList = this.data.orderList.map(order => {
        if (order.id === orderId) {
          return {
            ...order,
            status: 'cancelled',
            statusText: '已取消'
          };
        }
        return order;
      });
      
      this.setData({ orderList });
      
      wx.showToast({
        title: '订单已取消',
        icon: 'success',
        duration: 2000
      });
    }, 1000);
  }
});
