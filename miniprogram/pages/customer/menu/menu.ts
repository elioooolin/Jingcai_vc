// pages/customer/menu/menu.ts

interface MenuItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  selected: boolean;
  _id?: string;
  category?: string;
  meal_type?: string;
  ingredients?: string;
  keywords?: string;
  chefRecommend?: boolean;
  imageUrl?: string;
  nutritional_info?: {
    calories: string;
    protein: string;
    fat: string;
    carbohydrates: string;
  };
}

interface OrderSummaryItem {
  type: string;
  dishes: string;
}

interface MenuData {
  day: number;
  meals: {
    [mealType: string]: {
      [category: string]: {
        selection_rule: string;
        required_count: number;
        dishes: MenuItem[];
      };
    };
  };
}

Page({
  data: {
    selectedDate: '',
    specialRequirements: '',
    submitting: false,
    hasSelectedItems: false,
    canSubmit: false,
    orderSummary: [] as OrderSummaryItem[],
    loading: true,
    menuDay: 0,
    
    // 菜单加载错误状态
    menuLoadError: false,
    menuErrorMessage: '',
    
    // 从数据库加载的菜单数据
    breakfastMenu: [] as MenuItem[],
    lunchMainMenu: [] as MenuItem[],
    lunchSoupMenu: [] as MenuItem[],
    dinnerMainMenu: [] as MenuItem[],
    dinnerSoupMenu: [] as MenuItem[],
    supplementMenu: [] as MenuItem[],
    
    // 选择规则
    breakfastRule: '',
    lunchMainRule: '',
    lunchSoupRule: '',
    dinnerMainRule: '',
    dinnerSoupRule: '',
    supplementRule: '',
    
    // 必选数量
    breakfastRequired: 0,
    lunchMainRequired: 0,
    lunchSoupRequired: 0,
    dinnerMainRequired: 0,
    dinnerSoupRequired: 0,
    supplementRequired: 0
  },

  onLoad(options: any) {
    if (options.date) {
      this.setData({ selectedDate: options.date });
    }
    
    // 设置导航栏标题
    wx.setNavigationBarTitle({
      title: `${options.date || ''} 点餐`
    });
    
    // 加载菜单数据
    this.loadMenuData();
  },

  // 从数据库加载菜单数据
  async loadMenuData() {
    const selectedDate = this.data.selectedDate;
    if (!selectedDate) {
      wx.showToast({
        title: '日期参数缺失',
        icon: 'error'
      });
      return;
    }

    this.setData({ loading: true });

    try {
      console.log('正在获取菜单数据，日期:', selectedDate);
      
      const result = await wx.cloud.callFunction({
        name: 'getMenuForDate',
        data: { date: selectedDate }
      });

      console.log('菜单数据获取结果:', result);

      if (result.result && typeof result.result === 'object' && 'success' in result.result && result.result.success) {
        const menuData = result.result.data as { date: string; menuDay: number; menu: MenuData };
        console.log('解析菜单数据:', menuData);
        
        this.setData({ menuDay: menuData.menuDay });
        this.parseMenuData(menuData.menu);
      } else {
        console.error('获取菜单失败:', result.result);
        const errorMessage = (result.result && typeof result.result === 'object' && 'message' in result.result) 
          ? (result.result.message as string) 
          : '获取菜单失败';
        wx.showToast({
          title: errorMessage,
          icon: 'error',
          duration: 3000
        });
        // 显示菜单加载失败状态
        this.showMenuLoadFailure('服务器返回错误，无法获取菜单数据');
      }
    } catch (error) {
      console.error('调用云函数失败:', error);
      wx.showToast({
        title: '网络错误，请稍后重试',
        icon: 'error',
        duration: 3000
      });
      // 显示菜单加载失败状态
      this.showMenuLoadFailure('网络连接失败，无法获取菜单数据');
    } finally {
      this.setData({ loading: false });
    }
  },

  // 解析菜单数据
  parseMenuData(menuData: MenuData) {
    console.log('开始解析菜单数据:', menuData);
    
    const meals = menuData.meals;
    
    // 解析早餐
    if (meals.breakfast && meals.breakfast['菜品']) {
      this.setData({
        breakfastMenu: meals.breakfast['菜品'].dishes,
        breakfastRule: meals.breakfast['菜品'].selection_rule,
        breakfastRequired: meals.breakfast['菜品'].required_count
      });
    }
    
    // 解析午餐
    if (meals.lunch) {
      if (meals.lunch['菜品']) {
        this.setData({
          lunchMainMenu: meals.lunch['菜品'].dishes,
          lunchMainRule: meals.lunch['菜品'].selection_rule,
          lunchMainRequired: meals.lunch['菜品'].required_count
        });
      }
      if (meals.lunch['汤品']) {
        this.setData({
          lunchSoupMenu: meals.lunch['汤品'].dishes,
          lunchSoupRule: meals.lunch['汤品'].selection_rule,
          lunchSoupRequired: meals.lunch['汤品'].required_count
        });
      }
    }
    
    // 解析晚餐
    if (meals.dinner) {
      if (meals.dinner['菜品']) {
        this.setData({
          dinnerMainMenu: meals.dinner['菜品'].dishes,
          dinnerMainRule: meals.dinner['菜品'].selection_rule,
          dinnerMainRequired: meals.dinner['菜品'].required_count
        });
      }
      if (meals.dinner['汤品']) {
        this.setData({
          dinnerSoupMenu: meals.dinner['汤品'].dishes,
          dinnerSoupRule: meals.dinner['汤品'].selection_rule,
          dinnerSoupRequired: meals.dinner['汤品'].required_count
        });
      }
    }
    
    console.log('菜单数据解析完成');
    
    // 一次性存储所有菜品信息到本地
    this.storeDishInfoToLocal();
  },

  // 已删除loadDefaultMenu方法，不再使用模拟数据
  // 当菜单加载失败时，诚实地显示错误信息而不是虚假数据

  // 显示菜单加载失败状态
  showMenuLoadFailure(errorMessage: string) {
    console.log('显示菜单加载失败状态:', errorMessage);
    
    // 清空所有菜单数据
    this.setData({
      breakfastMenu: [],
      lunchMainMenu: [],
      lunchSoupMenu: [],
      dinnerMainMenu: [],
      dinnerSoupMenu: [],
      supplementMenu: [],
      breakfastRule: '',
      lunchMainRule: '',
      lunchSoupRule: '',
      dinnerMainRule: '',
      dinnerSoupRule: '',
      breakfastRequired: 0,
      lunchMainRequired: 0,
      lunchSoupRequired: 0,
      dinnerMainRequired: 0,
      dinnerSoupRequired: 0,
      menuLoadError: true,
      menuErrorMessage: errorMessage
    });
    
    // 显示重试提示
    wx.showModal({
      title: '菜单加载失败',
      content: `${errorMessage}\n\n是否重新尝试加载菜单？`,
      confirmText: '重试',
      cancelText: '稍后再试',
      success: (res) => {
        if (res.confirm) {
          // 用户选择重试
          this.retryLoadMenu();
        }
      }
    });
  },

  // 重试加载菜单
  retryLoadMenu() {
    console.log('用户选择重试加载菜单');
    
    // 重置错误状态
    this.setData({
      menuLoadError: false,
      menuErrorMessage: ''
    });
    
    // 重新加载菜单数据
    this.loadMenuData();
  },

  // 联系客服
  contactService() {
    wx.showModal({
      title: '联系客服',
      content: '如需帮助，请联系客服人员：\n\n电话：400-123-4567\n微信：lovemoon_service\n\n或者您可以稍后重试加载菜单。',
      confirmText: '我知道了',
      showCancel: false
    });
  },

  // 一次性存储所有菜品信息到本地
  storeDishInfoToLocal() {
    console.log('开始批量存储菜品信息到本地...');
    
    try {
      // 收集所有菜品数据
      const allMenus = [
        ...this.data.breakfastMenu,
        ...this.data.lunchMainMenu,
        ...this.data.lunchSoupMenu,
        ...this.data.dinnerMainMenu,
        ...this.data.dinnerSoupMenu,
        ...this.data.supplementMenu
      ];
      
      const timestamp = Date.now();
      let storedCount = 0;
      
      // 批量存储每个菜品的详细信息
      allMenus.forEach(dishItem => {
        if (dishItem && dishItem.id) {
          const dishDetailData = {
            id: dishItem.id,
            name: dishItem.name,
            description: dishItem.description || '精心制作的营养菜品，适合月子期间食用。',
            imageUrl: dishItem.imageUrl,
            category: dishItem.category || '菜品',
            meal_type: dishItem.meal_type || 'unknown',
            keywords: dishItem.keywords || [],
            ingredients: dishItem.ingredients || '优质食材精选',
            chefRecommend: dishItem.chefRecommend || false,
            nutritional_info: dishItem.nutritional_info || {
              calories: '--',
              protein: '--',
              fat: '--',
              carbohydrates: '--'
            },
            timestamp: timestamp
          };
          
          // 存储到本地
          wx.setStorageSync(`dish_detail_${dishItem.id}`, dishDetailData);
          storedCount++;
        }
      });
      
      console.log(`✅ 批量存储完成，共存储 ${storedCount} 个菜品信息`);
      
      // 可选：清理过期的菜品信息
      this.cleanExpiredDishInfo();
      
    } catch (error) {
      console.error('❌ 批量存储菜品信息失败:', error);
    }
  },

  // 清理过期的菜品信息
  cleanExpiredDishInfo() {
    try {
      const storageInfo = wx.getStorageInfoSync();
      const dishDetailKeys = storageInfo.keys.filter(key => key.startsWith('dish_detail_'));
      const oneDay = 24 * 60 * 60 * 1000; // 24小时过期
      let cleanedCount = 0;
      
      dishDetailKeys.forEach(key => {
        try {
          const dishData = wx.getStorageSync(key);
          if (dishData && dishData.timestamp && (Date.now() - dishData.timestamp) > oneDay) {
            wx.removeStorageSync(key);
            cleanedCount++;
          }
        } catch (error) {
          // 如果读取失败，也删除这个键
          wx.removeStorageSync(key);
          cleanedCount++;
        }
      });
      
      if (cleanedCount > 0) {
        console.log(`🧹 清理了 ${cleanedCount} 个过期的菜品信息`);
      }
    } catch (error) {
      console.error('清理过期菜品信息失败:', error);
    }
  },

  // 选择菜品
  selectMenuItem(e: any) {
    const { meal, index } = e.currentTarget.dataset;
    const menuKey = `${meal}Menu` as keyof typeof this.data;
    const menu = this.data[menuKey] as MenuItem[];
    
    if (!menu) return;
    
    const item = menu[index];
    const isCurrentlySelected = item.selected;
    
    // 获取选择规则
    const maxSelections = this.getMaxSelections(meal);
    const selectedCount = menu.filter(item => item.selected).length;
    
    if (isCurrentlySelected) {
      // 取消选择
      menu[index].selected = false;
    } else {
      // 选择菜品
      if (selectedCount >= maxSelections) {
        // 如果已达到最大选择数，移除第一个选中的
        const firstSelectedIndex = menu.findIndex(item => item.selected);
        if (firstSelectedIndex !== -1) {
          menu[firstSelectedIndex].selected = false;
        }
      }
      menu[index].selected = true;
    }
    
    this.setData({
      [menuKey]: menu
    });
    
    this.updateOrderSummary();
    this.checkCanSubmit();
  },

  // 获取最大选择数
  getMaxSelections(meal: string): number {
    const requiredKey = `${meal}Required` as keyof typeof this.data;
    const required = this.data[requiredKey] as number;
    
    if (required > 0) {
      return required;
    }
    
    // 备用规则
    const rules: Record<string, number> = {
      'breakfast': 2,
      'lunchMain': 2,
      'lunchSoup': 1,
      'dinnerMain': 2,
      'dinnerSoup': 1,
      'supplement': 1
    };
    return rules[meal] || 1;
  },

  // 更新订单摘要
  updateOrderSummary() {
    const summary: OrderSummaryItem[] = [];
    
    // 早餐
    const breakfastSelected = this.data.breakfastMenu.filter(item => item.selected);
    if (breakfastSelected.length > 0) {
      summary.push({
        type: '早餐',
        dishes: breakfastSelected.map(item => item.name).join(' + ')
      });
    }
    
    // 午餐
    const lunchMainSelected = this.data.lunchMainMenu.filter(item => item.selected);
    const lunchSoupSelected = this.data.lunchSoupMenu.filter(item => item.selected);
    if (lunchMainSelected.length > 0 || lunchSoupSelected.length > 0) {
      const dishes = [...lunchMainSelected, ...lunchSoupSelected].map(item => item.name);
      summary.push({
        type: '午餐',
        dishes: dishes.join(' + ')
      });
    }
    
    // 晚餐
    const dinnerMainSelected = this.data.dinnerMainMenu.filter(item => item.selected);
    const dinnerSoupSelected = this.data.dinnerSoupMenu.filter(item => item.selected);
    if (dinnerMainSelected.length > 0 || dinnerSoupSelected.length > 0) {
      const dishes = [...dinnerMainSelected, ...dinnerSoupSelected].map(item => item.name);
      summary.push({
        type: '晚餐',
        dishes: dishes.join(' + ')
      });
    }
    
    // 高补餐
    const supplementSelected = this.data.supplementMenu.filter(item => item.selected);
    if (supplementSelected.length > 0) {
      summary.push({
        type: '高补餐',
        dishes: supplementSelected.map(item => item.name).join(' + ')
      });
    }
    
    this.setData({
      orderSummary: summary,
      hasSelectedItems: summary.length > 0
    });
  },

  // 检查是否可以提交
  checkCanSubmit() {
    const breakfastSelected = this.data.breakfastMenu.filter(item => item.selected).length;
    const lunchMainSelected = this.data.lunchMainMenu.filter(item => item.selected).length;
    const lunchSoupSelected = this.data.lunchSoupMenu.filter(item => item.selected).length;
    const dinnerMainSelected = this.data.dinnerMainMenu.filter(item => item.selected).length;
    const dinnerSoupSelected = this.data.dinnerSoupMenu.filter(item => item.selected).length;
    
    // 检查是否满足最低要求
    const breakfastOk = breakfastSelected >= Math.min(this.data.breakfastRequired, 1);
    const lunchMainOk = lunchMainSelected >= Math.min(this.data.lunchMainRequired, 1);
    const lunchSoupOk = lunchSoupSelected >= Math.min(this.data.lunchSoupRequired, 1);
    const dinnerMainOk = dinnerMainSelected >= Math.min(this.data.dinnerMainRequired, 1);
    const dinnerSoupOk = dinnerSoupSelected >= Math.min(this.data.dinnerSoupRequired, 1);
    
    const canSubmit = breakfastOk && lunchMainOk && lunchSoupOk && dinnerMainOk && dinnerSoupOk;
    
    this.setData({ canSubmit });
  },

  // 特殊需求输入
  onSpecialRequirementsChange(e: any) {
    this.setData({ specialRequirements: e.detail.value });
  },

  // 提交订单
  submitOrder() {
    if (!this.data.canSubmit) {
      wx.showToast({
        title: '请完成必选菜品的选择',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    this.setData({ submitting: true });

    // 收集订单数据
    const orderData = {
      date: this.data.selectedDate,
      menuDay: this.data.menuDay,
      breakfast: this.data.breakfastMenu.filter(item => item.selected).map(item => ({
        id: item.id,
        name: item.name
      })),
      lunchMain: this.data.lunchMainMenu.filter(item => item.selected).map(item => ({
        id: item.id,
        name: item.name
      })),
      lunchSoup: this.data.lunchSoupMenu.filter(item => item.selected).map(item => ({
        id: item.id,
        name: item.name
      })),
      dinnerMain: this.data.dinnerMainMenu.filter(item => item.selected).map(item => ({
        id: item.id,
        name: item.name
      })),
      dinnerSoup: this.data.dinnerSoupMenu.filter(item => item.selected).map(item => ({
        id: item.id,
        name: item.name
      })),
      supplement: this.data.supplementMenu.filter(item => item.selected).map(item => ({
        id: item.id,
        name: item.name
      })),
      specialRequirements: this.data.specialRequirements
    };

    console.log('提交订单数据:', orderData);

    // TODO: 调用云函数提交订单
    // 现在先模拟提交
    setTimeout(() => {
      this.setData({ submitting: false });
      wx.showToast({
        title: '订单提交成功！',
        icon: 'success',
        duration: 2000
      });

      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }, 2000);
  },

  // 查看菜品详情
  // 跳转到菜品详情页
  goToDishDetail(e: any) {
    try {
      console.log('🔍 goToDishDetail 被调用了！');
      
      const dataset = e?.currentTarget?.dataset || e?.target?.dataset || {};
      const { dishId, name } = dataset;
      console.log('🆔 提取的数据 - dishId:', dishId, 'name:', name);

      if (!dishId) {
        console.error('缺少菜品ID');
        wx.showToast({
          title: '菜品信息错误',
          icon: 'error'
        });
        return;
      }

      // 显示loading提示
      console.log('🔄 显示loading提示...');
      wx.showToast({
        title: '正在跳转...',
        icon: 'loading',
        duration: 1500,
        mask: true
      });
      
      // 延迟跳转，让用户看到loading效果
      setTimeout(() => {
        console.log('🚀 开始跳转到详情页...');
        wx.navigateTo({
          url: `/pages/dish-detail/dish-detail?id=${dishId}&name=${encodeURIComponent(name)}`,
          success: () => {
            console.log('✅ 跳转成功');
          },
          fail: (error) => {
            console.error('❌ 跳转失败:', error);
            wx.showToast({
              title: '页面跳转失败',
              icon: 'error'
            });
          }
        });
      }, 800); // 800ms延迟，让用户能看到loading
      
    } catch (error) {
      console.error('goToDishDetail 执行错误:', error);
      wx.showToast({
        title: '操作失败',
        icon: 'error'
      });
    }
  },

  // 预览菜品图片
  previewImage(e: any) {
    e.stopPropagation(); // 阻止事件冒泡，避免触发菜品选择
    const { url } = e.currentTarget.dataset;
    
    if (url) {
      wx.previewImage({
        current: url,
        urls: [url],
        fail: (error) => {
          console.error('预览图片失败:', error);
          wx.showToast({
            title: '图片加载失败',
            icon: 'error',
            duration: 2000
          });
        }
      });
    }
  },

  // 图片加载成功
  onImageLoad(e: any) {
    const { name, url } = e.currentTarget.dataset;
    console.log(`✅ 图片加载成功: ${name}`);
    console.log(`   URL: ${url}`);
    console.log(`   图片尺寸:`, e.detail);
  },

  // 图片加载失败
  onImageError(e: any) {
    const { name, url } = e.currentTarget.dataset;
    console.error(`❌ 图片加载失败: ${name}`, e.detail);
    console.error(`   失败的URL: ${url}`);
    console.error(`   错误详情:`, e.detail.errMsg || '未知错误');
    
    // 可以在这里设置默认图片或显示占位符
    // 暂时先记录错误，后续可以添加重试逻辑
  },

  // 刷新菜单数据
  onPullDownRefresh() {
    this.loadMenuData();
    wx.stopPullDownRefresh();
  }
});