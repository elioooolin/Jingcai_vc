// pages/customer/menu/menu.ts

interface MenuItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  selected: boolean;
}

interface OrderSummaryItem {
  type: string;
  dishes: string;
}

Page({
  data: {
    selectedDate: '',
    specialRequirements: '',
    submitting: false,
    hasSelectedItems: false,
    canSubmit: false,
    orderSummary: [] as OrderSummaryItem[],
    
    // 早餐菜单
    breakfastMenu: [
      {
        id: 'breakfast_001',
        name: '小米粥',
        description: '温胃养身，易于消化',
        icon: '粥',
        color: '#d4a574',
        selected: false
      },
      {
        id: 'breakfast_002',
        name: '燕麦粥',
        description: '营养丰富，促进消化',
        icon: '粥',
        color: '#fbbf24',
        selected: false
      },
      {
        id: 'breakfast_003',
        name: '蒸蛋',
        description: '嫩滑可口，蛋白质丰富',
        icon: '蛋',
        color: '#f59e0b',
        selected: false
      },
      {
        id: 'breakfast_004',
        name: '煮鸡蛋',
        description: '营养全面，易于吸收',
        icon: '蛋',
        color: '#f59e0b',
        selected: false
      }
    ] as MenuItem[],
    
    // 午餐主菜
    lunchMainMenu: [
      {
        id: 'lunch_main_001',
        name: '红烧鸡腿',
        description: '蛋白质丰富，口感鲜美',
        icon: '鸡',
        color: '#ea580c',
        selected: false
      },
      {
        id: 'lunch_main_002',
        name: '清蒸鲈鱼',
        description: '低脂高蛋白，营养丰富',
        icon: '鱼',
        color: '#ea580c',
        selected: false
      },
      {
        id: 'lunch_main_003',
        name: '蒸蛋羹',
        description: '嫩滑营养，易于消化',
        icon: '蛋',
        color: '#ea580c',
        selected: false
      },
      {
        id: 'lunch_main_004',
        name: '瘦肉粥',
        description: '温补身体，营养均衡',
        icon: '肉',
        color: '#ea580c',
        selected: false
      }
    ] as MenuItem[],
    
    // 午餐汤品
    lunchSoupMenu: [
      {
        id: 'lunch_soup_001',
        name: '冬瓜汤',
        description: '清热利水，去水肿',
        icon: '汤',
        color: '#3b82f6',
        selected: false
      },
      {
        id: 'lunch_soup_002',
        name: '排骨汤',
        description: '补钙养身，滋补营养',
        icon: '汤',
        color: '#3b82f6',
        selected: false
      }
    ] as MenuItem[],
    
    // 晚餐主菜
    dinnerMainMenu: [
      {
        id: 'dinner_main_001',
        name: '清蒸鲈鱼',
        description: '低脂高蛋白，营养丰富',
        icon: '鱼',
        color: '#ea580c',
        selected: false
      },
      {
        id: 'dinner_main_002',
        name: '时令蔬菜',
        description: '维生素丰富，清淡易消化',
        icon: '蔬',
        color: '#ea580c',
        selected: false
      },
      {
        id: 'dinner_main_003',
        name: '豆腐汤',
        description: '植物蛋白，营养丰富',
        icon: '豆',
        color: '#ea580c',
        selected: false
      },
      {
        id: 'dinner_main_004',
        name: '小米粥',
        description: '温胃养身，易于消化',
        icon: '粥',
        color: '#ea580c',
        selected: false
      }
    ] as MenuItem[],
    
    // 晚餐汤品
    dinnerSoupMenu: [
      {
        id: 'dinner_soup_001',
        name: '紫菜蛋花汤',
        description: '清淡营养，补充维生素',
        icon: '汤',
        color: '#3b82f6',
        selected: false
      },
      {
        id: 'dinner_soup_002',
        name: '丝瓜汤',
        description: '清热解毒，促进乳汁分泌',
        icon: '汤',
        color: '#3b82f6',
        selected: false
      }
    ] as MenuItem[],
    
    // 高补餐
    supplementMenu: [
      {
        id: 'supplement_001',
        name: '鸽子汤',
        description: '滋补养身，促进恢复',
        icon: '汤',
        color: '#d4a574',
        selected: false
      },
      {
        id: 'supplement_002',
        name: '乌鸡汤',
        description: '补气养血，增强体质',
        icon: '汤',
        color: '#d4a574',
        selected: false
      },
      {
        id: 'supplement_003',
        name: '猪蹄汤',
        description: '下奶催乳，补充胶原蛋白',
        icon: '汤',
        color: '#d4a574',
        selected: false
      },
      {
        id: 'supplement_004',
        name: '鲫鱼汤',
        description: '催乳下奶，营养丰富',
        icon: '汤',
        color: '#d4a574',
        selected: false
      }
    ] as MenuItem[]
  },

  onLoad(options: any) {
    if (options.date) {
      this.setData({ selectedDate: options.date });
    }
    
    // 设置导航栏标题
    wx.setNavigationBarTitle({
      title: `${options.date || ''} 点餐`
    });
  },

  // 选择菜品
  selectMenuItem(e: any) {
    const { meal, id, index } = e.currentTarget.dataset;
    const menuKey = `${meal}Menu`;
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
    const rules: Record<string, number> = {
      'breakfast': 2, // 主菜二选一 + 其他
      'lunchMain': 2, // 四选二
      'lunchSoup': 1, // 二选一
      'dinnerMain': 2, // 四选二
      'dinnerSoup': 1, // 二选一
      'supplement': 1 // 四选一
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
    const breakfastSelected = this.data.breakfastMenu.some(item => item.selected);
    const lunchMainSelected = this.data.lunchMainMenu.filter(item => item.selected).length >= 1;
    const lunchSoupSelected = this.data.lunchSoupMenu.some(item => item.selected);
    const dinnerMainSelected = this.data.dinnerMainMenu.filter(item => item.selected).length >= 1;
    const dinnerSoupSelected = this.data.dinnerSoupMenu.some(item => item.selected);
    
    // 必须选择：早餐、午餐(主菜+汤)、晚餐(主菜+汤)
    const canSubmit = breakfastSelected && 
                     lunchMainSelected && lunchSoupSelected && 
                     dinnerMainSelected && dinnerSoupSelected;
    
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

    // 模拟提交订单
    setTimeout(() => {
      this.setData({ submitting: false });
      console.log("模拟提交订单")
      wx.showToast({
        title: '订单提交成功！等待管理员确认',
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
  }
});
