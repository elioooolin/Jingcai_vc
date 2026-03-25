/**
 * 提交订单的云函数
 * 将用户的点餐数据保存到 orders 集合中
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
  const { orderData, sessionToken } = event;
  
  console.log('接收到订单提交请求:', orderData);
  
  // 验证必要参数
  if (!orderData) {
    return {
      success: false,
      message: '订单数据不能为空'
    };
  }
  
  if (!orderData.userId) {
    return {
      success: false,
      message: '用户ID不能为空'
    };
  }
  
  if (!orderData.orderDate) {
    return {
      success: false,
      message: '订单日期不能为空'
    };
  }
  
  try {
    const currentUser = await getCurrentUser({ db, cloud, sessionToken });
    if (!currentUser || currentUser.role !== 'customer') {
      return {
        success: false,
        message: '仅已登记客户可提交订单'
      };
    }

    if (currentUser._id !== orderData.userId) {
      return {
        success: false,
        message: '无权为其他用户提交订单'
      };
    }

    // 获取用户信息（用于获取手机号）
    const userResult = await db.collection('users')
      .doc(orderData.userId)
      .get();
    
    if (!userResult.data) {
      return {
        success: false,
        message: '用户不存在'
      };
    }
    
    const user = userResult.data;
    
    // 构建符合 database.json 格式的订单数据
    const orderEntry = {
      userId: orderData.userId,
      phone: user.phone || '',
      store: user.store || '', // 添加门店信息
      orderDate: new Date(orderData.orderDate),
      order_details: formatOrderDetails(orderData, user),
      status: 'pending',
      isMock: user.isMock === true, // 如果用户是测试用户，订单也标记为测试订单
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    console.log('准备保存的订单数据:', orderEntry);
    
    // 保存订单到数据库
    const result = await db.collection('orders').add({
      data: orderEntry
    });
    
    console.log('订单保存成功，订单ID:', result._id);
    
    // 处理用户次数更新
    let updateError = null;
    let needsUserUpdate = false;
    let supplementCountUpdated = false;
    let newSupplementCount = 0;
    
    // 检查是否需要更新高补餐次数
    if (orderData.supplement && Array.isArray(orderData.supplement) && orderData.supplement.length > 0 && orderData.supplement[0].name.trim() !== '') {
      supplementCountUpdated = true;
      const currentSupplementCount = user.supplementCount || 0;
      newSupplementCount = currentSupplementCount - 1;
      needsUserUpdate = true;
      console.log(`✅ 需要更新高补餐次数: ${currentSupplementCount} -> ${newSupplementCount}`);
    }
    
    
    // 更新用户次数
    if (needsUserUpdate) {
      try {
        const updateData = { updatedAt: new Date() };
        if (supplementCountUpdated) {
          updateData.supplementCount = newSupplementCount;
        }
        await db.collection('users')
          .doc(orderData.userId)
          .update({
            data: updateData
          });
        console.log('✅ 用户高补餐次数更新成功:', updateData);
      } catch (error) {
        console.error('❌ 更新用户次数失败:', error);
        updateError = error;
      }
    }
    
    return {
      success: true,
      message: updateError ? '订单提交成功，但高补餐次数更新失败' : '订单提交成功',
      orderId: result._id,
      orderData: orderEntry,
      supplementCountUpdated: supplementCountUpdated,
      newSupplementCount: newSupplementCount,
      error: updateError
    };
    
  } catch (error) {
    console.error('订单提交失败:', error);
    return {
      success: false,
      message: '订单提交失败: ' + error.message
    };
  }
};

/**
 * 格式化订单详情
 */
function formatOrderDetails(orderData, user) {
  const details = {};
  
  // 早餐 - 处理数组格式，提取name字段
  if (orderData.breakfast && Array.isArray(orderData.breakfast) && orderData.breakfast.length > 0) {
    const breakfastItem = orderData.breakfast[0];
    if (breakfastItem && breakfastItem.name && breakfastItem.name.trim() !== '') {
      details.breakfast = breakfastItem.name.trim();
    }
  }
  
  // 午餐 - 合并lunchMain、lunch和lunchSoup数组，提取name字段
  const lunchItems = [];
  // 处理lunchMain字段（主菜）
  if (orderData.lunchMain && Array.isArray(orderData.lunchMain)) {
    orderData.lunchMain.forEach(item => {
      if (item && item.name && item.name.trim() !== '') {
        lunchItems.push(item.name.trim());
      }
    });
  }
  // 处理lunchSoup字段（汤品）
  if (orderData.lunchSoup && Array.isArray(orderData.lunchSoup)) {
    orderData.lunchSoup.forEach(item => {
      if (item && item.name && item.name.trim() !== '') {
        lunchItems.push(item.name.trim());
      }
    });
  }
  if (lunchItems.length > 0) {
    details.lunch = lunchItems;
  }
  
  // 晚餐 - 合并dinnerMain和dinnerSoup数组，提取name字段
  const dinnerItems = [];
  if (orderData.dinnerMain && Array.isArray(orderData.dinnerMain)) {
    orderData.dinnerMain.forEach(item => {
      if (item && item.name && item.name.trim() !== '') {
        dinnerItems.push(item.name.trim());
      }
    });
  }
  if (orderData.dinnerSoup && Array.isArray(orderData.dinnerSoup)) {
    orderData.dinnerSoup.forEach(item => {
      if (item && item.name && item.name.trim() !== '') {
        dinnerItems.push(item.name.trim());
      }
    });
  }
  if (dinnerItems.length > 0) {
    details.dinner = dinnerItems;
  }
  
  // 高补餐 - 处理数组格式，提取name字段
  if (orderData.supplement && Array.isArray(orderData.supplement) && orderData.supplement.length > 0) {
    const supplementItem = orderData.supplement[0];
    if (supplementItem && supplementItem.name && supplementItem.name.trim() !== '') {
      details.supplement = supplementItem.name.trim();
    }
  }
  
  // 特殊需求 - 合并用户饮食偏好和订单特殊需求
  const specialRequirements = [];
  
  // 添加用户饮食偏好
  if (user.dietPreference && user.dietPreference.trim() !== '') {
    specialRequirements.push(user.dietPreference.trim());
  }
  
  // 添加订单特殊需求
  if (orderData.specialRequirements && orderData.specialRequirements.trim() !== '') {
    specialRequirements.push(orderData.specialRequirements.trim());
  }
  
  // 如果有特殊需求，合并为一个字符串
  if (specialRequirements.length > 0) {
    details.special_requirements = specialRequirements.join('；');
  }
  
  console.log('格式化后的订单详情:', details);
  return details;
}

async function getCurrentUser({ db, cloud, sessionToken }) {
  if (sessionToken) {
    const sessionResult = await db.collection('user_sessions').where({
      sessionToken,
      isActive: true
    }).get();

    if (sessionResult.data.length > 0) {
      const session = sessionResult.data[0];
      const isExpired = !session.expiresAt || new Date(session.expiresAt).getTime() <= Date.now();

      if (!isExpired && session.isRegistered && session.userId) {
        const userDoc = await db.collection('users').doc(session.userId).get();
        if (userDoc.data && userDoc.data.status === 'active') {
          return {
            ...userDoc.data,
            role: getUserRole(userDoc.data),
            openid: session.openid
          };
        }
      }
    }
  }

  const wxContext = cloud.getWXContext();
  if (!wxContext.OPENID) {
    return null;
  }

  const authResult = await db.collection('auth').where({
    _openid: wxContext.OPENID
  }).get();

  if (authResult.data.length === 0 || !authResult.data[0].phone) {
    return null;
  }

  const userResult = await db.collection('users').where({
    phone: authResult.data[0].phone,
    status: 'active'
  }).get();

  if (userResult.data.length === 0) {
    return null;
  }

  return {
    ...userResult.data[0],
    role: getUserRole(userResult.data[0]),
    openid: wxContext.OPENID
  };
}

function getUserRole(user) {
  if (user.role) return user.role;
  if (user.isAdmin === true || user.userType === 'admin') return 'admin';
  if (user.userType === 'staff') return 'staff';
  return 'customer';
}
