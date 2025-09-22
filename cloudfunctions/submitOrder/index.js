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
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    console.log('准备保存的订单数据:', orderEntry);
    
    // 保存订单到数据库
    const result = await db.collection('orders').add({
      data: orderEntry
    });
    
    console.log('订单保存成功，ID:', result._id);
    
    // 处理高补餐和陪人餐的扣减
    let supplementCountUpdated = false;
    let newSupplementCount = user.supplementCount || 0;
    let updateErrors = [];
    
    // 处理高补餐扣减
    if (orderEntry.order_details.supplement) {
      console.log('订单包含高补餐，开始扣减用户 supplementCount...');
      
      try {
        const currentSupplementCount = user.supplementCount || 0;
        console.log('用户当前 supplementCount:', currentSupplementCount);
        
        if (currentSupplementCount > 0) {
          newSupplementCount = currentSupplementCount - 1;
          supplementCountUpdated = true;
          console.log(`✅ 准备将用户 supplementCount 从 ${currentSupplementCount} 扣减为 ${newSupplementCount}`);
        } else {
          console.warn('⚠️ 用户 supplementCount 为 0，无法扣减');
          updateErrors.push('用户高补餐次数不足');
        }
      } catch (error) {
        console.error('❌ 处理高补餐扣减时出错:', error);
        updateErrors.push('高补餐次数处理失败: ' + error.message);
      }
    }
    
    // 处理陪人餐累计
    const breakfastFamilyMeals = orderData.familyMeals?.breakfast || 0;
    const lunchFamilyMeals = orderData.familyMeals?.lunch || 0;
    const dinnerFamilyMeals = orderData.familyMeals?.dinner || 0;
    const totalFamilyMeals = breakfastFamilyMeals + lunchFamilyMeals + dinnerFamilyMeals;
    
    // 新的字段名
    let familyBreakfastCnt = 0;
    let familyMainMealCnt = 0;
    let familyMealCountUpdated = false;
    
    if (totalFamilyMeals > 0) {
      console.log(`订单包含 ${totalFamilyMeals} 份陪人餐（早餐${breakfastFamilyMeals}份，午餐${lunchFamilyMeals}份，晚餐${dinnerFamilyMeals}份）`);
      
      try {
        // 直接累计到用户的陪人餐次数中，freeFamilyMealCount不变
        familyBreakfastCnt = breakfastFamilyMeals;
        familyMainMealCnt = lunchFamilyMeals + dinnerFamilyMeals;
        
        if (familyBreakfastCnt > 0 || familyMainMealCnt > 0) {
          familyMealCountUpdated = true;
          console.log(`✅ 本次订单陪人餐：早餐 ${familyBreakfastCnt} 份，午晚餐 ${familyMainMealCnt} 份`);
        }
        
      } catch (error) {
        console.error('❌ 处理陪人餐累计时出错:', error);
        updateErrors.push('陪人餐次数处理失败: ' + error.message);
      }
    }
    
    // 执行数据库更新
    const needsUserUpdate = supplementCountUpdated || familyMealCountUpdated;
    
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
    
    // 返回结果
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
    console.error('提交订单失败:', error);
    return {
      success: false,
      message: '订单提交失败',
      error: error.message
    };
  }
};

/**
 * 格式化订单详情，按照 menu-data.js 中的格式
 * @param {Object} orderData 前端传来的订单数据
 * @param {Object} user 用户信息（包含饮食偏好）
 * @returns {Object} 格式化后的订单详情
 */
function formatOrderDetails(orderData, user) {
  const order_details = {};
  
  // 早餐 - 单选，存储菜品名称
  if (orderData.breakfast && orderData.breakfast.length > 0) {
    order_details.breakfast = orderData.breakfast[0].name;
  }
  
  // 午餐 - 多选，存储菜品名称数组
  const lunchDishes = [];
  if (orderData.lunchMain && orderData.lunchMain.length > 0) {
    lunchDishes.push(...orderData.lunchMain.map(item => item.name));
  }
  if (orderData.lunchSoup && orderData.lunchSoup.length > 0) {
    lunchDishes.push(...orderData.lunchSoup.map(item => item.name));
  }
  if (lunchDishes.length > 0) {
    order_details.lunch = lunchDishes;
  }
  
  // 晚餐 - 多选，存储菜品名称数组
  const dinnerDishes = [];
  if (orderData.dinnerMain && orderData.dinnerMain.length > 0) {
    dinnerDishes.push(...orderData.dinnerMain.map(item => item.name));
  }
  if (orderData.dinnerSoup && orderData.dinnerSoup.length > 0) {
    dinnerDishes.push(...orderData.dinnerSoup.map(item => item.name));
  }
  if (dinnerDishes.length > 0) {
    order_details.dinner = dinnerDishes;
  }
  
  // 高补餐 - 单选，存储菜品名称
  if (orderData.supplement && orderData.supplement.length > 0) {
    order_details.supplement = orderData.supplement[0].name;
  }
  
  // 陪人餐 - 存储各餐的陪人餐数量
  if (orderData.familyMeals) {
    const familyMeals = {};
    if (orderData.familyMeals.breakfast > 0) {
      familyMeals.breakfast = orderData.familyMeals.breakfast;
    }
    if (orderData.familyMeals.lunch > 0) {
      familyMeals.lunch = orderData.familyMeals.lunch;
    }
    if (orderData.familyMeals.dinner > 0) {
      familyMeals.dinner = orderData.familyMeals.dinner;
    }
    
    // 只有当有陪人餐时才添加到订单详情中
    if (Object.keys(familyMeals).length > 0) {
      order_details.family_meals = familyMeals;
    }
  }
  
  // 特殊需求 - 合并用户输入的特殊需求和用户的饮食偏好
  const specialRequirements = [];
  
  // 添加用户的饮食偏好（如果存在且不为空）
  if (user && user.dietPreference && user.dietPreference.trim()) {
    specialRequirements.push(user.dietPreference.trim());
  }
  
  // 添加用户输入的特殊需求（如果存在且不为空）
  if (orderData.specialRequirements && orderData.specialRequirements.trim()) {
    specialRequirements.push(orderData.specialRequirements.trim());
  }
  
  // 如果有任何特殊需求，则合并并保存
  if (specialRequirements.length > 0) {
    order_details.special_requirements = specialRequirements.join('；');
  }
  
  console.log('合并后的特殊需求:', order_details.special_requirements);
  
  console.log('格式化后的订单详情:', order_details);
  
  return order_details;
}
