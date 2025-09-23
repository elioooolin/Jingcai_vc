// pages/admin/dashboard/dashboard.ts

interface AdminOrderItem {
  id: string;
  customerName: string;
  customerPhone?: string;
  room: string;
  store: string;
  submitTime: string;
  status: string;
  statusText: string;
  orderSummary: string; // 订单摘要，替代dishes数组
  orderDetails: any; // 原始订单详情结构
  specialRequirements?: string;
  date: string;
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
    selectedDate: '', // 将在onLoad中设置为今天
    calendarValue: '', // calendar组件的选中值
    calendarVisible: false, // 控制calendar显示/隐藏
    selectedOrderStore: 'all', // 订单管理页面选中的门店
    selectedCustomerStore: 'all', // 客户管理页面选中的门店
    
    // 添加测试客户对话框相关数据
    addTestCustomerVisible: false,
    testCustomerName: '',
    testCustomerPhone: '',
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
    
    orderList: [] as AdminOrderItem[],
    customerList: [] as CustomerItem[],
    
    storeOptions: [
      { label: '全部门店', value: 'all' },
      { label: '梅溪湖店', value: '爱睦·梅溪湖店' },
      { label: '德思勤店', value: '爱睦轻予·德思勤店' }
    ],
    
    exportPreview: {
      orderCount: 28,
      customerCount: 12,
      fileSize: '2.3MB'
    },

    // 管理员信息
    adminInfo: {
      name: '管理员',
      loginTime: '',
      role: '系统管理员',
      permissions: '超级管理员'
    },
  },

  onLoad() {
    this.checkAdminAuth();
    this.restorePageState(); // 恢复页面状态
    this.initTodayDate(); // 设置默认日期为今天（如果没有保存的状态）
    this.initAdminInfo(); // 初始化管理员信息
    this.initCalendar(); // 初始化日历
    this.refreshStats(); // 加载时获取真实统计数据
    this.loadOrderList();
    this.loadCustomerList();
    this.updateExportPreview();
  },

  onShow() {
    console.log('管理员dashboard页面显示');
    console.log('当前页面状态 - 门店:', this.data.selectedOrderStore, '日期:', this.data.selectedDate);
    
    // 检查是否有保存的查询条件需要恢复
    this.restoreQueryConditions();
    
    // 使用setTimeout确保页面状态完全恢复后再检查缓存
    setTimeout(() => {
      console.log('延迟检查 - 门店:', this.data.selectedOrderStore, '日期:', this.data.selectedDate);
      this.checkAndRefreshOrderList();
    }, 100);
    
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
  async refreshStats() {
    console.log('🔄 开始刷新管理员统计数据...');
    
    try {
      // 调用云函数获取真实统计数据
      const result = await wx.cloud.callFunction({
        name: 'getAdminStats',
        data: {}
      });
      
      console.log('📊 管理员统计数据云函数调用结果:', result.result);
      
      if (result.result && typeof result.result === 'object' && 'success' in result.result && result.result.success) {
        const stats = (result.result as any).stats;
        
        this.setData({
          stats: {
            totalCustomers: stats.totalCustomers,
            pendingOrders: stats.pendingOrders,
            todayOrders: 0, // 暂时保留，后续可以添加今日订单统计
            confirmedOrders: 0 // 暂时保留，后续可以添加已确认订单统计
          }
        });
        
        console.log('✅ 统计数据更新成功:', this.data.stats);
        
      } else {
        console.error('❌ 获取统计数据失败:', (result.result as any)?.message);
        
        // 失败时显示错误提示
        wx.showToast({
          title: '统计数据加载失败',
          icon: 'error',
          duration: 2000
        });
      }
      
    } catch (error) {
      console.error('❌ 调用统计数据云函数失败:', error);
      
      wx.showToast({
        title: '网络错误',
        icon: 'error',
        duration: 2000
      });
    }
  },

  // 标签页切换
  onTabChange(e: any) {
    this.setData({ activeTab: e.detail.value });
    
    if (e.detail.value === 'customers' && this.data.customerList.length === 0) {
      this.loadCustomerList();
    }
  },

  // 打开日历
  handleCalendar() {
    this.setData({ 
      calendarVisible: true 
    });
  },

  // 日历确认选择
  handleCalendarConfirm(e: any) {
    const selectedValue = this.formatDisplayDate(e.detail.value);
    console.log('📅 日历确认选择:', selectedValue);
    
    if (selectedValue) {
      // 清除旧的订单缓存
      this.clearOrderCache();
      
      this.setData({ 
        selectedDate: selectedValue,
        calendarValue: selectedValue,
        calendarVisible: false
      });
      
      // 保存页面状态
      this.savePageState();
      
      // 重新加载订单列表
      this.loadOrderList();
    }
  },

  // 日历关闭
  onCalendarClose() {
    this.setData({ 
      calendarVisible: false 
    });
  },

  // 保存页面状态
  savePageState() {
    try {
      const pageState = {
        selectedOrderStore: this.data.selectedOrderStore,
        selectedDate: this.data.selectedDate,
        selectedCustomerStore: this.data.selectedCustomerStore,
        activeTab: this.data.activeTab,
        timestamp: Date.now()
      };
      wx.setStorageSync('admin_dashboard_state', pageState);
      console.log('💾 页面状态已保存:', pageState);
    } catch (error) {
      console.error('保存页面状态失败:', error);
    }
  },

  // 恢复页面状态
  restorePageState() {
    try {
      const pageState = wx.getStorageSync('admin_dashboard_state');
      if (pageState && pageState.timestamp) {
        // 检查状态是否过期（24小时）
        const now = Date.now();
        const stateAge = now - pageState.timestamp;
        const maxAge = 24 * 60 * 60 * 1000; // 24小时
        
        if (stateAge < maxAge) {
          console.log('📱 恢复页面状态:', pageState);
          this.setData({
            selectedOrderStore: pageState.selectedOrderStore || 'all',
            selectedDate: pageState.selectedDate || '',
            selectedCustomerStore: pageState.selectedCustomerStore || 'all',
            activeTab: pageState.activeTab || 'orders'
          });
          return true; // 表示成功恢复了状态
        } else {
          console.log('⏰ 页面状态已过期，使用默认值');
          wx.removeStorageSync('admin_dashboard_state');
        }
      }
    } catch (error) {
      console.error('恢复页面状态失败:', error);
    }
    return false; // 表示没有恢复状态
  },

  // 恢复查询条件（从订单编辑页面返回时使用）
  restoreQueryConditions() {
    try {
      const queryConditions = wx.getStorageSync('admin_query_conditions');
      if (queryConditions && queryConditions.timestamp) {
        // 检查条件是否过期（1小时）
        const now = Date.now();
        const conditionAge = now - queryConditions.timestamp;
        const maxAge = 60 * 60 * 1000; // 1小时
        
        if (conditionAge < maxAge) {
          console.log('🔄 恢复查询条件:', queryConditions);
          
          // 检查当前状态是否与保存的条件不同
          const needUpdate = this.data.selectedOrderStore !== queryConditions.selectedOrderStore || 
                           this.data.selectedDate !== queryConditions.selectedDate;
          
          if (needUpdate) {
            console.log('📝 更新页面状态以匹配查询条件');
            this.setData({
              selectedOrderStore: queryConditions.selectedOrderStore,
              selectedDate: queryConditions.selectedDate,
              calendarValue: queryConditions.selectedDate
            });
            
            // 保存更新后的页面状态
            this.savePageState();
          }
          
          // 清除查询条件缓存（一次性使用）
          wx.removeStorageSync('admin_query_conditions');
          console.log('🗑️ 已清除查询条件缓存');
          
          return true;
        } else {
          console.log('⏰ 查询条件已过期');
          wx.removeStorageSync('admin_query_conditions');
        }
      }
    } catch (error) {
      console.error('恢复查询条件失败:', error);
    }
    return false;
  },

  // 初始化今天日期
  initTodayDate() {
    // 只有在没有恢复到保存的日期时才设置为今天
    if (!this.data.selectedDate) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;
      
      this.setData({
        selectedDate: todayStr
      });
    }
  },

  // 初始化日历
  initCalendar() {
    // 设置默认选中日期为当前selectedDate
    const defaultDate = this.data.selectedDate;
    this.setData({
      calendarValue: defaultDate
    });
  },

  // 格式化显示日期
  formatDisplayDate(dateStr: string): string {
    console.log('formatDisplayDate:', dateStr);
    if (!dateStr) return '';
    
    try {
      const date = new Date(dateStr);
      console.log('date:', date);
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      
      return `${year}-${month}-${day}`;
    } catch (error) {
      return dateStr;
    }
  },

  // 订单管理页面门店筛选
  onOrderStoreChange(e: any) {
    console.log('🏪 订单门店筛选变更:', e.detail);
    
    // 清除旧的订单缓存
    this.clearOrderCache();
    
    this.setData({ selectedOrderStore: e.detail.value });
    
    // 保存页面状态
    this.savePageState();
    
    this.loadOrderList();
  },

  // 客户管理页面门店筛选
  onCustomerStoreChange(e: any) {
    console.log('客户门店筛选变更:', e.detail);
    this.setData({ selectedCustomerStore: e.detail.value });
    
    // 保存页面状态
    this.savePageState();
    
    this.loadCustomerList();
  },

  // 获取门店显示文本
  getStoreText(storeValue: string): string {
    const store = this.data.storeOptions.find(item => item.value === storeValue);
    return store ? store.label : '全部门店';
  },

  // 生成本地存储的key
  getOrderCacheKey(): string {
    return `admin_orders_${this.data.selectedOrderStore}_${this.data.selectedDate}`;
  },

  // 清除本地订单缓存
  clearOrderCache() {
    try {
      // 获取所有存储的key
      const storageInfo = wx.getStorageInfoSync();
      const keys = storageInfo.keys;
      
      // 删除所有以admin_orders_开头的缓存
      keys.forEach(key => {
        if (key.startsWith('admin_orders_')) {
          wx.removeStorageSync(key);
          console.log('🗑️ 清除订单缓存:', key);
        }
      });
    } catch (error) {
      console.error('清除订单缓存失败:', error);
    }
  },

  // 保存订单到本地存储
  saveOrdersToLocal(orders: AdminOrderItem[]) {
    try {
      const cacheKey = this.getOrderCacheKey();
      const cacheData = {
        orders: orders,
        timestamp: Date.now(),
        store: this.data.selectedOrderStore,
        date: this.data.selectedDate
      };
      
      wx.setStorageSync(cacheKey, cacheData);
      console.log('💾 订单信息已保存到本地:', cacheKey, '共', orders.length, '条订单');
    } catch (error) {
      console.error('保存订单到本地失败:', error);
    }
  },

  // 从本地存储获取订单
  getOrdersFromLocal(): AdminOrderItem[] | null {
    try {
      const cacheKey = this.getOrderCacheKey();
      const cacheData = wx.getStorageSync(cacheKey);
      
      if (cacheData && cacheData.orders) {
        console.log('📱 从本地获取订单信息:', cacheKey, '共', cacheData.orders.length, '条订单');
        return cacheData.orders;
      }
      
      return null;
    } catch (error) {
      console.error('从本地获取订单失败:', error);
      return null;
    }
  },

  // 检查缓存并刷新订单列表
  checkAndRefreshOrderList() {
    try {
      const cacheKey = this.getOrderCacheKey();
      console.log('🔍 检查订单缓存，key:', cacheKey);
      const cacheData = wx.getStorageSync(cacheKey);
      
      if (cacheData && cacheData.orders) {
        console.log('📋 找到缓存数据，订单数量:', cacheData.orders.length);
        
        // 检查当前显示的订单列表是否与缓存一致
        const currentOrders = this.data.orderList;
        const cachedOrders = cacheData.orders;
        
        console.log('📊 当前显示订单数量:', currentOrders.length);
        console.log('📊 缓存中订单数量:', cachedOrders.length);
        
        // 如果订单数量不同，或者有订单内容发生变化，则刷新显示
        if (currentOrders.length !== cachedOrders.length || this.hasOrderChanges(currentOrders, cachedOrders)) {
          console.log('🔄 检测到订单缓存更新，刷新显示');
          this.setData({ orderList: cachedOrders });
          console.log('✅ 订单列表已更新');
        } else {
          console.log('📱 订单列表无变化，无需刷新');
        }
      } else {
        // 如果没有缓存，重新加载
        console.log('📡 无本地缓存，重新加载订单列表');
        this.loadOrderList();
      }
    } catch (error) {
      console.error('❌ 检查订单缓存失败:', error);
      // 出错时重新加载
      this.loadOrderList();
    }
  },

  // 检查订单是否有变化
  hasOrderChanges(currentOrders: AdminOrderItem[], cachedOrders: AdminOrderItem[]): boolean {
    if (currentOrders.length !== cachedOrders.length) {
      return true;
    }
    
    // 创建缓存订单的映射，便于查找
    const cachedOrdersMap = new Map();
    cachedOrders.forEach(order => {
      cachedOrdersMap.set(order.id, order);
    });
    
    // 检查每个当前订单是否在缓存中存在且内容是否有变化
    for (const current of currentOrders) {
      const cached = cachedOrdersMap.get(current.id);
      
      if (!cached) {
        // 如果缓存中没有这个订单，说明有变化
        console.log('📝 检测到新订单:', current.id);
        return true;
      }
      
      // 比较订单摘要是否有变化
      if (current.orderSummary !== cached.orderSummary) {
        console.log('📝 检测到订单内容变化:', current.id);
        console.log('  当前摘要:', current.orderSummary);
        console.log('  缓存摘要:', cached.orderSummary);
        return true;
      }
    }
    
    return false;
  },

  // 加载订单列表
  async loadOrderList() {
    console.log('🔄 开始加载订单列表...');
    console.log('查询条件 - 门店:', this.data.selectedOrderStore, '日期:', this.data.selectedDate);
    
    try {
      // 先尝试从本地获取订单信息
      const cachedOrders = this.getOrdersFromLocal();
      if (cachedOrders) {
        this.setData({ orderList: cachedOrders });
        console.log('✅ 从本地缓存加载订单列表完成，共', cachedOrders.length, '条订单');
        return;
      }

      // 本地没有缓存，调用云函数获取订单数据
      console.log('📡 本地无缓存，调用云函数获取订单数据...');
      const result = await wx.cloud.callFunction({
        name: 'getAdminOrders',
        data: {
          store: this.data.selectedOrderStore,
          date: this.data.selectedDate
        }
      });
      
      console.log('订单数据云函数调用结果:', result.result);
      
      if (result.result && typeof result.result === 'object' && 'success' in result.result && result.result.success) {
        const orders = (result.result as any).orders || [];
        
        // 转换为AdminOrderItem格式
        const formattedOrders: AdminOrderItem[] = orders.map((order: any) => ({
          id: order.orderId,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          room: order.room,
          store: order.store,
          submitTime: order.submitTime,
          status: order.status,
          statusText: order.statusText,
          orderSummary: order.orderSummary,
          orderDetails: order.orderDetails, // 添加orderDetails字段
          specialRequirements: order.specialRequirements,
          date: order.orderDateString
        }));
        
        // 保存到本地存储
        this.saveOrdersToLocal(formattedOrders);
        
        this.setData({ 
          orderList: formattedOrders 
        });
        
        console.log(`✅ 订单列表加载成功，共 ${formattedOrders.length} 条记录`);
        
      } else {
        console.error('获取订单数据失败:', result.result);
        
        // 显示错误信息
        wx.showToast({
          title: '加载订单失败',
          icon: 'error',
          duration: 2000
        });
        
        // 设置空列表
        this.setData({ orderList: [] });
      }
      
    } catch (error) {
      console.error('加载订单列表出错:', error);
      
      wx.showToast({
        title: '网络错误',
        icon: 'error',
        duration: 2000
      });
      
      // 设置空列表
      this.setData({ orderList: [] });
    }
  },

  // 加载客户列表
  async loadCustomerList() {
    console.log('🔄 开始加载客户列表...');
    console.log('查询条件 - 门店:', this.data.selectedCustomerStore);
    
    try {
      // 调用云函数获取真实客户数据
      const result = await wx.cloud.callFunction({
        name: 'getAdminCustomers',
        data: {
          store: this.data.selectedCustomerStore
        }
      });
      
      console.log('客户数据云函数调用结果:', result.result);
      
      if (result.result && typeof result.result === 'object' && 'success' in result.result && result.result.success) {
        const customers = (result.result as any).customers || [];
        
        // 转换为CustomerItem格式
        const formattedCustomers: CustomerItem[] = customers.map((customer: any) => ({
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          room: customer.room,
          store: customer.store,
          checkInDate: customer.checkInDate,
          totalDays: customer.totalDays
        }));
        
        this.setData({ 
          customerList: formattedCustomers 
        });
        
        console.log(`✅ 客户列表加载成功，共 ${formattedCustomers.length} 条记录`);
        
      } else {
        console.error('获取客户数据失败:', result.result);
        
        // 显示错误信息
        wx.showToast({
          title: '加载客户失败',
          icon: 'error',
          duration: 2000
        });
        
        this.setData({ 
          customerList: [] 
        });
      }
      
    } catch (error) {
      console.error('加载客户列表出错:', error);
      
      wx.showToast({
        title: '网络错误，请重试',
        icon: 'error',
        duration: 2000
      });
      
      this.setData({ 
        customerList: [] 
      });
    }
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
  async performConfirmOrder(orderId: string) {
    console.log('🔄 开始确认订单:', orderId);
    
    try {
      // 显示加载提示
      wx.showLoading({
        title: '确认订单中...',
        mask: true
      });
      
      // 调用云函数更新订单状态
      const result = await wx.cloud.callFunction({
        name: 'updateOrderStatus',
        data: {
          orderId: orderId,
          newStatus: 'confirmed'
        }
      });
      
      console.log('订单状态更新云函数调用结果:', result.result);
      
      if (result.result && typeof result.result === 'object' && 'success' in result.result && result.result.success) {
        // 更新本地订单列表
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
        
        wx.hideLoading();
        wx.showToast({
          title: '订单确认成功',
          icon: 'success',
          duration: 1000
        });
        
        console.log('✅ 订单确认成功:', orderId);
        
        // 更新统计数据
        this.refreshStats();
        
      } else {
        console.error('订单状态更新失败:', result.result);
        
        wx.hideLoading();
        wx.showToast({
          title: (result.result as any)?.message || '确认订单失败',
          icon: 'error',
          duration: 2000
        });
      }
      
    } catch (error) {
      console.error('确认订单出错:', error);
      
      wx.hideLoading();
      wx.showToast({
        title: '网络错误，请重试',
        icon: 'error',
        duration: 2000
      });
    }
  },

  // 编辑订单
  editOrder(e: any) {
    const orderId = e.currentTarget.dataset.id;
    console.log('🔄 跳转到订单编辑页面:', orderId);
    
    if (!orderId) {
      wx.showToast({
        title: '订单ID缺失',
        icon: 'error',
        duration: 2000
      });
      return;
    }
    
    // 跳转到订单编辑页面
    wx.navigateTo({
      url: `/pages/admin/order-edit/order-edit?orderId=${orderId}`
    });
  },


  // 添加客户
  addCustomer() {
    wx.navigateTo({
      url: '/pages/admin/customer-manage/customer-manage?action=add'
    });
  },

  // 添加测试客户
  addTestCustomer() {
    this.setData({
      addTestCustomerVisible: true,
      testCustomerName: '',
      testCustomerPhone: ''
    });
  },

  // 关闭添加测试客户对话框
  closeAddTestCustomerDialog() {
    this.setData({
      addTestCustomerVisible: false,
      testCustomerName: '',
      testCustomerPhone: ''
    });
  },

  // 测试客户姓名输入变化
  onTestCustomerNameChange(e: any) {
    this.setData({
      testCustomerName: e.detail.value
    });
  },

  // 测试客户手机号输入变化
  onTestCustomerPhoneChange(e: any) {
    this.setData({
      testCustomerPhone: e.detail.value
    });
  },

  // 确认添加测试客户
  async confirmAddTestCustomer() {
    const { testCustomerName, testCustomerPhone } = this.data;
    
    // 验证输入
    if (!testCustomerName.trim()) {
      wx.showToast({
        title: '请输入客户姓名',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    if (!testCustomerPhone.trim()) {
      wx.showToast({
        title: '请输入手机号',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(testCustomerPhone.trim())) {
      wx.showToast({
        title: '手机号格式不正确',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    // 关闭对话框并显示加载
    this.closeAddTestCustomerDialog();
    wx.showLoading({
      title: '创建中...',
      mask: true
    });

    try {
      console.log('开始创建测试客户:', testCustomerName, testCustomerPhone);
      
      const result = await wx.cloud.callFunction({
        name: 'createTestCustomer',
        data: {
          name: testCustomerName.trim(),
          phone: testCustomerPhone.trim()
        }
      });

      console.log('创建测试客户结果:', result);

      if (result.result && (result.result as any).success) {
        wx.showToast({
          title: '创建成功',
          icon: 'success',
          duration: 2000
        });
        
        // 重新加载客户列表
        this.loadCustomerList();
        
        // 刷新统计数据
        this.refreshStats();
      } else {
        throw new Error((result.result as any)?.message || '创建失败');
      }
    } catch (error) {
      console.error('创建测试客户失败:', error);
      wx.showToast({
        title: '创建失败，请重试',
        icon: 'error',
        duration: 2000
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 编辑客户
  editCustomer(e: any) {
    const customerId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/admin/customer-manage/customer-manage?action=edit&id=${customerId}`
    });
  },

  // 删除客户
  deleteCustomer(e: any) {
    const customerId = e.currentTarget.dataset.id;
    const customerName = e.currentTarget.dataset.name;
    
    wx.showModal({
      title: '确认删除',
      content: `删除该客户会删除其账号及其所有关联订单，确认删除客户"${customerName}"吗？`,
      confirmText: '确认删除',
      confirmColor: '#ff4757',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.performDeleteCustomer(customerId, customerName);
        }
      }
    });
  },

  // 执行删除客户操作
  async performDeleteCustomer(customerId: string, customerName: string) {
    wx.showLoading({
      title: '删除中...',
      mask: true
    });

    try {
      console.log('开始删除客户:', customerId, customerName);
      
      const result = await wx.cloud.callFunction({
        name: 'deleteCustomer',
        data: {
          customerId: customerId
        }
      });

      console.log('删除客户结果:', result);

      if (result.result && (result.result as any).success) {
        wx.showToast({
          title: '删除成功',
          icon: 'success',
          duration: 2000
        });
        
        // 重新加载客户列表
        this.loadCustomerList();
        
        // 刷新统计数据
        this.refreshStats();
      } else {
        throw new Error((result.result as any)?.message || '删除失败');
      }
    } catch (error) {
      console.error('删除客户失败:', error);
      wx.showToast({
        title: '删除失败，请重试',
        icon: 'error',
        duration: 2000
      });
    } finally {
      wx.hideLoading();
    }
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

  // 初始化管理员信息
  initAdminInfo() {
    const userInfo = wx.getStorageSync('userInfo');
    const now = new Date();
    const loginTime = `${now.getMonth() + 1}月${now.getDate()}日 ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    this.setData({
      adminInfo: {
        name: userInfo?.name || '管理员',
        loginTime: loginTime,
        role: '系统管理员',
        permissions: '超级管理员'
      }
    });

    // 加载系统统计数据
    this.loadSystemStats();
  },

  // 加载系统统计数据
  async loadSystemStats() {
    try {
      // 调用统计数据云函数
      const result = await wx.cloud.callFunction({
        name: 'getAdminStats',
        data: {}
      });

      if (result.result && typeof result.result === 'object' && 'success' in result.result && result.result.success) {
        const stats = (result.result as any).stats;
        
        this.setData({
          systemStats: {
            totalOrders: stats.totalOrders || 0,
            totalCustomers: stats.totalCustomers || 0,
            todayOrders: stats.todayOrders || 0,
            activeCustomers: stats.totalCustomers || 0
          }
        });
      }
    } catch (error) {
      console.error('加载系统统计数据失败:', error);
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
          wx.reLaunch({
            url: '/pages/login/login'
          });
        }
      }
    });
  }
});
