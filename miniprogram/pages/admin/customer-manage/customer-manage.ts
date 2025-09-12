// pages/admin/customer-manage/customer-manage.ts
import Toast from 'tdesign-miniprogram/toast/index';

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
  specialNotes: string;
}

Page({
  data: {
    isEdit: false,
    customerId: '',
    submitting: false,
    
    formData: {
      name: '',
      phone: '',
      birthday: '',
      checkInDate: '',
      totalDays: '',
      store: '',
      room: '',
      dietPreference: '',
      supplementCount: '1',
      specialNotes: ''
    } as FormData,
    
    storeOptions: [
      { label: '爱睦月子中心（朝阳店）', value: 'store1' },
      { label: '爱睦月子中心（海淀店）', value: 'store2' },
      { label: '爱睦月子中心（西城店）', value: 'store3' },
      { label: '爱睦月子中心（丰台店）', value: 'store4' }
    ],
    
    supplementOptions: [
      { label: '0次/天', value: '0' },
      { label: '1次/天', value: '1' },
      { label: '2次/天', value: '2' },
      { label: '3次/天', value: '3' }
    ]
  },

  onLoad(options: any) {
    this.checkAdminAuth();
    
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

  // 加载客户数据（编辑模式）
  loadCustomerData(customerId: string) {
    // 模拟API调用
    setTimeout(() => {
      const mockCustomerData: FormData = {
        name: '张女士',
        phone: '13800138001',
        birthday: '1990-05-15',
        checkInDate: '2024-01-01',
        totalDays: '28',
        store: 'store1',
        room: 'A201',
        dietPreference: '清淡少盐，不吃辣',
        supplementCount: '1',
        specialNotes: '产后恢复期，需要特别关注营养搭配'
      };
      
      this.setData({ formData: mockCustomerData });
    }, 1000);
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
  getStoreText(value: string): string {
    const option = this.data.storeOptions.find(opt => opt.value === value);
    return option?.label || '请选择门店';
  },

  // 获取高补餐文本
  getSupplementText(value: string): string {
    const option = this.data.supplementOptions.find(opt => opt.value === value);
    return option?.label || '请选择';
  },

  // 验证表单
  validateForm(): boolean {
    const { formData } = this.data;
    const requiredFields = [
      { field: 'name', name: '客户姓名' },
      { field: 'phone', name: '手机号' },
      { field: 'birthday', name: '生日' },
      { field: 'checkInDate', name: '入住日期' },
      { field: 'totalDays', name: '入住天数' },
      { field: 'store', name: '入住门店' },
      { field: 'room', name: '房间号' },
      { field: 'supplementCount', name: '高补餐次数' }
    ];

    for (const { field, name } of requiredFields) {
      if (!formData[field as keyof FormData]?.trim()) {
        Toast({
          context: this,
          selector: '#t-toast',
          message: `请填写${name}`,
          theme: 'warning',
          direction: 'column',
        });
        return false;
      }
    }

    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(formData.phone)) {
      Toast({
        context: this,
        selector: '#t-toast',
        message: '请输入正确的手机号',
        theme: 'warning',
        direction: 'column',
      });
      return false;
    }

    // 验证入住天数
    const totalDays = parseInt(formData.totalDays);
    if (isNaN(totalDays) || totalDays < 1 || totalDays > 100) {
      Toast({
        context: this,
        selector: '#t-toast',
        message: '入住天数应在1-100天之间',
        theme: 'warning',
        direction: 'column',
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

    // 模拟API调用
    setTimeout(() => {
      this.setData({ submitting: false });
      
      const { isEdit } = this.data;
      const successMessage = isEdit ? '客户信息修改成功！' : '客户添加成功！客户现在可以使用微信登录系统。';
      
      Toast({
        context: this,
        selector: '#t-toast',
        message: successMessage,
        theme: 'success',
        direction: 'column',
      });

      setTimeout(() => {
        this.goBack();
      }, 1500);
    }, 2000);
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
  }
});
