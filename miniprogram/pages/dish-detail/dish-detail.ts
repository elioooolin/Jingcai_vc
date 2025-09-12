// pages/dish-detail/dish-detail.ts
import Toast from 'tdesign-miniprogram/toast/index';

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
  benefits: Array<{
    title: string;
    description: string;
  }>;
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
  loadDishInfo(dishId: string) {
    // 模拟API调用
    setTimeout(() => {
      const mockDishInfo: DishInfo = {
        id: dishId,
        name: '小米粥',
        description: '温胃养身，易于消化的营养粥品',
        icon: '粥',
        rating: 5,
        tags: ['易消化', '养胃', '补气血', '产后适宜'],
        nutrition: [
          { name: '热量(千卡)', value: '120' },
          { name: '蛋白质', value: '4.5g' },
          { name: '碳水化合物', value: '22g' },
          { name: '脂肪', value: '1.2g' },
          { name: '铁', value: '0.8mg' },
          { name: '锌', value: '2.1mg' }
        ],
        benefits: [
          {
            title: '健脾养胃',
            description: '小米性温，具有健脾和胃的功效，特别适合产后脾胃虚弱的产妇'
          },
          {
            title: '补充能量',
            description: '富含碳水化合物，能够快速为产妇提供所需能量，促进身体恢复'
          },
          {
            title: '富含维生素B族',
            description: '含有丰富的维生素B1、B2等，有助于神经系统健康和新陈代谢'
          },
          {
            title: '易于消化',
            description: '质地柔软，容易消化吸收，减轻肠胃负担'
          }
        ],
        recommendation: '小米粥是月子期间的经典选择，不仅营养丰富，而且温和易消化。对于产后身体虚弱、食欲不振的产妇来说，小米粥能够很好地滋养脾胃，补充所需的营养和能量。建议搭配蒸蛋或其他蛋白质食物，营养更加均衡。',
        suggestions: [
          { label: '适宜时间', value: '早餐、晚餐' },
          { label: '建议份量', value: '150-200ml/次' },
          { label: '搭配建议', value: '蒸蛋、咸菜、坚果' },
          { label: '注意事项', value: '温热食用，避免过烫' }
        ],
        related: [
          { id: 'dish_002', name: '燕麦粥', icon: '粥', color: '#fbbf24' },
          { id: 'dish_003', name: '蒸蛋', icon: '蛋', color: '#f59e0b' },
          { id: 'dish_004', name: '瘦肉粥', icon: '肉', color: '#ea580c' }
        ]
      };
      
      this.setData({ dishInfo: mockDishInfo });
      
      // 设置导航栏标题
      wx.setNavigationBarTitle({
        title: mockDishInfo.name
      });
      
      // 检查是否收藏
      this.checkFavoriteStatus(dishId);
    }, 1000);
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
    
    Toast({
      context: this,
      selector: '#t-toast',
      message: `已选择${dishInfo.name}，返回点餐页面`,
      theme: 'success',
      direction: 'column',
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
    const { dishId, isFavorite, dishInfo } = this.data;
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
    
    Toast({
      context: this,
      selector: '#t-toast',
      message,
      theme: 'success',
      direction: 'column',
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
      title: `${dishInfo.name} - 爱睦轻予月子餐`,
      path: `/pages/dish-detail/dish-detail?id=${dishInfo.id}`,
      imageUrl: '' // 可以设置分享图片
    };
  }
});
