/**
 * 创建测试客户的云函数
 * 使用固定的默认值创建测试客户，只需要输入姓名和手机号
 */

const cloud = require('wx-server-sdk');

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 云函数入口函数
 */
exports.main = async (event, context) => {
  const { name, phone } = event;
  
  console.log('接收到创建测试客户请求:', name, phone);
  
  // 验证必要参数
  if (!name || !phone) {
    return {
      success: false,
      message: '姓名和手机号不能为空'
    };
  }
  
  // 验证姓名长度
  if (name.trim().length < 1 || name.trim().length > 20) {
    return {
      success: false,
      message: '姓名长度应在1-20个字符之间'
    };
  }
  
  // 验证手机号格式
  const phoneRegex = /^1[3-9]\d{9}$/;
  if (!phoneRegex.test(phone.trim())) {
    return {
      success: false,
      message: '手机号格式不正确'
    };
  }
  
  try {
    // 检查手机号是否已存在
    console.log('检查手机号是否已存在:', phone);
    const existingUser = await db.collection('users')
      .where({
        phone: phone.trim()
      })
      .get();
    
    if (existingUser.data.length > 0) {
      console.log('手机号已存在:', phone);
      return {
        success: false,
        message: '该手机号已存在，请使用其他手机号'
      };
    }
    
    // 获取管理员信息（用于设置createdBy）
    const wxContext = cloud.getWXContext();
    let adminName = '管理员'; // 默认值
    
    try {
      // 尝试获取当前用户信息
      const adminResult = await db.collection('users')
        .where({
          openid: wxContext.OPENID,
          userType: 'admin'
        })
        .get();
      
      if (adminResult.data.length > 0) {
        adminName = adminResult.data[0].name || '管理员';
      }
    } catch (adminError) {
      console.log('获取管理员信息失败，使用默认值:', adminError);
    }
    
    // 构建测试客户数据（使用固定的默认值）
    const testCustomerData = {
      name: name.trim(),
      phone: phone.trim(),
      birthday: '1992-09-23',
      userType: 'customer',
      isAdmin: false,
      status: 'active',
      room: '301',
      checkInDate: '2026-01-01',
      totalDays: 28,
      store: '爱睦·梅溪湖店',
      dietPreference: '要退奶',
      supplementCount: 4,
      isMock: false,
      familyBreakfastCnt: 0,
      familyMainMealCnt: 0,
      freeFamilyMealCount: 10,
      createdBy: adminName,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    console.log('准备创建测试客户:', testCustomerData);
    
    // 保存到数据库
    const result = await db.collection('users').add({
      data: testCustomerData
    });
    
    console.log('✅ 测试客户创建成功，ID:', result._id);
    
    return {
      success: true,
      message: '测试客户创建成功',
      customerId: result._id,
      customerInfo: {
        name: testCustomerData.name,
        phone: testCustomerData.phone,
        room: testCustomerData.room,
        store: testCustomerData.store,
        createdBy: testCustomerData.createdBy
      }
    };
    
  } catch (error) {
    console.error('创建测试客户失败:', error);
    return {
      success: false,
      message: '创建测试客户失败: ' + error.message
    };
  }
};
