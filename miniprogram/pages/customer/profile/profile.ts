// pages/customer/profile/profile.ts

interface ProfileData {
  birthday?: string;
  store?: string;
  room?: string;
  checkInDate?: string;
  totalDays?: string;
  dietPreference?: string;
  allergies?: string;
  supplementCount?: string;
}

Page({
  data: {
    userInfo: {},
    checkInDays: 5,
    profileData: {
      birthday: '1990-05-15',
      store: '朝阳店',
      room: 'A201',
      checkInDate: '2024-01-01',
      totalDays: '28天',
      dietPreference: '清淡少盐，不吃辣',
      allergies: '海鲜',
      supplementCount: '1'
    } as ProfileData,
    
    stats: {
      totalOrders: 15,
      confirmedOrders: 12,
      favoriteDishes: 8,
    },
    
    // 编辑相关
    editDialogVisible: false,
    editDialogTitle: '',
    editType: '',
    editValue: '',
    
    supplementOptions: [
      { label: '0次/天', value: '0' },
      { label: '1次/天', value: '1' },
      { label: '2次/天', value: '2' },
      { label: '3次/天', value: '3' }
    ]
  },

  onLoad() {
    this.checkLoginStatus();
    this.initUserInfo();
    this.loadProfileData();
  },

  onShow() {
    this.refreshStats();
  },

  // 检查登录状态
  checkLoginStatus() {
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo || userInfo.userType !== 'customer') {
      wx.reLaunch({
        url: '/pages/login/login'
      });
      return;
    }
    this.setData({ userInfo });
  },

  // 初始化用户信息
  initUserInfo() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({ userInfo });
    }
  },

  // 加载个人资料数据
  loadProfileData() {
    // 从本地存储或API加载个人资料数据
    const savedProfile = wx.getStorageSync('profileData');
    if (savedProfile) {
      this.setData({ profileData: { ...this.data.profileData, ...savedProfile } });
    }
  },

  // 刷新统计数据
  refreshStats() {
    // 模拟API调用获取统计数据
    setTimeout(() => {
      this.setData({
        stats: {
          totalOrders: Math.floor(Math.random() * 20) + 10,
          confirmedOrders: Math.floor(Math.random() * 15) + 8,
          favoriteDishes: Math.floor(Math.random() * 10) + 5,
        }
      });
    }, 500);
  },

  // 格式化手机号
  formatPhone(phone: string): string {
    if (!phone) return '未绑定';
    return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
  },

  // 获取高补餐文本
  getSupplementText(value: string): string {
    const option = this.data.supplementOptions.find(opt => opt.value === value);
    return option?.label || '未设置';
  },

  // 编辑姓名
  editName() {
    this.showEditDialog('name', '编辑姓名', (this.data.userInfo as any)?.name || '');
  },

  // 编辑生日
  editBirthday() {
    this.showEditDialog('birthday', '编辑生日', this.data.profileData.birthday || '');
  },

  // 编辑饮食偏好
  editDietPreference() {
    this.showEditDialog('dietPreference', '编辑饮食偏好', this.data.profileData.dietPreference || '');
  },

  // 编辑过敏食物
  editAllergies() {
    this.showEditDialog('allergies', '编辑过敏食物', this.data.profileData.allergies || '');
  },

  // 编辑高补餐次数
  editSupplementCount() {
    this.showEditDialog('supplementCount', '编辑高补餐次数', this.data.profileData.supplementCount || '1');
  },

  // 显示编辑弹窗
  showEditDialog(type: string, title: string, value: string) {
    this.setData({
      editDialogVisible: true,
      editDialogTitle: title,
      editType: type,
      editValue: value
    });
  },

  // 编辑值变化
  onEditValueChange(e: any) {
    this.setData({ editValue: e.detail.value });
  },

  // 确认编辑
  confirmEdit() {
    const { editType, editValue } = this.data;
    
    if (!editValue.trim()) {
      wx.showToast({
        title: '请输入有效内容',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    if (editType === 'name') {
      // 更新用户信息
      const userInfo = { ...this.data.userInfo, name: editValue };
      this.setData({ userInfo });
      wx.setStorageSync('userInfo', userInfo);
    } else {
      // 更新个人资料
      const profileData = { ...this.data.profileData, [editType]: editValue };
      this.setData({ profileData });
      wx.setStorageSync('profileData', profileData);
    }

    this.setData({ editDialogVisible: false });
    
    wx.showToast({
      title: '修改成功',
      icon: 'success',
      duration: 2000
    });
  },

  // 取消编辑
  cancelEdit() {
    this.setData({ editDialogVisible: false });
  },

  // 查看收藏
  viewFavorites() {
    wx.showToast({
      title: '收藏功能开发中',
      icon: 'none',
      duration: 2000
    });
  },

  // 意见反馈
  feedback() {
    wx.showToast({
      title: '意见反馈功能开发中',
      icon: 'none',
      duration: 2000
    });
  },

  // 联系客服
  contactService() {
    wx.showModal({
      title: '联系客服',
      content: '客服电话：400-123-4567\n服务时间：09:00-18:00\n\n是否拨打客服电话？',
      confirmText: '拨打',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          wx.makePhoneCall({
            phoneNumber: '400-123-4567',
            fail: () => {
              wx.showToast({
                title: '拨打失败，请手动拨打',
                icon: 'error',
                duration: 2000
              });
            }
          });
        }
      }
    });
  },

  // 关于我们
  aboutUs() {
    wx.showModal({
      title: '关于爱睦轻予',
      content: '爱睦轻予专注于提供专业的月子餐服务，致力于为每一位产妇提供营养均衡、口感美味的月子餐。\n\n版本号：v1.0.0',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // 编辑个人资料
  editProfile() {
    wx.showToast({
      title: '请使用上方各项进行编辑',
      icon: 'none',
      duration: 2000
    });
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
          wx.removeStorageSync('profileData');
          wx.reLaunch({
            url: '/pages/login/login'
          });
        }
      }
    });
  }
});
