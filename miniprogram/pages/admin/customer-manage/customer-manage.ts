// pages/admin/customer-manage/customer-manage.ts

import { brandConfig, getShareTitle } from '../../../config/brand'
import { storeOptions } from '../../../config/stores'

interface FormData {
  name: string;
  phone: string;
  birthday: string;
  checkInDate: string;
  totalDays: string;
  store: string;
  room: string;
  dietPreference: string;
  supplementCount: string;
  freeFamilyMealCount: string;
}

Page({
  data: {
    isEdit: false,
    customerId: '',
    submitting: false,
    
    // 控制选择器显示状态
    birthdayVisible: false,
    checkInDateVisible: false,
    storeVisible: false,
    birthdayStart: '',
    birthdayEnd:'',
    storeText: '请选择门店',
    
    formData: {
      name: '',
      phone: '',
      birthday: '',
      checkInDate: '',
      totalDays: '',
      store: '',
      room: '',
      dietPreference: '',
      supplementCount: '0',
      freeFamilyMealCount: '0'
    } as FormData,
    
    
    storeOptions,
    customerManageSubtitle: brandConfig.customerManageSubtitle
  },

  onLoad(options: any) {
    this.checkAdminAuth();
    
    // 设置当前日期
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    this.setData({
      birthdayStart: `${year - 50}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      birthdayEnd: `${year - 16}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    });
    
    if (options.action === 'edit' && options.id) {
      this.setData({
        isEdit: true,
        customerId: options.id
      });
      this.loadCustomerData(options.id);
    }
    
    // 设置导航栏标题
    wx.setNavigationBarTitle({
      title: options.action === 'edit' ? '编辑客户' : '添加客户'
    });
  },

  // 加载客户数据（编辑模式）
  async loadCustomerData(customerId: string) {
    try {
      wx.showLoading({
        title: '加载客户信息...'
      });

      const result = await wx.cloud.callFunction({
        name: 'getUserInfo',
        data: {
          userId: customerId,
          sessionToken: wx.getStorageSync('sessionToken')
        }
      });

      if (result.result && typeof result.result === 'object' && 'success' in result.result && result.result.success) {
        const userData = result.result.userInfo;
        
        this.setData({
          formData: {
            name: userData.name || '',
            phone: userData.phone || '',
            birthday: userData.birthday || '',
            checkInDate: userData.checkInDate || '',
            totalDays: userData.totalDays ? userData.totalDays.toString() : '',
            store: userData.store || '',
            room: userData.room || '',
            dietPreference: userData.dietPreference || '',
            supplementCount: userData.supplementCount ? userData.supplementCount.toString() : '0',
            freeFamilyMealCount: userData.freeFamilyMealCount ? userData.freeFamilyMealCount.toString() : '0'
          },
          storeText: this.getStoreText(userData.store || '')
        });

        console.log('客户数据加载成功:', userData);
      } else {
        throw new Error('获取客户信息失败');
      }
    } catch (error) {
      console.error('加载客户数据失败:', error);
      wx.showToast({
        title: '加载客户信息失败',
        icon: 'none',
        duration: 2000
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 检查管理员权限
  checkAdminAuth() {
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo || userInfo.userType !== 'admin') {
      wx.reLaunch({
        url: '/pages/login/login'
      });
      return;
    }
  },

  // 表单字段变化
  onFieldChange(e: any) {
    const { field } = e.currentTarget.dataset;
    const { value } = e.detail;
    
    this.setData({
      [`formData.${field}`]: value
    });
    
    // 特殊处理手机号格式
    if (field === 'phone') {
      this.validatePhone(value);
    }
    
    // 特殊处理房间号格式
    if (field === 'room') {
      this.formatRoomNumber(value);
    }
  },

  // 显示日期选择器
  showDatePicker(e: any) {
    const field = e.currentTarget.dataset.field;
    console.log('显示日期选择器:', field);
    
    if (field === 'birthday') {
      this.setData({ birthdayVisible: true });
    } else if (field === 'checkInDate') {
      this.setData({ checkInDateVisible: true });
    }
  },

  // 隐藏日期选择器
  hideDatePicker() {
    this.setData({
      birthdayVisible: false,
      checkInDateVisible: false
    });
  },

  // 生日选择确认
  onBirthdayConfirm(e: any) {
    console.log('生日选择确认:', e.detail);
    this.setData({
      'formData.birthday': String(e.detail.value).substring(0,10),
      birthdayVisible: false
    });
  },

  // 生日选择过程中
  onBirthdayPick(e: any) {
    console.log('生日选择中:', e.detail);
  },

  // 入住日期选择确认
  onCheckInDateConfirm(e: any) {
    console.log('入住日期选择确认:', e.detail);
    this.setData({
      'formData.checkInDate': String(e.detail.value).substring(0,10),
      checkInDateVisible: false
    });
  },

  // 入住日期选择过程中
  onCheckInDatePick(e: any) {
    console.log('入住日期选择中:', e.detail);
  },

  // 显示选择器
  showPicker(e: any) {
    const field = e.currentTarget.dataset.field;
    console.log('显示选择器:', field);
    
    if (field === 'store') {
      this.setData({ storeVisible: true });
    }
  },

  // 隐藏选择器
  hidePicker() {
    this.setData({
      storeVisible: false
    });
  },

  // 门店选择确认
  onStoreConfirm(e: any) {
    console.log('门店选择确认:', e.detail.value);
    // t-picker-item返回的是数组格式，取第一个元素
    const selectedValue = Array.isArray(e.detail.value) ? e.detail.value[0] : e.detail.value;
    console.log('selectedValue:', selectedValue);
    this.setData({
      'formData.store': selectedValue,
      storeVisible: false,
      storeText: this.getStoreText(selectedValue)
    });
  },

  // 门店选择过程中
  onStorePick(e: any) {
    console.log('门店选择中:', e.detail);
  },


  // 验证手机号
  validatePhone(phone: string) {
    const cleanPhone = phone.replace(/\D/g, '');
    
    if (cleanPhone.length > 11) {
      this.setData({
        'formData.phone': cleanPhone.substring(0, 11)
      });
    } else {
      this.setData({
        'formData.phone': cleanPhone
      });
    }
  },

  // 格式化房间号
  formatRoomNumber(room: string) {
    const formattedRoom = room.toUpperCase();
    this.setData({
      'formData.room': formattedRoom
    });
  },

  // 获取门店文本
  getStoreText(value: string | string[]): string {
    // 处理数组格式的值
    const actualValue = Array.isArray(value) ? value[0] : value;
    if (!actualValue) return '请选择门店';
    
    const option = this.data.storeOptions.find(opt => opt.value === actualValue);
    console.log("getStoreText:", option?.label || '请选择门店')
    return option?.label || '请选择门店';
  },


  // 验证表单
  validateForm(): boolean {
    const { formData } = this.data;
    const requiredFields = [
      { field: 'name', name: '客户姓名' },
      { field: 'phone', name: '手机号码' },
      { field: 'birthday', name: '生日' },
      { field: 'checkInDate', name: '入住日期' },
      { field: 'totalDays', name: '入住天数' },
      { field: 'store', name: '入住门店' },
      { field: 'room', name: '房间号码' },
      { field: 'supplementCount', name: '高补餐次数' },
      { field: 'freeFamilyMealCount', name: '陪人餐次数' }
    ];

    for (const { field, name } of requiredFields) {
      if (!formData[field as keyof FormData]?.trim()) {
        wx.showToast({
          title: `请填写${name}`,
          icon: 'none',
          duration: 2000
        });
        return false;
      }
    }

    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(formData.phone)) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none',
        duration: 2000
      });
      return false;
    }

    // 验证入住天数
    const totalDays = parseInt(formData.totalDays);
    if (isNaN(totalDays) || totalDays < 1 || totalDays > 100) {
      wx.showToast({
        title: '入住天数应在1-100天之间',
        icon: 'none',
        duration: 2000
      });
      return false;
    }

    // 验证高补餐次数
    const supplementCount = parseInt(formData.supplementCount);
    if (isNaN(supplementCount) || supplementCount < 0 || supplementCount > 20) {
      wx.showToast({
        title: '高补餐次数应在0-20之间',
        icon: 'none',
        duration: 2000
      });
      return false;
    }

    // 验证陪人餐次数
    const freeFamilyMealCount = parseInt(formData.freeFamilyMealCount);
    if (isNaN(freeFamilyMealCount) || freeFamilyMealCount < 0 || freeFamilyMealCount > 999) {
      wx.showToast({
        title: '陪人餐次数应在0-999之间',
        icon: 'none',
        duration: 2000
      });
      return false;
    }

    return true;
  },

  // 提交表单
  submitForm() {
    if (!this.validateForm()) {
      return;
    }

    this.setData({ submitting: true });

    console.log("submiteForm", this.data);
    // 调用云函数保存客户信息
    wx.cloud.callFunction({
      name: 'saveCustomer',
      data: {
        customerData: this.data.formData,
        isEdit: this.data.isEdit,
        customerId: this.data.customerId,
        sessionToken: wx.getStorageSync('sessionToken')
      },
      success: (res: any) => {
        console.log('保存客户信息结果:', res.result);
        
        if (res.result.success) {
          this.handleSaveSuccess();
        } else {
          this.handleSaveError(res.result);
        }
      },
      fail: (err: any) => {
        console.error('调用保存客户云函数失败:', err);
        this.setData({ submitting: false });
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'error',
          duration: 2000
        });
      }
    });
  },

  // 处理保存成功
  handleSaveSuccess() {
    this.setData({ submitting: false });
    
    const { isEdit } = this.data;
    const successMessage = isEdit ? '客户信息修改成功！' : '客户添加成功！客户现在可以使用微信登录系统。';
    
    wx.showToast({
      title: successMessage,
      icon: 'success',
      duration: 2000
    });

    setTimeout(() => {
      this.goBack();
    }, 1500);
  },

  // 处理保存错误
  handleSaveError(result: any) {
    this.setData({ submitting: false });
    
    let errorMessage = '保存失败，请重试';
    
    switch (result.error) {
      case 'PHONE_EXISTS':
        errorMessage = '该手机号已被其他客户使用';
        break;
      case 'INVALID_PHONE':
        errorMessage = '手机号格式不正确';
        break;
      case 'MISSING_REQUIRED_FIELD':
        errorMessage = '请填写所有必填字段';
        break;
      case 'UNAUTHORIZED':
      case 'ADMIN_REQUIRED':
        errorMessage = '没有权限进行此操作';
        break;
      default:
        errorMessage = result.message || '保存失败，请重试';
        break;
    }
    
    wx.showToast({
      title: errorMessage,
      icon: 'error',
      duration: 2000
    });
  },

  // 返回
  goBack() {
    wx.navigateBack({
      fail: () => {
        // 如果无法返回，则跳转到管理员主页
        wx.reLaunch({
          url: '/pages/admin/dashboard/dashboard'
        });
      }
    });
  },

  // 页面分享
  onShareAppMessage() {
    return {
      title: getShareTitle(),
      path: '/pages/login/login'
    };
  }
});
