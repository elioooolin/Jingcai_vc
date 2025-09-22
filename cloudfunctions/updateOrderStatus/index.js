/**
 * 更新订单状态的云函数
 * 功能：将订单状态从pending更新为confirmed等
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
  const { orderId, newStatus } = event;
  
  console.log('更新订单状态请求 - 订单ID:', orderId, '新状态:', newStatus);
  
  // 参数验证
  if (!orderId) {
    return {
      success: false,
      message: '订单ID不能为空'
    };
  }
  
  if (!newStatus) {
    return {
      success: false,
      message: '新状态不能为空'
    };
  }
  
  // 验证状态值
  const validStatuses = ['pending', 'confirmed'];
  if (!validStatuses.includes(newStatus)) {
    return {
      success: false,
      message: '无效的订单状态'
    };
  }
  
  try {
    // 1. 先获取订单信息，验证订单存在
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
    console.log('订单当前状态:', order.status);
    
    // 2. 更新订单状态
    console.log(`正在将订单状态从 ${order.status} 更新为 ${newStatus}...`);
    await db.collection('orders')
      .doc(orderId)
      .update({
        data: {
          status: newStatus,
          updatedAt: new Date()
        }
      });
    
    console.log('✅ 订单状态更新成功');
    
    // 3. 返回成功结果
    return {
      success: true,
      message: '订单状态更新成功',
      orderId: orderId,
      oldStatus: order.status,
      newStatus: newStatus,
      updatedAt: new Date(),
      orderInfo: {
        orderId: orderId,
        customerName: order.customerName || '未知客户',
        orderDate: order.orderDate,
        store: order.store
      }
    };
    
  } catch (error) {
    console.error('更新订单状态失败:', error);
    return {
      success: false,
      message: '更新订单状态失败',
      error: error.message
    };
  }
};
