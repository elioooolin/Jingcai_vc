// pages/admin/order-edit/order-edit.ts

interface OrderInfo {
  id: string;
  customerName: string;
  room: string;
  store: string;
  orderDate: string;
  status: string;
  statusText: string;
}

interface OrderDetails {
  breakfast?: string;
  lunch?: string[];
  dinner?: string[];
  special_requirements?: string;
  supplement?: string;
}

interface EditOrderDetails {
  breakfast: string;
  lunch: string[];
  dinner: string[];
  special_requirements: string;
}

Page({
  data: {
    loading: true,
    saving: false,
    orderId: '',
    orderInfo: {} as OrderInfo,
    orderDetails: {} as OrderDetails,
    editOrderDetails: {
      breakfast: '',
      lunch: [] as string[],
      dinner: [] as string[],
      special_requirements: ''
    } as EditOrderDetails,
    
    storeOptions: [
      { label: '全部门店', value: 'all' },
    ],
    
    // 用于textarea的样式
    style: ''
  },

  onLoad(options: any) {
    console.log('订单编辑页面加载，参数:', options);
    
    if (options.orderId) {
      this.setData({
        orderId: options.orderId
      });
      this.loadOrderInfo();
    } else {
      wx.showToast({
        title: '订单ID缺失',
        icon: 'error',
        duration: 2000
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 2000);
    }
  },

  // 从本地存储获取订单信息
  getOrderFromLocal(): any | null {
    try {
      // 获取所有存储的key
      const storageInfo = wx.getStorageInfoSync();
      const keys = storageInfo.keys;
      
      // 查找所有以admin_orders_开头的缓存
      for (const key of keys) {
        if (key.startsWith('admin_orders_')) {
          const cacheData = wx.getStorageSync(key);
          if (cacheData && cacheData.orders) {
            // 在缓存的订单中查找目标订单
            const targetOrder = cacheData.orders.find((order: any) => order.id === this.data.orderId);
            if (targetOrder) {
              console.log('📱 从本地缓存找到订单:', key, targetOrder);
              return targetOrder;
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('从本地获取订单失败:', error);
      return null;
    }
  },

  // 加载订单信息
  async loadOrderInfo() {
    console.log('🔄 加载订单信息:', this.data.orderId);
    
    try {
      this.setData({ loading: true });

      // 先尝试从本地缓存获取订单信息
      const cachedOrder = this.getOrderFromLocal();
      if (cachedOrder) {
        console.log('✅ 从本地缓存加载订单信息');
        
        // 设置订单基本信息
        const orderInfo: OrderInfo = {
          id: cachedOrder.id,
          customerName: cachedOrder.customerName,
          room: cachedOrder.room,
          store: cachedOrder.store,
          orderDate: cachedOrder.date,
          status: cachedOrder.status,
          statusText: cachedOrder.statusText
        };

        // 设置订单详情
        const orderDetails: OrderDetails = cachedOrder.orderDetails || {};

        // 初始化编辑表单数据
        const editOrderDetails: EditOrderDetails = {
          breakfast: orderDetails.breakfast || '',
          lunch: Array.isArray(orderDetails.lunch) ? orderDetails.lunch : [],
          dinner: Array.isArray(orderDetails.dinner) ? orderDetails.dinner : [],
          special_requirements: orderDetails.special_requirements || ''
        };

        this.setData({
          orderInfo,
          orderDetails,
          editOrderDetails,
          loading: false
        });

        console.log('订单信息从缓存加载完成');
        return;
      }

      // 本地没有缓存，调用云函数获取订单详情
      console.log('📡 本地无缓存，调用云函数获取订单数据...');
      const result = await wx.cloud.callFunction({
        name: 'getAdminOrders',
        data: {
          store: 'all', // 获取所有门店的订单
          date: '', // 不限制日期
          sessionToken: wx.getStorageSync('sessionToken')
        }
      });

      console.log('获取订单列表结果:', result.result);

      if (result.result && typeof result.result === 'object' && 'success' in result.result && result.result.success) {
        const orders = (result.result as any).orders || [];
        const targetOrder = orders.find((order: any) => order.orderId === this.data.orderId);

        if (targetOrder) {
          console.log('找到目标订单:', targetOrder);
          
          // 设置订单基本信息
          const orderInfo: OrderInfo = {
            id: targetOrder.orderId,
            customerName: targetOrder.customerName,
            room: targetOrder.room,
            store: targetOrder.store,
            orderDate: targetOrder.orderDateString || targetOrder.orderDate,
            status: targetOrder.status,
            statusText: targetOrder.statusText
          };

          // 设置订单详情
          const orderDetails: OrderDetails = targetOrder.orderDetails || {};

          // 初始化编辑表单数据
          const editOrderDetails: EditOrderDetails = {
            breakfast: orderDetails.breakfast || '',
            lunch: Array.isArray(orderDetails.lunch) ? orderDetails.lunch : [],
            dinner: Array.isArray(orderDetails.dinner) ? orderDetails.dinner : [],
            special_requirements: orderDetails.special_requirements || ''
          };

          this.setData({
            orderInfo,
            orderDetails,
            editOrderDetails,
            loading: false
          });

          console.log('订单信息加载完成');
        } else {
          console.error('未找到指定订单');
          wx.showToast({
            title: '订单不存在',
            icon: 'error',
            duration: 2000
          });
          setTimeout(() => {
            wx.navigateBack();
          }, 2000);
        }
      } else {
        console.error('获取订单信息失败:', result.result);
        wx.showToast({
          title: '获取订单信息失败',
          icon: 'error',
          duration: 2000
        });
        this.setData({ loading: false });
      }

    } catch (error) {
      console.error('加载订单信息出错:', error);
      wx.showToast({
        title: '网络错误，请重试',
        icon: 'error',
        duration: 2000
      });
      this.setData({ loading: false });
    }
  },

  // 处理编辑表单输入
  onEditBreakfastChange(e: any) {
    this.setData({
      'editOrderDetails.breakfast': e.detail.value
    });
  },

  onEditLunchChange(e: any) {
    const index = e.currentTarget.dataset.index;
    const value = e.detail.value;
    const lunch = [...this.data.editOrderDetails.lunch];
    lunch[index] = value;
    this.setData({
      'editOrderDetails.lunch': lunch
    });
  },

  onEditDinnerChange(e: any) {
    const index = e.currentTarget.dataset.index;
    const value = e.detail.value;
    const dinner = [...this.data.editOrderDetails.dinner];
    dinner[index] = value;
    this.setData({
      'editOrderDetails.dinner': dinner
    });
  },

  onEditSpecialRequirementsChange(e: any) {
    this.setData({
      'editOrderDetails.special_requirements': e.detail.value
    });
  },

  // 更新本地缓存中的订单信息
  updateLocalOrderCache() {
    try {
      console.log('🔄 开始更新本地缓存，订单ID:', this.data.orderId);
      
      // 获取所有存储的key
      const storageInfo = wx.getStorageInfoSync();
      const keys = storageInfo.keys;
      
      let foundAndUpdated = false;
      let cacheKeyUsed = '';
      
      // 查找所有以admin_orders_开头的缓存
      for (const key of keys) {
        if (key.startsWith('admin_orders_')) {
          console.log('🔍 检查缓存:', key);
          const cacheData = wx.getStorageSync(key);
          if (cacheData && cacheData.orders) {
            console.log('📋 缓存中的订单数量:', cacheData.orders.length);
            
            // 在缓存的订单中查找目标订单
            const orderIndex = cacheData.orders.findIndex((order: any) => order.id === this.data.orderId);
            console.log('🔍 查找订单索引:', orderIndex);
            
            if (orderIndex !== -1) {
              console.log('✅ 找到目标订单，开始更新');
              const originalSummary = cacheData.orders[orderIndex].orderSummary;
              
              // 更新订单详情
              cacheData.orders[orderIndex].orderDetails = {
                ...cacheData.orders[orderIndex].orderDetails,
                breakfast: this.data.editOrderDetails.breakfast,
                lunch: this.data.editOrderDetails.lunch,
                dinner: this.data.editOrderDetails.dinner,
                special_requirements: this.data.editOrderDetails.special_requirements
              };
              
              // 重新生成订单摘要
              const newSummary = this.generateOrderSummary(cacheData.orders[orderIndex].orderDetails);
              cacheData.orders[orderIndex].orderSummary = newSummary;
              
              console.log('📝 订单摘要更新:');
              console.log('  原摘要:', originalSummary);
              console.log('  新摘要:', newSummary);
              
              // 更新缓存时间戳
              cacheData.timestamp = Date.now();
              
              // 保存更新后的缓存
              wx.setStorageSync(key, cacheData);
              console.log('💾 已保存更新后的缓存:', key);
              
              // 保存查询条件到单独的缓存中，供返回时使用
              this.saveQueryConditions(key);
              
              foundAndUpdated = true;
              cacheKeyUsed = key;
              break;
            } else {
              console.log('❌ 在此缓存中未找到目标订单');
              // 打印缓存中的订单ID列表用于调试
              const orderIds = cacheData.orders.map((order: any) => order.id);
              console.log('📋 缓存中的订单ID列表:', orderIds);
            }
          }
        }
      }
      
      if (foundAndUpdated) {
        console.log('✅ 本地缓存更新成功，使用的缓存key:', cacheKeyUsed);
      } else {
        console.log('❌ 未找到要更新的订单缓存');
      }
      
    } catch (error) {
      console.error('❌ 更新本地订单缓存失败:', error);
    }
  },

  // 保存查询条件
  saveQueryConditions(cacheKey: string) {
    try {
      // 从缓存key中解析出门店和日期信息
      // 格式: admin_orders_${store}_${date}
      const keyParts = cacheKey.replace('admin_orders_', '').split('_');
      if (keyParts.length >= 2) {
        const store = keyParts[0];
        const date = keyParts.slice(1).join('_'); // 处理日期中可能包含下划线的情况
        
        const queryConditions = {
          selectedOrderStore: store,
          selectedDate: date,
          timestamp: Date.now()
        };
        
        wx.setStorageSync('admin_query_conditions', queryConditions);
        console.log('💾 已保存查询条件:', queryConditions);
      }
    } catch (error) {
      console.error('保存查询条件失败:', error);
    }
  },

  // 生成订单摘要
  generateOrderSummary(orderDetails: any): string {
    if (!orderDetails) return '';
    
    const summaryParts = [];
    
    // 早餐
    if (orderDetails.breakfast) {
      summaryParts.push(`早餐: ${orderDetails.breakfast}`);
    }
    
    // 午餐
    if (orderDetails.lunch && Array.isArray(orderDetails.lunch) && orderDetails.lunch.length > 0) {
      const lunchItems = orderDetails.lunch.filter((item: string) => item.trim() !== '');
      if (lunchItems.length > 0) {
        summaryParts.push(`午餐: ${lunchItems.join('、')}`);
      }
    }
    
    // 晚餐
    if (orderDetails.dinner && Array.isArray(orderDetails.dinner) && orderDetails.dinner.length > 0) {
      const dinnerItems = orderDetails.dinner.filter((item: string) => item.trim() !== '');
      if (dinnerItems.length > 0) {
        summaryParts.push(`晚餐: ${dinnerItems.join('、')}`);
      }
    }
    
    // 高补餐
    if (orderDetails.supplement) {
      summaryParts.push(`高补餐: ${orderDetails.supplement}`);
    }
    
    return summaryParts.join(' | ');
  },

  // 保存订单编辑
  async saveOrderEdit() {
    console.log('🔄 保存订单编辑:', this.data.orderId);
    console.log('编辑后的订单详情:', this.data.editOrderDetails);

    try {
      this.setData({ saving: true });

      // 调用云函数更新订单详情
      const result = await wx.cloud.callFunction({
        name: 'updateOrderDetails',
        data: {
          orderId: this.data.orderId,
          updatedOrderDetails: this.data.editOrderDetails,
          sessionToken: wx.getStorageSync('sessionToken')
        }
      });

      console.log('订单详情更新云函数调用结果:', result.result);

      if (result.result && typeof result.result === 'object' && 'success' in result.result && result.result.success) {
        // 更新本地缓存中的订单信息
        this.updateLocalOrderCache();

        wx.showToast({
          title: '订单更新成功',
          icon: 'success',
          duration: 1500
        });

        console.log('✅ 订单更新成功:', this.data.orderId);

        // 延迟返回上一页
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);

      } else {
        console.error('订单详情更新失败:', result.result);
        wx.showToast({
          title: (result.result as any)?.message || '更新订单失败',
          icon: 'error',
          duration: 2000
        });
      }

    } catch (error) {
      console.error('保存订单编辑出错:', error);
      wx.showToast({
        title: '网络错误，请重试',
        icon: 'error',
        duration: 2000
      });
    } finally {
      this.setData({ saving: false });
    }
  },

  // 页面分享
  onShareAppMessage() {
    return {
      title: '爱睦 Love Moon',
      path: '/pages/login/login'
    };
  }

});
