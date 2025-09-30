// pages/admin/tcm-rx/tcm-rx.ts

Page({
  data: {
    userId: '',
    customerName: '',
    loading: false,
    rxData: [] as any[]
  },

  onLoad(options: any) {
    const { userId, name } = options || {};
    if (!userId) {
      wx.showToast({ title: '缺少用户ID', icon: 'error' });
      return;
    }
    this.setData({ userId, customerName: decodeURIComponent(name || '') });
    this.loadRx();
  },

  onShow() {
    // 从添加页面返回时重新加载数据
    if (this.data.userId) {
      this.loadRx();
    }
  },

  async loadRx() {
    const { userId } = this.data;
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'getTcmData',
        data: { userId }
      });
      const result = res.result as any;
      if (result && result.success) {
        const rxData = result.data.rxData || [];
        for (const rx of rxData) {
            rx.tongueImageUrl = `cloud://cloud1-1gbzoqv6ad653efc.636c-cloud1-1gbzoqv6ad653efc-1356702265/${userId}/tongue/week_${rx.week}.JPG`;
        }
        this.setData({ rxData });
      } else {
        wx.showToast({ title: result?.message || '加载失败', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '网络错误', icon: 'error' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 跳转到添加处方页面
  onAddRx() {
    const { userId, customerName } = this.data;
    wx.navigateTo({
      url: `/pages/admin/tcm-rx-add/tcm-rx-add?userId=${userId}&name=${encodeURIComponent(customerName || '')}`
    });
  },

  // 预览舌苔图
  previewTongueImage(e: any) {
    const url = e.currentTarget.dataset.url;
    if (url) {
      wx.previewImage({
        urls: [url],
        current: url
      });
    }
  },

  // 删除处方记录
  deleteRx(e: any) {
    const { id, week, userId } = e.currentTarget.dataset;
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除第${week}周的处方记录吗？删除后将同时删除对应的舌苔图。`,
      confirmText: '删除',
      confirmColor: '#ff4444',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          
          try {
            // 调用云函数删除处方记录和舌苔图
            const result = await wx.cloud.callFunction({
              name: 'deleteTcmRx',
              data: {
                rxId: id,
                userId: userId,
                week: week
              }
            });
            
            wx.hideLoading();
            
            const response = result.result as any;
            
            if (response && response.success) {
              wx.showToast({ title: '删除成功', icon: 'success' });
              // 重新加载数据
              this.loadRx();
            } else {
              throw new Error(response?.message || '删除失败');
            }
          } catch (error: any) {
            wx.hideLoading();
            console.error('删除失败:', error);
            wx.showToast({ 
              title: error.message || '删除失败', 
              icon: 'error' 
            });
          }
        }
      }
    });
  }
});


