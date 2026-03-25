// pages/dish-detail/dish-detail.ts

interface DishInfo {
  id: string;
  name: string;
  description: string;
  nutritional_info: {
    calories: string;
    protein: string;
    fat: string;
    carbohydrates: string;
  };
  chefRecommend: boolean;
  keywords: string[];
  ingredients: string;
  category: string;
  meal_type: string;
  imageUrl: string;
}

const FOOD_PLACEHOLDER_IMAGE = '/assets/icons/food.png';

Page({
  data: {
    dishId: '',
    isFavorite: false,
    dishInfo: {} as DishInfo
  },

  onLoad(options: any) {
    console.log('📱 菜品详情页 onLoad');
    
    if (options.id) {
      this.setData({ dishId: options.id });
      this.loadDishInfo(options.id);
    }
  },

  // 加载菜品信息
  async loadDishInfo(dishId: string) {
    try {
      // 首先尝试从本地存储获取菜品信息
      const localDishData = wx.getStorageSync(`dish_detail_${dishId}`);
      
      if (localDishData && localDishData.timestamp) {
        // 检查数据是否在1小时内（防止数据过期）
        const oneHour = 60 * 60 * 1000;
        const isDataFresh = (Date.now() - localDishData.timestamp) < oneHour;
        
        if (isDataFresh) {
          console.log('使用本地存储的菜品信息:', localDishData);
          
          // 转换为详情页需要的格式
          const dishInfo = {
            ...localDishData,
            imageUrl: localDishData.imageUrl || FOOD_PLACEHOLDER_IMAGE
          };
          
          this.setData({ dishInfo });
          
          // 设置导航栏标题
          wx.setNavigationBarTitle({
            title: dishInfo.name
          });
          return;
        }
      }
      
      // 如果本地没有数据或数据过期，则调用云函数
      wx.showLoading({
        title: '加载中...'
      });

      const result = await wx.cloud.callFunction({
        name: 'getDishDetail',
        data: { dishId }
      });

      wx.hideLoading();

      if (result.result && typeof result.result === 'object' && 'success' in result.result && result.result.success) {
        const dishInfo = {
          ...(result.result.data as DishInfo),
          imageUrl: ((result.result.data as DishInfo).imageUrl) || FOOD_PLACEHOLDER_IMAGE
        };
        this.setData({ dishInfo });

        // 设置导航栏标题
        wx.setNavigationBarTitle({
          title: dishInfo.name
        });

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

  // 加载备用菜品信息（当信息获取失败时）
  loadFallbackDishInfo(dishId: string) {
    // 诚实地告知用户信息暂时缺失
    const fallbackDishInfo: DishInfo = {
      id: dishId,
      name: '菜品信息暂时缺失',
      description: '抱歉，该菜品的详细信息暂时无法获取。我们正在努力完善菜品信息，请稍后再试或联系客服了解更多详情。',
      nutritional_info: {
        calories: '--',
        protein: '--',
        fat: '--',
        carbohydrates: '--'
      },
      chefRecommend: false,
      imageUrl: FOOD_PLACEHOLDER_IMAGE,
      keywords: [],
      ingredients: '信息暂时缺失',
      category: '未知',
      meal_type: 'unknown'
    };
    
    this.setData({ dishInfo: fallbackDishInfo });
    
    wx.setNavigationBarTitle({
      title: '菜品详情'
    });
    
    // 显示友好的错误提示
    wx.showToast({
      title: '菜品信息暂时无法获取',
      icon: 'none',
      duration: 3000
    });
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


  // 页面分享
  onShareAppMessage() {
    const { dishInfo } = this.data;
    return {
      title: `${dishInfo.name} - 爱睦 Love Moon`,
      path: `/pages/dish-detail/dish-detail?id=${dishInfo.id}`,
      imageUrl: '' // 可以设置分享图片
    };
  },

  onImageError() {
    if (this.data.dishInfo?.imageUrl === FOOD_PLACEHOLDER_IMAGE) {
      return;
    }

    this.setData({
      'dishInfo.imageUrl': FOOD_PLACEHOLDER_IMAGE
    });
  }
});
