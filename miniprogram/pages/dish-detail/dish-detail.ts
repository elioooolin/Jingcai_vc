// pages/dish-detail/dish-detail.ts

interface DishInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  rating: number;
  tags: string[];
  nutrition: Array<{
    name: string;
    value: string;
  }>;
  chefRecommend: boolean;
  recommendation: string;
  suggestions: Array<{
    label: string;
    value: string;
  }>;
  related: Array<{
    id: string;
    name: string;
    icon: string;
    color: string;
  }>;
  keywords: string[];
  ingredients: string;
  category: string;
  meal_type: string;
}

Page({
  data: {
    dishId: '',
    isFavorite: false,
    dishInfo: {} as DishInfo
  },

  onLoad(options: any) {
    if (options.id) {
      this.setData({ dishId: options.id });
      this.loadDishInfo(options.id);
    }
  },

  // 加载菜品信息
  async loadDishInfo(dishId: string) {
    try {
      wx.showLoading({
        title: '加载中...'
      });

      // 调用云函数获取菜品详情
      const result = await wx.cloud.callFunction({
        name: 'getDishDetail',
        data: { dishId }
      });

      wx.hideLoading();

      if (result.result.success) {
        const dishInfo = result.result.data;
        this.setData({ dishInfo });

        // 设置导航栏标题
        wx.setNavigationBarTitle({
          title: dishInfo.name
        });

        // 检查是否收藏
        this.checkFavoriteStatus(dishId);
      } else {
        wx.showToast({
          title: '菜品信息获取失败',
          icon: 'none'
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('加载菜品信息失败:', error);
      
      // 使用备用数据
      this.loadFallbackDishInfo(dishId);
    }
  },

  // 加载备用菜品信息（兼容性处理）
  loadFallbackDishInfo(dishId: string) {
    const mockDishInfo: DishInfo = {
      id: dishId,
      name: '小米粥',
      description: '温胃养身，易于消化的营养粥品',
      icon: '🥣',
      rating: 5,
      tags: ['易消化', '养胃', '补气血', '产后适宜'],
      nutrition: [
        { name: '热量', value: '120kcal' },
        { name: '蛋白质', value: '4.5g' },
        { name: '碳水化合物', value: '22g' },
        { name: '脂肪', value: '1.2g' }
      ],
      chefRecommend: true,
      recommendation: '小米粥是月子期间的经典选择，不仅营养丰富，而且温和易消化。',
      suggestions: [
        { label: '适宜时间', value: '早餐、晚餐' },
        { label: '建议份量', value: '150-200ml/次' },
        { label: '搭配建议', value: '蒸蛋、咸菜、坚果' },
        { label: '注意事项', value: '温热食用，避免过烫' }
      ],
      related: [
        { id: 'dish_002', name: '燕麦粥', icon: '🥣', color: '#fbbf24' },
        { id: 'dish_003', name: '蒸蛋', icon: '🥚', color: '#f59e0b' },
        { id: 'dish_004', name: '瘦肉粥', icon: '🥣', color: '#ea580c' }
      ],
      keywords: ['养胃', '补血', '温润'],
      ingredients: '小米、红枣、枸杞',
      category: '菜品',
      meal_type: 'breakfast'
    };
    
    this.setData({ dishInfo: mockDishInfo });
    
    wx.setNavigationBarTitle({
      title: mockDishInfo.name
    });
    
    this.checkFavoriteStatus(dishId);
  },

  // 检查收藏状态
  checkFavoriteStatus(dishId: string) {
    const favorites = wx.getStorageSync('favorites') || [];
    const isFavorite = favorites.includes(dishId);
    this.setData({ isFavorite });
  },

  // 选择菜品
  selectDish() {
    const { dishInfo } = this.data;
    
    wx.showToast({
      title: `已选择${dishInfo.name}，返回点餐页面`,
      icon: 'success',
      duration: 2000
    });

    setTimeout(() => {
      wx.navigateBack({
        fail: () => {
          // 如果无法返回，则跳转到客户主页
          wx.reLaunch({
            url: '/pages/customer/dashboard/dashboard'
          });
        }
      });
    }, 1000);
  },

  // 切换收藏状态
  toggleFavorite() {
    const { dishId, isFavorite } = this.data;
    const favorites = wx.getStorageSync('favorites') || [];
    
    let newFavorites;
    let message;
    
    if (isFavorite) {
      // 取消收藏
      newFavorites = favorites.filter((id: string) => id !== dishId);
      message = '已取消收藏';
    } else {
      // 添加收藏
      newFavorites = [...favorites, dishId];
      message = '已添加到收藏';
    }
    
    wx.setStorageSync('favorites', newFavorites);
    this.setData({ isFavorite: !isFavorite });
    
    wx.showToast({
      title: message,
      icon: 'success',
      duration: 2000
    });
  },

  // 查看相关菜品
  viewRelatedDish(e: any) {
    const { id } = e.currentTarget.dataset;
    
    wx.redirectTo({
      url: `/pages/dish-detail/dish-detail?id=${id}`
    });
  },

  // 页面分享
  onShareAppMessage() {
    const { dishInfo } = this.data;
    return {
      title: `${dishInfo.name} - 爱睦月子餐`,
      path: `/pages/dish-detail/dish-detail?id=${dishInfo.id}`,
      imageUrl: '' // 可以设置分享图片
    };
  }
});
