// pages/admin/dashboard/dashboard.ts

interface OrderItem {
  id: string;
  customerName: string;
  room: string;
  submitTime: string;
  status: string;
  statusText: string;
  dishes: Array<{
    type: string;
    names: string;
  }>;
  specialRequirements?: string;
}

interface CustomerItem {
  id: string;
  name: string;
  phone: string;
  room: string;
  store: string;
  checkInDate: string;
  totalDays: string;
}

Page({
  data: {
    activeTab: 'orders',
    selectedDate: '2024-01-05',
    exportStartDate: '2024-01-01',
    exportEndDate: '2024-01-05',
    exportStore: 'all',
    exportingExcel: false,
    exportingPDF: false,
    
    stats: {
      todayOrders: 28,
      pendingOrders: 5,
      totalCustomers: 156,
      confirmedOrders: 23
    },
    
    orderList: [] as OrderItem[],
    customerList: [] as CustomerItem[],
    
    storeOptions: [
      { label: '全部门店', value: 'all' },
      { label: '朝阳店', value: 'store1' },
      { label: '海淀店', value: 'store2' },
      { label: '西城店', value: 'store3' },
      { label: '丰台店', value: 'store4' }
    ],
    
    exportPreview: {
      orderCount: 28,
      customerCount: 12,
      fileSize: '2.3MB'
    }
  },

  onLoad() {
    this.checkAdminAuth();
    this.loadOrderList();
    this.loadCustomerList();
    this.updateExportPreview();
  },

  onShow() {
    this.refreshStats();
  },

  onPullDownRefresh() {
    this.refreshAllData();
  },

  // 检查管理员权限
  checkAdminAuth() {
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo || userInfo.userType !== 'admin') {
      wx.reLaunch({
        url: '/pages/login/login'
      });
      return;
    }
  },

  // 刷新所有数据
  refreshAllData() {
    this.refreshStats();
    this.loadOrderList();
    this.loadCustomerList();
    this.updateExportPreview();
    wx.stopPullDownRefresh();
  },

  // 刷新统计数据
  refreshStats() {
    // 模拟API调用
    setTimeout(() => {
      this.setData({
        stats: {
          todayOrders: Math.floor(Math.random() * 10) + 25,
          pendingOrders: Math.floor(Math.random() * 8) + 3,
          totalCustomers: Math.floor(Math.random() * 20) + 150,
          confirmedOrders: Math.floor(Math.random() * 15) + 20
        }
      });
    }, 500);
  },

  // 标签页切换
  onTabChange(e: any) {
    this.setData({ activeTab: e.detail.value });
    
    if (e.detail.value === 'customers' && this.data.customerList.length === 0) {
      this.loadCustomerList();
    }
  },

  // 日期选择
  onDateChange(e: any) {
    this.setData({ selectedDate: e.detail.value });
    this.loadOrderList();
  },

  // 加载订单列表
  loadOrderList() {
    const { selectedDate } = this.data;
    
    // 模拟API调用
    setTimeout(() => {
      const mockOrders: OrderItem[] = [
        {
          id: 'order_001',
          customerName: '张女士',
          room: 'A201',
          submitTime: '09:30',
          status: 'submitted',
          statusText: '待确认',
          dishes: [
            { type: '早餐', names: '小米粥 + 蒸蛋' },
            { type: '午餐', names: '红烧鸡腿 + 蒸蛋羹 + 冬瓜汤' },
            { type: '晚餐', names: '清蒸鲈鱼 + 紫菜蛋花汤' }
          ],
          specialRequirements: '少盐，不吃蒜',
          date: ""
        },
        {
          id: 'order_002',
          customerName: '李女士',
          room: 'B105',
          submitTime: '08:45',
          status: 'confirmed',
          statusText: '已确认',
          dishes: [
            { type: '早餐', names: '燕麦粥 + 煮鸡蛋' },
            { type: '午餐', names: '清蒸鲈鱼 + 排骨汤' }
          ],
          date: ""
        },
        {
          id: 'order_003',
          customerName: '王女士',
          room: 'C302',
          submitTime: '10:15',
          status: 'submitted',
          statusText: '待确认',
          dishes: [
            { type: '早餐', names: '小米粥 + 蒸蛋' },
            { type: '午餐', names: '瘦肉粥 + 冬瓜汤' },
            { type: '晚餐', names: '时令蔬菜 + 丝瓜汤' },
            { type: '高补餐', names: '猪蹄汤' }
          ],
          date: ""
        }
      ];
      
      this.setData({ orderList: mockOrders });
    }, 1000);
  },

  // 加载客户列表
  loadCustomerList() {
    // 模拟API调用
    setTimeout(() => {
      const mockCustomers: CustomerItem[] = [
        {
          id: 'customer_001',
          name: '张女士',
          phone: '138****5678',
          room: 'A201',
          store: '朝阳店',
          checkInDate: '2024-01-01',
          totalDays: '28天'
        },
        {
          id: 'customer_002',
          name: '李女士',
          phone: '139****1234',
          room: 'B105',
          store: '海淀店',
          checkInDate: '2024-01-03',
          totalDays: '21天'
        },
        {
          id: 'customer_003',
          name: '王女士',
          phone: '137****9876',
          room: 'C302',
          store: '西城店',
          checkInDate: '2024-01-02',
          totalDays: '14天'
        }
      ];
      
      this.setData({ customerList: mockCustomers });
    }, 1000);
  },

  // 确认订单
  confirmOrder(e: any) {
    const orderId = e.currentTarget.dataset.id;
    
    wx.showModal({
      title: '确认订单',
      content: '确定要确认这个订单吗？',
      confirmText: '确认',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.performConfirmOrder(orderId);
        }
      }
    });
  },

  // 执行确认订单
  performConfirmOrder(orderId: string) {
    // 模拟API调用
    setTimeout(() => {
      const orderList = this.data.orderList.map(order => {
        if (order.id === orderId) {
          return {
            ...order,
            status: 'confirmed',
            statusText: '已确认'
          };
        }
        return order;
      });
      
      this.setData({ orderList });
      
      wx.showToast({
        title: '订单确认成功',
        icon: 'success',
        duration: 2000
      });
      
      // 更新统计数据
      this.refreshStats();
    }, 1000);
  },

  // 编辑订单
  editOrder(e: any) {
    const orderId = e.currentTarget.dataset.id;
    
    wx.showToast({
      title: '订单编辑功能开发中',
      icon: 'none',
      duration: 2000
    });
  },

  // 添加客户
  addCustomer() {
    wx.navigateTo({
      url: '/pages/admin/customer-manage/customer-manage?action=add'
    });
  },

  // 编辑客户
  editCustomer(e: any) {
    const customerId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/admin/customer-manage/customer-manage?action=edit&id=${customerId}`
    });
  },

  // 导出开始日期变化
  onExportStartDateChange(e: any) {
    this.setData({ exportStartDate: e.detail.value });
    this.updateExportPreview();
  },

  // 导出结束日期变化
  onExportEndDateChange(e: any) {
    this.setData({ exportEndDate: e.detail.value });
    this.updateExportPreview();
  },

  // 导出门店变化
  onExportStoreChange(e: any) {
    this.setData({ exportStore: e.detail.value });
    this.updateExportPreview();
  },

  // 获取门店文本
  getStoreText(value: string): string {
    const option = this.data.storeOptions.find(opt => opt.value === value);
    return option?.label || '全部门店';
  },

  // 更新导出预览
  updateExportPreview() {
    // 模拟计算导出数据
    const { exportStartDate, exportEndDate, exportStore } = this.data;
    
    // 根据日期范围和门店计算数据量
    const daysDiff = this.calculateDaysDiff(exportStartDate, exportEndDate);
    const baseOrders = daysDiff * 5; // 假设每天5个订单
    const storeMultiplier = exportStore === 'all' ? 1 : 0.3;
    
    const orderCount = Math.floor(baseOrders * storeMultiplier);
    const customerCount = Math.floor(orderCount * 0.4);
    const fileSize = `${(orderCount * 0.08).toFixed(1)}MB`;
    
    this.setData({
      exportPreview: {
        orderCount,
        customerCount,
        fileSize
      }
    });
  },

  // 计算日期差
  calculateDaysDiff(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  },

  // 导出Excel
  exportExcel() {
    this.setData({ exportingExcel: true });
    
    // 模拟导出过程
    setTimeout(() => {
      this.setData({ exportingExcel: false });
      
      wx.showToast({
        title: 'Excel导出成功',
        icon: 'success',
        duration: 2000
      });
      
      // 实际应用中这里会调用下载文件的API
    }, 2000);
  },

  // 导出PDF
  exportPDF() {
    this.setData({ exportingPDF: true });
    
    // 模拟导出过程
    setTimeout(() => {
      this.setData({ exportingPDF: false });
      
      wx.showToast({
        title: 'PDF导出成功',
        icon: 'success',
        duration: 2000
      });
      
      // 实际应用中这里会调用下载文件的API
    }, 2000);
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
