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

      if (result.result.success) {
        const menuData = result.result.data as { date: string; menuDay: number; menu: MenuData };
        console.log('解析菜单数据:', menuData);
        
        this.setData({ menuDay: menuData.menuDay });
        this.parseMenuData(menuData.menu);
      } else {
        console.error('获取菜单失败:', result.result);
        wx.showToast({
          title: result.result.message || '获取菜单失败',
          icon: 'error'
        });
        // 使用默认菜单数据
        this.loadDefaultMenu();
      }
    } catch (error) {
      console.error('调用云函数失败:', error);
      wx.showToast({
        title: '网络错误，请稍后重试',
        icon: 'error'
      });
      // 使用默认菜单数据
      this.loadDefaultMenu();
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
  },

  // 加载默认菜单（备用）
  loadDefaultMenu() {
    console.log('使用默认菜单数据');
    this.setData({
      breakfastMenu: [
        {
          id: 'default_breakfast_001',
          name: '小米粥',
          description: '温胃养身，易于消化',
          icon: '菜',
          color: '#d4a574',
          selected: false
        },
        {
          id: 'default_breakfast_002',
          name: '蒸蛋',
          description: '嫩滑可口，蛋白质丰富',
          icon: '菜',
          color: '#d4a574',
          selected: false
        }
      ],
      lunchMainMenu: [
        {
          id: 'default_lunch_main_001',
          name: '红烧鸡腿',
          description: '蛋白质丰富，口感鲜美',
          icon: '菜',
          color: '#ea580c',
          selected: false
        },
        {
          id: 'default_lunch_main_002',
          name: '清蒸鲈鱼',
          description: '低脂高蛋白，营养丰富',
          icon: '菜',
          color: '#ea580c',
          selected: false
        }
      ],
      lunchSoupMenu: [
        {
          id: 'default_lunch_soup_001',
          name: '冬瓜汤',
          description: '清热利水，去水肿',
          icon: '汤',
          color: '#3b82f6',
          selected: false
        },
        {
          id: 'default_lunch_soup_002',
          name: '排骨汤',
          description: '补钙养身，滋补营养',
          icon: '汤',
          color: '#3b82f6',
          selected: false
        }
      ],
      dinnerMainMenu: [
        {
          id: 'default_dinner_main_001',
          name: '清蒸鲈鱼',
          description: '低脂高蛋白，营养丰富',
          icon: '菜',
          color: '#ea580c',
          selected: false
        },
        {
          id: 'default_dinner_main_002',
          name: '时令蔬菜',
          description: '维生素丰富，清淡易消化',
          icon: '菜',
          color: '#ea580c',
          selected: false
        }
      ],
      dinnerSoupMenu: [
        {
          id: 'default_dinner_soup_001',
          name: '紫菜蛋花汤',
          description: '清淡营养，补充维生素',
          icon: '汤',
          color: '#3b82f6',
          selected: false
        },
        {
          id: 'default_dinner_soup_002',
          name: '丝瓜汤',
          description: '清热解毒，促进乳汁分泌',
          icon: '汤',
          color: '#3b82f6',
          selected: false
        }
      ],
      breakfastRule: '二选一',
      lunchMainRule: '四选二',
      lunchSoupRule: '二选一',
      dinnerMainRule: '四选二',
      dinnerSoupRule: '二选一',
      breakfastRequired: 2,
      lunchMainRequired: 2,
      lunchSoupRequired: 1,
      dinnerMainRequired: 2,
      dinnerSoupRequired: 1
    });
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
  viewDishDetail(e: any) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/dish-detail/dish-detail?id=${id}`
    });
  },

  // 刷新菜单数据
  onPullDownRefresh() {
    this.loadMenuData();
    wx.stopPullDownRefresh();
  }
});