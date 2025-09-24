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
    
    // 4. 如果订单包含高补餐，恢复用户的次数
    if (hasSupplementMeal) {
      console.log('正在恢复用户次数...');
      
      try {
        // 获取用户当前信息
        const userResult = await db.collection('users')
          .doc(userId)
          .get();
        
        if (userResult.data) {
          const updateData = { updatedAt: new Date() };
          let supplementCountRestored = false;
          let newSupplementCount = userResult.data.supplementCount || 0;
          
          // 恢复高补餐次数
          if (hasSupplementMeal) {
            newSupplementCount = newSupplementCount + 1;
            updateData.supplementCount = newSupplementCount;
            supplementCountRestored = true;
            console.log(`✅ 准备恢复高补餐次数: ${userResult.data.supplementCount || 0} -> ${newSupplementCount}`);
          }
          
          // 更新用户次数
          await db.collection('users')
            .doc(userId)
            .update({
              data: updateData
            });
          
          console.log('✅ 用户次数恢复成功:', updateData);
          
          let message = '订单取消成功';
          if (supplementCountRestored) {
            message += '，高补餐次数已恢复';
          } 
          
          return {
            success: true,
            message: message,
            orderId: orderId,
            supplementCountRestored: supplementCountRestored,
            newSupplementCount: newSupplementCount,
            cancelledOrder: {
              orderId: orderId,
              orderDate: order.orderDate,
              orderDetails: order.order_details
            }
          };
        } else {
          console.warn('⚠️ 用户信息不存在，无法恢复次数');
          return {
            success: true,
            message: '订单取消成功，但无法恢复次数',
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
        console.error('❌ 恢复次数失败:', updateError);
        return {
          success: true,
          message: '订单取消成功，但次数恢复失败',
          orderId: orderId,
          supplementCountRestored: false,
          error: '次数恢复失败: ' + updateError.message,
          cancelledOrder: {
            orderId: orderId,
            orderDate: order.orderDate,
            orderDetails: order.order_details
          }
        };
      }
    } else {
      // 订单不包含高补餐，正常返回
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
