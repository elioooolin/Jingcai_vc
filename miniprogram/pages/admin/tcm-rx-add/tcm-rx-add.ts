// pages/admin/tcm-rx-add/tcm-rx-add.ts

interface TcmRxFormData {
  week: string;
  note: string;
  tongueImagePath: string;
  selectedRxIds: string[];
}

interface TcmItem {
  _id: string;
  name: string;
  [key: string]: any;
}

Page({
  data: {
    userId: '',
    customerName: '',
    submitting: false,
    loadingTcm: false,
    
    formData: {
      week: '',
      note: '',
      tongueImagePath: '',
      selectedRxIds: []
    } as TcmRxFormData,
    
    tcmList: [] as TcmItem[],
    canSubmit: false
  },

  onLoad(options: any) {
    const { userId, name } = options || {};
    if (!userId) {
      wx.showToast({ title: '缺少用户ID', icon: 'error' });
      wx.navigateBack();
      return;
    }
    
    this.setData({ 
      userId, 
      customerName: decodeURIComponent(name || '') 
    });
    this.loadTcmData();
    this.validateForm();
  },

  // 加载药膳方数据
  async loadTcmData() {
    // 先尝试从本地存储读取
    const cachedTcmData = wx.getStorageSync('tcm_list');
    if (cachedTcmData && Array.isArray(cachedTcmData) && cachedTcmData.length > 0) {
      const selectedSet = new Set((this.data.formData.selectedRxIds || []).map(String));
      const withSelected = cachedTcmData.map((it: any) => ({
        ...it,
        selected: selectedSet.has(String(it._id))
      }));
      this.setData({ tcmList: withSelected });
      return;
    }

    // 从数据库获取
    this.setData({ loadingTcm: true });
    try {
      const result = await wx.cloud.database().collection('tcm').get();
      const fetched = result.data as TcmItem[];
      const selectedSet = new Set((this.data.formData.selectedRxIds || []).map(String));
      const tcmList = (fetched || []).map((it: any) => ({
        ...it,
        selected: selectedSet.has(String(it._id))
      }));
      
      // 保存到本地存储
      wx.setStorageSync('tcm_list', tcmList);
      this.setData({ tcmList });
    } catch (error) {
      console.error('获取药膳方数据失败:', error);
      wx.showToast({ title: '获取药膳方失败', icon: 'error' });
    } finally {
      this.setData({ loadingTcm: false });
    }
  },

  // 表单字段变化
  onFieldChange(e: any) {
    const { field } = e.currentTarget.dataset;
    const { value } = e.detail;
    
    this.setData({
      [`formData.${field}`]: value
    }, () => {
      this.validateForm();
    });
  },

  // 切换药膳方选择
  toggleRxSelection(e: any) {
    const id = String(e.currentTarget.dataset.id || '');
    if (!id) return;
    const { selectedRxIds } = this.data.formData;

    const newSelectedRxIds = [...selectedRxIds];
    const index = newSelectedRxIds.findIndex((rxId) => String(rxId) === id);

    if (index > -1) {
      newSelectedRxIds.splice(index, 1);
    } else {
      newSelectedRxIds.push(id);
    }

    // 同步更新列表中的选中状态
    const updatedList = (this.data.tcmList || []).map((it: any) => {
      if (String(it._id) === id) {
        return { ...it, selected: index === -1 };
      }
      return it;
    });

    this.setData({ 
      'formData.selectedRxIds': newSelectedRxIds,
      tcmList: updatedList
    }, () => {
      this.validateForm();
    });
  },


  // 选择舌苔图
  chooseTongueImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'], // 优先使用压缩图
      success: async (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        
        // 显示压缩提示
        wx.showLoading({ title: '处理图片中...' });
        
        try {
          // 压缩图片
          const compressedPath = await this.compressImage(tempFilePath);
          
          wx.hideLoading();
          
          this.setData({
            'formData.tongueImagePath': compressedPath
          }, () => {
            this.validateForm();
          });
          
          wx.showToast({ 
            title: '图片已优化', 
            icon: 'success',
            duration: 1500
          });
        } catch (err) {
          wx.hideLoading();
          console.error('图片处理失败:', err);
          // 即使压缩失败，也使用原图
          this.setData({
            'formData.tongueImagePath': tempFilePath
          }, () => {
            this.validateForm();
          });
          wx.showToast({ title: '图片已选择', icon: 'success' });
        }
      },
      fail: (err) => {
        console.error('选择图片失败:', err);
        wx.showToast({ title: '选择图片失败', icon: 'error' });
      }
    });
  },

  // 压缩图片
  async compressImage(filePath: string): Promise<string> {
    try {
      // 获取图片信息
      const imageInfo = await wx.getImageInfo({ src: filePath });
      console.log('原图尺寸:', imageInfo.width, 'x', imageInfo.height);
      
      // 计算压缩目标尺寸（保持比例，限制最大边为 1500px）
      let targetWidth = imageInfo.width;
      let targetHeight = imageInfo.height;
      const maxSize = 1500;
      
      if (imageInfo.width > maxSize || imageInfo.height > maxSize) {
        if (imageInfo.width > imageInfo.height) {
          targetWidth = maxSize;
          targetHeight = Math.round((maxSize / imageInfo.width) * imageInfo.height);
        } else {
          targetHeight = maxSize;
          targetWidth = Math.round((maxSize / imageInfo.height) * imageInfo.width);
        }
      }
      
      // 使用 wx.compressImage 压缩
      const compressResult = await wx.compressImage({
        src: filePath,
        quality: 60, // 压缩质量 60%，确保文件不会太大
        compressedWidth: targetWidth,
        compressedHeight: targetHeight
      });
      
      console.log('图片压缩成功，目标尺寸:', targetWidth, 'x', targetHeight);
      return compressResult.tempFilePath;
    } catch (error) {
      console.error('图片压缩失败，使用原图:', error);
      // 压缩失败返回原路径
      return filePath;
    }
  },

  // 裁剪图片
  cropImage() {
    const { tongueImagePath } = this.data.formData;
    if (!tongueImagePath) {
      wx.showToast({ title: '请先选择图片', icon: 'none' });
      return;
    }

    // 检查是否支持图片编辑功能
    if (typeof (wx as any).editImage === 'function') {
      // 使用微信小程序的图片编辑功能
      (wx as any).editImage({
        src: tongueImagePath,
        success: async (res: any) => {
          // 裁剪后也进行压缩
          wx.showLoading({ title: '处理图片中...' });
          try {
            const compressedPath = await this.compressImage(res.tempFilePath);
            wx.hideLoading();
            this.setData({
              'formData.tongueImagePath': compressedPath
            });
            wx.showToast({ title: '图片已优化', icon: 'success' });
          } catch (err) {
            wx.hideLoading();
            this.setData({
              'formData.tongueImagePath': res.tempFilePath
            });
            wx.showToast({ title: '图片裁剪完成', icon: 'success' });
          }
        },
        fail: (err: any) => {
          console.error('图片裁剪失败:', err);
          wx.showToast({ title: '图片裁剪失败', icon: 'error' });
        }
      });
    } else {
      wx.showToast({ title: '当前版本不支持图片编辑', icon: 'none' });
    }
  },

  // 表单验证
  validateForm() {
    const { week, tongueImagePath } = this.data.formData;
    const weekNum = parseInt(week);
    
    // 必填项：week（有效数字）、tongueImagePath
    // 药膳方选择为可选项
    const isWeekValid = !isNaN(weekNum) && weekNum > 0;
    const hasImage = !!tongueImagePath;
    
    const canSubmit = isWeekValid && hasImage;
    
    this.setData({ canSubmit });
  },

  // 将图片文件转换为 base64
  async imageToBase64(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath: filePath,
        encoding: 'base64',
        success: (res) => {
          resolve(`data:image/jpeg;base64,${res.data}`);
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  },

  // 检查周次是否已存在
  async checkWeekExists(userId: string, week: number): Promise<boolean> {
    try {
      const result = await wx.cloud.database().collection('tcm_rx')
        .where({
          userId: userId,
          week: week
        })
        .get();
      
      return result.data && result.data.length > 0;
    } catch (err) {
      console.error('检查周次失败:', err);
      return false;
    }
  },

  // 提交表单
  async submitForm() {
    if (!this.data.canSubmit || this.data.submitting) {
      return;
    }

    const { userId } = this.data;
    const { week, note, tongueImagePath, selectedRxIds } = this.data.formData;
    const weekNum = parseInt(week);
    
    this.setData({ submitting: true });
    
    try {
      // 预检查：该周次是否已存在处方
      wx.showLoading({ title: '检查周次...' });
      const exists = await this.checkWeekExists(userId, weekNum);
      
      if (exists) {
        wx.hideLoading();
        wx.showModal({
          title: '提示',
          content: '该周次处方已存在，请删除现存处方后再上传',
          showCancel: false,
          confirmText: '知道了'
        });
        this.setData({ submitting: false });
        return;
      }
      
      wx.showLoading({ title: '处理图片中...' });
      
      // 1. 将图片转为 base64
      const tongueImageBase64 = await this.imageToBase64(tongueImagePath);
      
      // 检查 base64 大小（云函数限制 5120 KB）
      const base64Size = tongueImageBase64.length * 0.75 / 1024; // 估算实际大小（KB）
      console.log('图片 base64 大小:', base64Size.toFixed(2), 'KB');
      
      if (base64Size > 4500) { // 留一些余量，限制在 4.5MB
        wx.hideLoading();
        wx.showModal({
          title: '图片过大',
          content: `图片大小约 ${base64Size.toFixed(0)} KB，超过限制。请裁剪图片或重新选择更小的图片。`,
          showCancel: false
        });
        this.setData({ submitting: false });
        return;
      }
      
      wx.showLoading({ title: '提交处方中...' });
      
      // 2. 调用云函数上传图片和保存记录
      const res = await wx.cloud.callFunction({
        name: 'addTcmRx',
        data: {
          userId,
          week: parseInt(week),
          note: note || '',
          selectedRxIds: selectedRxIds || [],
          tongueImageBase64
        }
      });
      
      wx.hideLoading();
      
      const result = res.result as any;
      
      if (result && result.success) {
        wx.showToast({ 
          title: '保存成功', 
          icon: 'success',
          duration: 1500
        });
        
        // 延迟返回上级页面
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        throw new Error(result?.message || '保存失败');
      }
      
    } catch (error: any) {
      wx.hideLoading();
      console.error('提交失败:', error);
      wx.showToast({ 
        title: error.message || '保存失败，请重试', 
        icon: 'error' 
      });
    } finally {
      this.setData({ submitting: false });
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
