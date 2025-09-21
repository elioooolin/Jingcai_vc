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
    
    // 2. 检查订单是否包含高补餐
    let hasSupplementMeal = false;
    if (order.order_details && order.order_details.supplement) {
      hasSupplementMeal = true;
      console.log('订单包含高补餐:', order.order_details.supplement);
    }
    
    // 3. 删除订单
    console.log('正在删除订单...');
    await db.collection('orders')
      .doc(orderId)
      .remove();
    
    console.log('订单删除成功');
    
    // 4. 如果订单包含高补餐，恢复用户的supplementCount
    if (hasSupplementMeal) {
      console.log('正在恢复用户高补餐次数...');
      
      try {
        // 获取用户当前信息
        const userResult = await db.collection('users')
          .doc(userId)
          .get();
        
        if (userResult.data) {
          const currentSupplementCount = userResult.data.supplementCount || 0;
          const newSupplementCount = currentSupplementCount + 1;
          
          // 更新用户的supplementCount
          await db.collection('users')
            .doc(userId)
            .update({
              data: {
                supplementCount: newSupplementCount,
                updatedAt: new Date()
              }
            });
          
          console.log(`✅ 用户高补餐次数已从 ${currentSupplementCount} 恢复为 ${newSupplementCount}`);
          
          return {
            success: true,
            message: '订单取消成功，高补餐次数已恢复',
            orderId: orderId,
            supplementCountRestored: true,
            newSupplementCount: newSupplementCount,
            cancelledOrder: {
              orderId: orderId,
              orderDate: order.orderDate,
              orderDetails: order.order_details
            }
          };
        } else {
          console.warn('⚠️ 用户信息不存在，无法恢复高补餐次数');
          return {
            success: true,
            message: '订单取消成功，但无法恢复高补餐次数',
            orderId: orderId,
            supplementCountRestored: false,
            warning: '用户信息不存在',
            cancelledOrder: {
              orderId: orderId,
              orderDate: order.orderDate,
              orderDetails: order.order_details
            }
          };
        }
      } catch (updateError) {
        console.error('❌ 恢复高补餐次数失败:', updateError);
        return {
          success: true,
          message: '订单取消成功，但高补餐次数恢复失败',
          orderId: orderId,
          supplementCountRestored: false,
          error: '高补餐次数恢复失败: ' + updateError.message,
          cancelledOrder: {
            orderId: orderId,
            orderDate: order.orderDate,
            orderDetails: order.order_details
          }
        };
      }
    } else {
      // 没有高补餐的情况
      return {
        success: true,
        message: '订单取消成功',
        orderId: orderId,
        supplementCountRestored: false,
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
