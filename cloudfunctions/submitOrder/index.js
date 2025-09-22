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
  const { orderData } = event;
  
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
    let updateErrors = [];
    let needsUserUpdate = false;
    let supplementCountUpdated = false;
    let newSupplementCount = 0;
    
    // 检查是否需要更新高补餐次数
    if (orderData.supplement && orderData.supplement.trim() !== '') {
      supplementCountUpdated = true;
      const currentSupplementCount = user.supplementCount || 0;
      newSupplementCount = currentSupplementCount + 1;
      needsUserUpdate = true;
      console.log(`✅ 需要更新高补餐次数: ${currentSupplementCount} -> ${newSupplementCount}`);
    }
    
    // 计算陪人餐次数
    let familyBreakfastCnt = 0;
    let familyMainMealCnt = 0;
    
    if (orderData.familyMeals) {
      familyBreakfastCnt = orderData.familyMeals.breakfast || 0;
      const familyLunchCnt = orderData.familyMeals.lunch || 0;
      const familyDinnerCnt = orderData.familyMeals.dinner || 0;
      familyMainMealCnt = familyLunchCnt + familyDinnerCnt;
      
      if (familyBreakfastCnt > 0 || familyMainMealCnt > 0) {
        needsUserUpdate = true;
        console.log(`✅ 需要累加陪人餐次数: 早餐 ${familyBreakfastCnt} 份，午晚餐 ${familyMainMealCnt} 份`);
      }
    }
    
    // 更新用户次数
    if (needsUserUpdate) {
      try {
        const updateData = { updatedAt: new Date() };
        if (supplementCountUpdated) {
          updateData.supplementCount = newSupplementCount;
        }
        // 累加陪人餐次数到用户记录中
        if (familyBreakfastCnt > 0) {
          const currentFamilyBreakfast = user.familyBreakfastCnt || 0;
          updateData.familyBreakfastCnt = currentFamilyBreakfast + familyBreakfastCnt;
        }
        if (familyMainMealCnt > 0) {
          const currentFamilyMainMeal = user.familyMainMealCnt || 0;
          updateData.familyMainMealCnt = currentFamilyMainMeal + familyMainMealCnt;
        }
        
        await db.collection('users')
          .doc(orderData.userId)
          .update({
            data: updateData
          });
        
        console.log('✅ 用户次数更新成功:', updateData);
      } catch (updateError) {
        console.error('❌ 更新用户次数失败:', updateError);
        updateErrors.push('数据库更新失败: ' + updateError.message);
      }
    }
    
    // 更新订单的陪人餐信息
    if (familyBreakfastCnt > 0 || familyMainMealCnt > 0) {
      try {
        await db.collection('orders')
          .doc(result._id)
          .update({
            data: {
              familyBreakfastCnt: familyBreakfastCnt,
              familyMainMealCnt: familyMainMealCnt,
              updatedAt: new Date()
            }
          });
        
        console.log('✅ 订单陪人餐信息更新成功');
      } catch (updateError) {
        console.error('❌ 更新订单陪人餐信息失败:', updateError);
        updateErrors.push('订单陪人餐信息更新失败: ' + updateError.message);
      }
    }
    
    return {
      success: true,
      message: updateErrors.length > 0 ? '订单提交成功，但部分次数更新失败' : '订单提交成功',
      orderId: result._id,
      orderData: orderEntry,
      supplementCountUpdated: supplementCountUpdated,
      newSupplementCount: newSupplementCount,
      familyBreakfastCnt: familyBreakfastCnt,
      familyMainMealCnt: familyMainMealCnt,
      errors: updateErrors.length > 0 ? updateErrors : undefined
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
  
  // 早餐
  if (orderData.breakfast && orderData.breakfast.trim() !== '') {
    details.breakfast = orderData.breakfast.trim();
  }
  
  // 午餐
  if (orderData.lunch && Array.isArray(orderData.lunch)) {
    const lunchItems = orderData.lunch.filter(item => item && item.trim() !== '');
    if (lunchItems.length > 0) {
      details.lunch = lunchItems;
    }
  }
  
  // 晚餐
  if (orderData.dinner && Array.isArray(orderData.dinner)) {
    const dinnerItems = orderData.dinner.filter(item => item && item.trim() !== '');
    if (dinnerItems.length > 0) {
      details.dinner = dinnerItems;
    }
  }
  
  // 高补餐
  if (orderData.supplement && orderData.supplement.trim() !== '') {
    details.supplement = orderData.supplement.trim();
  }
  
  // 陪人餐
  if (orderData.familyMeals) {
    const familyMeals = {};
    if (orderData.familyMeals.breakfast && orderData.familyMeals.breakfast > 0) {
      familyMeals.breakfast = orderData.familyMeals.breakfast;
    }
    if (orderData.familyMeals.lunch && orderData.familyMeals.lunch > 0) {
      familyMeals.lunch = orderData.familyMeals.lunch;
    }
    if (orderData.familyMeals.dinner && orderData.familyMeals.dinner > 0) {
      familyMeals.dinner = orderData.familyMeals.dinner;
    }
    
    if (Object.keys(familyMeals).length > 0) {
      details.family_meals = familyMeals;
    }
  }
  
  // 特殊需求
  if (orderData.specialRequirements && orderData.specialRequirements.trim() !== '') {
    details.special_requirements = orderData.specialRequirements.trim();
  }
  
  return details;
}