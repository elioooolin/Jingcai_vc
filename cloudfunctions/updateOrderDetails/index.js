/**
 * 更新订单详情的云函数
 * 功能：允许管理员修改订单中的菜品名称和特殊需求，但不能修改陪人餐和高补餐
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
  const { orderId, updatedOrderDetails } = event;
  
  console.log('更新订单详情请求 - 订单ID:', orderId);
  console.log('更新的订单详情:', JSON.stringify(updatedOrderDetails, null, 2));
  
  // 参数验证
  if (!orderId) {
    return {
      success: false,
      message: '订单ID不能为空'
    };
  }
  
  if (!updatedOrderDetails) {
    return {
      success: false,
      message: '订单详情不能为空'
    };
  }
  
  try {
    // 1. 获取原始订单信息
    console.log('正在获取原始订单信息...');
    const orderResult = await db.collection('orders')
      .doc(orderId)
      .get();
    
    if (!orderResult.data) {
      return {
        success: false,
        message: '订单不存在'
      };
    }
    
    const originalOrder = orderResult.data;
    const originalOrderDetails = originalOrder.order_details || {};
    
    console.log('原始订单详情:', JSON.stringify(originalOrderDetails, null, 2));
    
    // 2. 构建新的订单详情，保留陪人餐和高补餐信息
    const newOrderDetails = {
      // 保留原始的陪人餐信息（不允许修改）
      family_meals: originalOrderDetails.family_meals,
      
      // 保留原始的高补餐信息（不允许修改）
      supplement: originalOrderDetails.supplement,
      
      // 允许修改的菜品信息
      breakfast: updatedOrderDetails.breakfast || originalOrderDetails.breakfast,
      lunch: updatedOrderDetails.lunch || originalOrderDetails.lunch,
      dinner: updatedOrderDetails.dinner || originalOrderDetails.dinner,
      
      // 允许修改的特殊需求
      special_requirements: updatedOrderDetails.special_requirements || originalOrderDetails.special_requirements
    };
    
    console.log('合并后的订单详情:', JSON.stringify(newOrderDetails, null, 2));
    
    // 3. 更新订单详情
    console.log('正在更新订单详情...');
    await db.collection('orders')
      .doc(orderId)
      .update({
        data: {
          order_details: newOrderDetails,
          updatedAt: new Date()
        }
      });
    
    console.log('✅ 订单详情更新成功');
    
    // 4. 返回成功结果
    return {
      success: true,
      message: '订单详情更新成功',
      orderId: orderId,
      updatedOrderDetails: newOrderDetails,
      updatedAt: new Date(),
      orderInfo: {
        orderId: orderId,
        customerName: originalOrder.customerName || '未知客户',
        orderDate: originalOrder.orderDate,
        store: originalOrder.store
      }
    };
    
  } catch (error) {
    console.error('更新订单详情失败:', error);
    return {
      success: false,
      message: '更新订单详情失败',
      error: error.message
    };
  }
};
