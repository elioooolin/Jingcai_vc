// pages/customer/health/health.ts

interface TcmPrescription {
  _id: string;
  name: string;
  ingredient: string;
  benefit: string;
  imageUrl?: string;
}

interface TcmRxRecord {
  _id: string;
  userId: string;
  week: number;
  note?: string;
  rx?: string[];
  prescriptions: TcmPrescription[];
  tongueImageUrl: string;
  tongueImageExists: boolean;
}

interface HerbalCategory {
  category: string;
  name: string;
  description: string;
  imageUrl: string;
  materials: string;
  effects: string;
}

Page({
  data: {
    userInfo: {} as any,
    isVisitor: false,
    loading: false,
    activeTab: 0,
    currentSlideIndex: 0,
    currentWeek: 1,
    rxData: [] as TcmRxRecord[],
    herbalCategories: [] as HerbalCategory[],
    swiperHeight: 800
  },

  onLoad() {
    this.checkLoginStatus();
  },

  onShow() {
    if (this.data.isVisitor) {
      return;
    }
    this.loadTcmData();
  },

  onPullDownRefresh() {
    if (this.data.isVisitor) {
      wx.stopPullDownRefresh();
      return;
    }
    this.loadTcmData().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 检查登录状态
  checkLoginStatus() {
    const manualLogout = wx.getStorageSync('manualLogout');
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo?.role === 'visitor' || userInfo?.userType === 'visitor') {
      this.setData({
        userInfo,
        isVisitor: true
      });
      return;
    }

    if (!userInfo || manualLogout) {
      this.setData({
        userInfo: {},
        isVisitor: true
      });
      return;
    }

    if (userInfo.role === 'admin' || userInfo.role === 'staff' || userInfo.userType === 'admin' || userInfo.userType === 'staff') {
      wx.reLaunch({
        url: `/pages/admin/dashboard/dashboard${userInfo.role === 'staff' || userInfo.userType === 'staff' ? '?mode=readonly' : ''}`
      });
      return;
    }
    this.setData({
      userInfo,
      isVisitor: false
    });
  },

  // 加载中医数据
  async loadTcmData() {
    if (this.data.isVisitor) {
      return;
    }

    const { userInfo } = this.data;
    if (!userInfo._id) return;

    this.setData({ loading: true });

    try {
      const result = await wx.cloud.callFunction({
        name: 'getTcmData',
        data: {
          userId: userInfo._id,
          sessionToken: wx.getStorageSync('sessionToken')
        }
      });

      const response = result.result as any;
      if (response.success) {
        const { rxData, herbalCategories } = response.data;
        
        // 处理舌苔图片URL和检查图片是否存在
        const processedRxData = await Promise.all(
          rxData.map(async (item: TcmRxRecord) => {
            // 为药膳方子添加图片URL
            const processedPrescriptions = item.prescriptions.map(prescription => ({
              ...prescription,
              imageUrl: `cloud://cloud1-1gbzoqv6ad653efc.636c-cloud1-1gbzoqv6ad653efc-1356702265/tcm_pics/${prescription.name}.JPG`
            }));

            // 检查舌苔图片是否存在
            const tongueImageExists = await this.checkImageExists(item.tongueImageUrl);
            
            return {
              ...item,
              prescriptions: processedPrescriptions,
              tongueImageExists
            };
          })
        );
        

        // 处理药膳类别图片URL
        const processedHerbalCategories = herbalCategories.map((category: HerbalCategory) => ({
          ...category,
          imageUrl: `cloud://cloud1-1gbzoqv6ad653efc.636c-cloud1-1gbzoqv6ad653efc-1356702265/${category.imageUrl}`
        }));

        console.log('processedHerbalCategories', processedHerbalCategories);

        this.setData({
          rxData: processedRxData,
          herbalCategories: processedHerbalCategories,
          currentWeek: processedRxData.length > 0 ? processedRxData[0].week : 1
        }, () => {
          // 数据渲染完成后计算初始高度
          if (processedRxData.length > 0) {
            this.calculateSwiperHeight(0);
          }
        });
      } else {
        wx.showToast({
          title: response.message || '加载失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('加载中医数据失败:', error);
      wx.showToast({
        title: '网络错误，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 检查图片是否存在
  async checkImageExists(imagePath: string): Promise<boolean> {
    try {
      // 尝试获取云存储文件信息
      console.log('checkImageExists imagePath', imagePath);
      const result = await wx.cloud.getTempFileURL({
        fileList: [imagePath]
      });
      return result.fileList[0].status === 0;
    } catch (error) {
      return false;
    }
  },

  // Tab切换
  switchTab(e: any) {
    const index = parseInt(e.currentTarget.dataset.index);
    this.setData({
      activeTab: index
    });
  },

  // 轮播图切换
  showSlide(e: any) {
    const index = parseInt(e.currentTarget.dataset.index);
    const { rxData } = this.data;
    
    this.setData({
      currentSlideIndex: index,
      currentWeek: rxData[index]?.week || 1
    });

    this.calculateSwiperHeight(index);
  },

  // 计算swiper高度
  calculateSwiperHeight(index: number) {
    wx.nextTick(() => {
      const query = wx.createSelectorQuery().in(this);
      query.select(`#swiper-item-${index}`).boundingClientRect();
      query.exec((res) => {
        if (res && res[0] && res[0].height) {
          const heightPx = Math.ceil(res[0].height);
          this.setData({
            swiperHeight: heightPx
          });
        }
      });
    });
  },

  // Swiper滑动事件处理
  onSwiperChange(e: any) {
    const { current } = e.detail;
    const { rxData } = this.data;
    
    this.setData({
      currentSlideIndex: current,
      currentWeek: rxData[current]?.week || 1
    });

    this.calculateSwiperHeight(current);
  },

  // 舌苔图片加载失败
  onTongueImageError(e: any) {
    const index = parseInt(e.currentTarget.dataset.index);
    const { rxData } = this.data;
    
    rxData[index].tongueImageExists = false;
    this.setData({ rxData });
  },

  // 药膳方子图片加载失败
  onPrescriptionImageError(e: any) {
    console.log('药膳方子图片加载失败:', e);
    // 可以设置默认图片或显示占位符
  },

  // 药膳类别图片加载失败
  onCategoryImageError(e: any) {
    console.log('药膳类别图片加载失败:', e);
    // 可以设置默认图片或显示占位符
  },

  // 页面分享
  onShareAppMessage() {
    return {
      title: '爱睦 Love Moon',
      path: '/pages/customer/dashboard/dashboard'
    };
  }
});
