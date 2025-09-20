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
      orderDate: new Date(orderData.orderDate),
      order_details: formatOrderDetails(orderData),
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
    
    // 如果订单包含高补餐，需要扣减用户的 supplementCount
    if (orderEntry.order_details.supplement) {
      console.log('订单包含高补餐，开始扣减用户 supplementCount...');
      
      try {
        // 获取用户当前的 supplementCount
        const currentSupplementCount = user.supplementCount || 0;
        console.log('用户当前 supplementCount:', currentSupplementCount);
        
        if (currentSupplementCount > 0) {
          // 扣减 supplementCount
          const newSupplementCount = currentSupplementCount - 1;
          
          await db.collection('users')
            .doc(orderData.userId)
            .update({
              data: {
                supplementCount: newSupplementCount,
                updatedAt: new Date()
              }
            });
          
          console.log(`✅ 用户 supplementCount 已从 ${currentSupplementCount} 扣减为 ${newSupplementCount}`);
          
          return {
            success: true,
            message: '订单提交成功',
            orderId: result._id,
            orderData: orderEntry,
            supplementCountUpdated: true,
            newSupplementCount: newSupplementCount
          };
        } else {
          console.warn('⚠️ 用户 supplementCount 为 0，无法扣减');
          
          return {
            success: true,
            message: '订单提交成功，但高补餐次数不足',
            orderId: result._id,
            orderData: orderEntry,
            supplementCountUpdated: false,
            warning: '用户高补餐次数不足'
          };
        }
        
      } catch (updateError) {
        console.error('❌ 更新用户 supplementCount 失败:', updateError);
        
        // 订单已保存成功，但 supplementCount 更新失败
        // 这种情况需要记录错误，但不影响订单提交的成功状态
        return {
          success: true,
          message: '订单提交成功，但高补餐次数更新失败',
          orderId: result._id,
          orderData: orderEntry,
          supplementCountUpdated: false,
          error: '高补餐次数更新失败: ' + updateError.message
        };
      }
    } else {
      // 订单不包含高补餐，正常返回
      return {
        success: true,
        message: '订单提交成功',
        orderId: result._id,
        orderData: orderEntry,
        supplementCountUpdated: false
      };
    }
    
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
 * @returns {Object} 格式化后的订单详情
 */
function formatOrderDetails(orderData) {
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
  
  // 特殊需求
  if (orderData.specialRequirements && orderData.specialRequirements.trim()) {
    order_details.special_requirements = orderData.specialRequirements.trim();
  }
  
  console.log('格式化后的订单详情:', order_details);
  
  return order_details;
}
