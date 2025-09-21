/**
 * 取消订单的云函数
 * 功能：删除指定订单，如果订单包含高补餐则恢复用户的supplementCount
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
  const { orderId, userId } = event;
  
  console.log('取消订单请求 - 订单ID:', orderId, '用户ID:', userId);
  
  // 参数验证
  if (!orderId) {
    return {
      success: false,
      message: '订单ID不能为空'
    };
  }
  
  if (!userId) {
    return {
      success: false,
      message: '用户ID不能为空'
    };
  }
  
  try {
    // 1. 获取订单信息
    console.log('正在获取订单信息...');
    const orderResult = await db.collection('orders')
      .doc(orderId)
      .get();
    
    if (!orderResult.data) {
      return {
        success: false,
        message: '订单不存在'
      };
    }
    
    const order = orderResult.data;
    console.log('订单信息:', order);
    
    // 验证订单所有者
    if (order.userId !== userId) {
      return {
        success: false,
        message: '无权限取消此订单'
      };
    }
    
    // 验证订单状态（只能取消pending状态的订单）
    if (order.status !== 'pending') {
      return {
        success: false,
        message: '只能取消待确认状态的订单'
      };
    }
    
    // 2. 检查订单是否包含高补餐和陪人餐
    let hasSupplementMeal = false;
    let hasFamilyMeals = false;
    let totalFamilyMeals = 0;
    let extraFamilyBreakfastCnt = 0;
    let extraFamilyMainMealCnt = 0;
    
    if (order.order_details && order.order_details.supplement) {
      hasSupplementMeal = true;
      console.log('订单包含高补餐:', order.order_details.supplement);
    }
    
    if (order.order_details && order.order_details.family_meals) {
      hasFamilyMeals = true;
      const familyMeals = order.order_details.family_meals;
      totalFamilyMeals = (familyMeals.breakfast || 0) + (familyMeals.lunch || 0) + (familyMeals.dinner || 0);
      console.log('订单包含陪人餐:', familyMeals, '总计:', totalFamilyMeals, '份');
      
      // 获取额外收费的陪人餐信息
      extraFamilyBreakfastCnt = order.extraFamilyBreakfastCnt || 0;
      extraFamilyMainMealCnt = order.extraFamilyMainMealCnt || 0;
      
      console.log(`额外收费陪人餐：早餐 ${extraFamilyBreakfastCnt} 份，午晚餐 ${extraFamilyMainMealCnt} 份`);
    }
    
    // 3. 删除订单
    console.log('正在删除订单...');
    await db.collection('orders')
      .doc(orderId)
      .remove();
    
    console.log('订单删除成功');
    
    // 4. 如果订单包含高补餐或陪人餐，恢复用户的次数
    if (hasSupplementMeal || hasFamilyMeals) {
      console.log('正在恢复用户次数...');
      
      try {
        // 获取用户当前信息
        const userResult = await db.collection('users')
          .doc(userId)
          .get();
        
        if (userResult.data) {
          const updateData = { updatedAt: new Date() };
          let supplementCountRestored = false;
          let familyMealCountRestored = false;
          let newSupplementCount = userResult.data.supplementCount || 0;
          let newFamilyMealCount = userResult.data.familyMealCount || 0;
          
          // 恢复高补餐次数
          if (hasSupplementMeal) {
            newSupplementCount = newSupplementCount + 1;
            updateData.supplementCount = newSupplementCount;
            supplementCountRestored = true;
            console.log(`✅ 准备恢复高补餐次数: ${userResult.data.supplementCount || 0} -> ${newSupplementCount}`);
          }
          
          // 恢复陪人餐次数
          if (hasFamilyMeals && totalFamilyMeals > 0) {
            // 计算需要恢复的免费陪人餐次数（总数减去额外收费的数量）
            const freeFamilyMealsToRestore = totalFamilyMeals - extraFamilyBreakfastCnt - extraFamilyMainMealCnt;
            
            if (freeFamilyMealsToRestore > 0) {
              newFamilyMealCount = newFamilyMealCount + freeFamilyMealsToRestore;
              updateData.familyMealCount = newFamilyMealCount;
              familyMealCountRestored = true;
              console.log(`✅ 准备恢复免费陪人餐次数: ${userResult.data.familyMealCount || 0} -> ${newFamilyMealCount} (恢复 ${freeFamilyMealsToRestore} 次)`);
            }
            
            // 恢复额外收费的陪人餐次数（从累计计数中减去）
            if (extraFamilyBreakfastCnt > 0) {
              const currentExtraBreakfast = userResult.data.extraFamilyBreakfastCnt || 0;
              const newExtraBreakfast = Math.max(0, currentExtraBreakfast - extraFamilyBreakfastCnt);
              updateData.extraFamilyBreakfastCnt = newExtraBreakfast;
              console.log(`✅ 准备恢复额外早餐陪人餐: ${currentExtraBreakfast} -> ${newExtraBreakfast} (减少 ${extraFamilyBreakfastCnt} 次)`);
            }
            
            if (extraFamilyMainMealCnt > 0) {
              const currentExtraMainMeal = userResult.data.extraFamilyMainMealCnt || 0;
              const newExtraMainMeal = Math.max(0, currentExtraMainMeal - extraFamilyMainMealCnt);
              updateData.extraFamilyMainMealCnt = newExtraMainMeal;
              console.log(`✅ 准备恢复额外午晚餐陪人餐: ${currentExtraMainMeal} -> ${newExtraMainMeal} (减少 ${extraFamilyMainMealCnt} 次)`);
            }
          }
          
          // 更新用户次数
          await db.collection('users')
            .doc(userId)
            .update({
              data: updateData
            });
          
          console.log('✅ 用户次数恢复成功:', updateData);
          
          let message = '订单取消成功';
          if (supplementCountRestored && familyMealCountRestored) {
            message += '，高补餐和陪人餐次数已恢复';
          } else if (supplementCountRestored) {
            message += '，高补餐次数已恢复';
          } else if (familyMealCountRestored) {
            message += '，陪人餐次数已恢复';
          }
          
          return {
            success: true,
            message: message,
            orderId: orderId,
            supplementCountRestored: supplementCountRestored,
            familyMealCountRestored: familyMealCountRestored,
            newSupplementCount: newSupplementCount,
            newFamilyMealCount: newFamilyMealCount,
            restoredFreeFamilyMeals: totalFamilyMeals - extraFamilyBreakfastCnt - extraFamilyMainMealCnt,
            restoredExtraBreakfast: extraFamilyBreakfastCnt,
            restoredExtraMainMeal: extraFamilyMainMealCnt,
            cancelledOrder: {
              orderId: orderId,
              orderDate: order.orderDate,
              orderDetails: order.order_details,
              extraFamilyBreakfastCnt: extraFamilyBreakfastCnt,
              extraFamilyMainMealCnt: extraFamilyMainMealCnt
            }
          };
        } else {
          console.warn('⚠️ 用户信息不存在，无法恢复次数');
          return {
            success: true,
            message: '订单取消成功，但无法恢复次数',
            orderId: orderId,
            supplementCountRestored: false,
            familyMealCountRestored: false,
            warning: '用户信息不存在',
            cancelledOrder: {
              orderId: orderId,
              orderDate: order.orderDate,
              orderDetails: order.order_details
            }
          };
        }
      } catch (updateError) {
        console.error('❌ 恢复次数失败:', updateError);
        return {
          success: true,
          message: '订单取消成功，但次数恢复失败',
          orderId: orderId,
          supplementCountRestored: false,
          familyMealCountRestored: false,
          error: '次数恢复失败: ' + updateError.message,
          cancelledOrder: {
            orderId: orderId,
            orderDate: order.orderDate,
            orderDetails: order.order_details
          }
        };
      }
    } else {
      // 订单不包含高补餐或陪人餐，正常返回
      return {
        success: true,
        message: '订单取消成功',
        orderId: orderId,
        supplementCountRestored: false,
        familyMealCountRestored: false,
        cancelledOrder: {
          orderId: orderId,
          orderDate: order.orderDate,
          orderDetails: order.order_details
        }
      };
    }
    
  } catch (error) {
    console.error('取消订单失败:', error);
    return {
      success: false,
      message: '取消订单失败',
      error: error.message
    };
  }
};
